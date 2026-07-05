'use strict';
const config = require('../config');
const log = require('../lib/logger').scope('alerts');
const adapters = require('../adapters');
const { Users, Settings, Phones, Watches, Alerts } = require('../db/models');
const notifier = require('./notifier');

const SAR = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })} ريال`;

// مفتاح منع التكرار: نفس المستخدم + المنتج + المتجر + شريحة السعر (لكل 24 ساعة)
function dedupKey(userId, phoneId, store, price) {
  const bucket = Math.round(Number(price) / 25) * 25; // شريحة 25 ريال
  return `${userId || 'admin'}:${phoneId}:${store}:${bucket}`;
}

/**
 * يبني رسالة تنبيه من نتيجة التحليل.
 */
function buildMessage(phone, analysis, extraReason) {
  const { stats, discount, deal, listing } = analysis;
  const ref = stats.avg30 || stats.avg90 || stats.max;
  const title = `🔥 عرض ${deal.tier} على ${Phones.fullName(phone)}`;
  const lines = [
    `المتجر: ${adapters.label(listing.store)}`,
    `السعر السابق/المتوسط: ${ref ? SAR(ref) : '—'}`,
    `السعر الحالي: ${SAR(stats.current)}`,
    `الخصم الحقيقي: ${discount.real.toFixed(2)}%`,
    `Deal Score: ${deal.score}/100 (${deal.tier})`,
    `السبب: ${extraReason || analysis.reason}`,
  ];
  return { title, lines, url: listing.product_url };
}

/**
 * يقيّم عرض متجر مقابل متابعة مستخدم ويحدد نوع التنبيه المستحق (أو null).
 */
function evaluateForWatch(watch, analysis) {
  const { stats, discount, deal } = analysis;
  if (analysis.suspicious.suspicious) {
    // لا نطلق تنبيه "فرصة" على خصم مشكوك فيه إلا لو كسر أقل سعر تاريخي فعلًا
    if (!stats.isAllTimeLow) return null;
  }

  if (watch.alert_target && watch.target_price && stats.current <= watch.target_price) {
    return { kind: 'target', reason: `نزل تحت سعرك المستهدف (${SAR(watch.target_price)})` };
  }
  if (watch.alert_all_time_low && stats.isAllTimeLow) {
    return { kind: 'all_time_low', reason: 'أقل سعر تاريخي مسجّل لهذا الهاتف' };
  }
  if (watch.alert_pct_drop && discount.vsAvg30 !== null && discount.vsAvg30 >= (watch.drop_pct || 15)) {
    return { kind: 'pct_drop', reason: `انخفاض ${discount.vsAvg30.toFixed(1)}% عن متوسط 30 يومًا` };
  }
  if (watch.alert_strong_deal && deal.score >= config.alert.minDealScore) {
    return { kind: 'strong_deal', reason: `عرض قوي — Deal Score ${deal.score}` };
  }
  return null;
}

/**
 * هل يستحق العرض تنبيهًا تلقائيًا (بغض النظر عن المتابعة)؟
 * حسب قواعد التنبيه: خصم حقيقي ≥ 40% أو Deal Score ≥ 70 أو أقل سعر تاريخي.
 */
function qualifiesAsAutoDeal(analysis) {
  const { stats, discount, deal } = analysis;
  if (analysis.suspicious.suspicious && !stats.isAllTimeLow) return false;
  return (
    discount.real >= config.alert.realDiscountPct ||
    deal.score >= config.alert.minDealScore ||
    stats.isAllTimeLow
  );
}

function matchesPrefs(phone, settings) {
  const brands = (settings.preferred_brands || '')
    .split(',')
    .map((b) => b.trim().toLowerCase())
    .filter(Boolean);
  const brandOk = !brands.length || brands.includes(phone.brand.toLowerCase());
  return brandOk;
}

/**
 * يرسل تنبيهًا لمستخدم مع منع التكرار خلال 24 ساعة.
 * @returns {Promise<boolean>} هل أُرسل فعلًا
 */
async function dispatchToUser(user, phone, analysis, kind, reason) {
  const { listing, stats, deal } = analysis;
  const key = dedupKey(user.id, phone.id, listing.store, stats.current);
  const recent = Alerts.recentByDedup(key, 24);
  if (recent) {
    log.debug('تخطّي تنبيه مكرر:', key);
    return false;
  }
  const settings = Settings.get(user.id);
  const msg = buildMessage(phone, analysis, reason);
  const target = { user, settings };
  const okChannels = await notifier.sendMulti(settings.channel, target, msg);

  Alerts.create({
    user_id: user.id,
    phone_id: phone.id,
    listing_id: listing.id,
    kind,
    price: stats.current,
    reason,
    deal_score: deal.score,
    dedup_key: key,
    channels: okChannels.join(','),
  });
  log.info(`تنبيه [${kind}] للمستخدم ${user.email} على ${Phones.fullName(phone)} عبر: ${okChannels.join(',')}`);
  return true;
}

/**
 * المعالجة الكاملة لعرض متجر واحد بعد تحديث سعره:
 * - ينبّه كل متابع تحقق شرطه.
 * - يكتشف العرض التلقائي وينبّه المستخدمين المطابقين لتفضيلاتهم.
 * @param {object} phone
 * @param {object} analysis ناتج analyzeListing
 */
async function processListingUpdate(phone, analysis) {
  let alertsSent = 0;

  // 1) المتابعون
  const watchers = Watches.watchersOf(phone.id);
  for (const w of watchers) {
    const user = Users.byId(w.user_id);
    if (!user) continue;
    const hit = evaluateForWatch(w, analysis);
    if (hit) {
      if (await dispatchToUser(user, phone, analysis, hit.kind, hit.reason)) alertsSent++;
    }
  }

  // 2) الاكتشاف التلقائي — للمستخدمين المطابقين لتفضيلاتهم وغير المتابعين
  if (qualifiesAsAutoDeal(analysis)) {
    const watcherIds = new Set(watchers.map((w) => w.user_id));
    const everyone = require('../db/index').prepare('SELECT id FROM users').all();
    for (const { id } of everyone) {
      if (watcherIds.has(id)) continue; // نبّهناه أعلاه
      const user = Users.byId(id);
      const settings = Settings.get(id);
      if (!matchesPrefs(phone, settings)) continue;
      if (settings.max_price && analysis.stats.current > settings.max_price) continue;
      if (analysis.discount.real < (settings.min_discount_pct || 0) && !analysis.stats.isAllTimeLow) continue;
      if (await dispatchToUser(user, phone, analysis, 'auto_deal', analysis.reason)) alertsSent++;
    }
  }

  return alertsSent;
}

/**
 * تنبيه إداري (فشل adapter مثلًا) — عبر بريد المشرف/تيليجرام المشرف.
 */
async function notifyAdmin(title, lines) {
  const msg = { title, lines: Array.isArray(lines) ? lines : [String(lines)] };
  const target = { user: { email: config.adminEmail }, overrideEmail: config.adminEmail };
  const channels = [];
  if (config.adminEmail) channels.push('email');
  if (config.telegram.adminChatId) channels.push('telegram');
  channels.push('console');
  const ok = await notifier.sendMulti(channels.join(','), target, msg);
  Alerts.create({ kind: 'admin', reason: title, channels: ok.join(',') });
  return ok;
}

module.exports = {
  processListingUpdate,
  dispatchToUser,
  notifyAdmin,
  qualifiesAsAutoDeal,
  evaluateForWatch,
  matchesPrefs,
  buildMessage,
  dedupKey,
};
