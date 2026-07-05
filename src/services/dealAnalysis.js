'use strict';
const { computeStats } = require('./priceStats');
const config = require('../config');

// ===== كشف الخصم الوهمي وحساب الخصم الحقيقي =====
// لا نعتمد على السعر المشطوب (list_price) وحده، بل نقارن بالتاريخ الفعلي.

function pct(from, to) {
  if (!from || from <= 0) return 0;
  return ((from - to) / from) * 100;
}

/**
 * يحسب الخصم الحقيقي مقابل مراجع تاريخية متعددة.
 * @param {object} stats ناتج computeStats
 */
function realDiscount(stats) {
  const cur = stats.current;
  const vs30 = stats.avg30 ? pct(stats.avg30, cur) : null;
  const vs90 = stats.avg90 ? pct(stats.avg90, cur) : null;
  const vsPriorMin = stats.priorMin ? pct(stats.priorMin, cur) : null;
  const vsList = stats.latestListPrice ? pct(stats.latestListPrice, cur) : null;

  // الخصم الحقيقي المعتمد = الأكبر بين مقارنة متوسط 30 و 90 يومًا (الأكثر تمثيلًا)
  const candidates = [vs30, vs90].filter((v) => v !== null);
  const real = candidates.length ? Math.max(...candidates) : vs30 ?? 0;

  return {
    vsAvg30: vs30,
    vsAvg90: vs90,
    vsPriorMin,
    vsListPrice: vsList,
    real: Math.max(0, real),
  };
}

/**
 * يقرر ما إذا كان الخصم المعلن مشكوكًا فيه (وهمي).
 * منطق: السعر المشطوب مرتفع بشكل كبير بينما المتوسط التاريخي قريب من السعر الحالي،
 * أو رُفع السعر ثم خُفض خلال فترة قصيرة.
 */
function isSuspicious(stats, disc) {
  if (!stats.latestListPrice) return { suspicious: false, reason: null };
  const claimed = pct(stats.latestListPrice, stats.current); // الخصم المعلن
  const real = disc.real;

  // فجوة كبيرة بين الخصم المعلن والحقيقي => وهمي
  if (claimed >= 20 && real < claimed * 0.5) {
    return {
      suspicious: true,
      reason: `الخصم المعلن ${claimed.toFixed(1)}% لكن الخصم الحقيقي مقابل المتوسط التاريخي ${real.toFixed(1)}% فقط`,
    };
  }
  // ذبذبة عالية جدًا (رفع ثم خفض) مع خصم معلن كبير
  if (stats.volatility !== null && stats.volatility > 0.12 && claimed >= 15 && real < 15) {
    return {
      suspicious: true,
      reason: 'تذبذب سعري كبير خلال الفترة الأخيرة يوحي برفع السعر ثم خفضه',
    };
  }
  return { suspicious: false, reason: null };
}

/**
 * Deal Score من 0 إلى 100 حسب النموذج في المتطلبات.
 * @param {object} stats
 * @param {object} disc ناتج realDiscount
 * @param {object} ctx { listing, matchesPrefs }
 */
function dealScore(stats, disc, ctx = {}) {
  let score = 0;
  const parts = {};

  // 35: نسبة الانخفاض مقابل متوسط 30 يومًا (40%+ => كامل النقاط)
  const drop30 = disc.vsAvg30 || 0;
  parts.drop30 = Math.max(0, Math.min(35, (drop30 / 40) * 35));
  score += parts.drop30;

  // 25: هل السعر الحالي أقل سعر تاريخي؟
  parts.allTimeLow = stats.isAllTimeLow ? 25 : Math.max(0, Math.min(25, (disc.vsPriorMin || 0) * 2.5));
  score += parts.allTimeLow;

  // 15: موثوقية المتجر وتوفر المنتج
  const listing = ctx.listing || {};
  const trust = STORE_TRUST[listing.store] ?? 0.7;
  const inStock = listing.last_in_stock === undefined ? true : !!listing.last_in_stock;
  parts.trust = 15 * trust * (inStock ? 1 : 0.4);
  score += parts.trust;

  // 15: استقرار الانخفاض (ذبذبة منخفضة => نقاط أعلى)
  if (stats.volatility === null) {
    parts.stability = 8; // بيانات غير كافية => محايد
  } else {
    parts.stability = Math.max(0, Math.min(15, 15 * (1 - stats.volatility * 4)));
  }
  score += parts.stability;

  // 10: توافق مع تفضيلات المستخدم
  parts.prefs = ctx.matchesPrefs ? 10 : 0;
  score += parts.prefs;

  score = Math.round(Math.max(0, Math.min(100, score)));

  let tier;
  if (score >= 85) tier = 'ممتاز';
  else if (score >= 70) tier = 'قوي';
  else if (score >= 50) tier = 'جيد';
  else tier = 'عادي';

  return { score, tier, parts };
}

const STORE_TRUST = {
  amazon_sa: 0.95,
  jarir: 0.95,
  noon: 0.9,
  extra: 0.88,
};

/**
 * التحليل الكامل لعرض متجر واحد: يجمع الإحصائيات + الخصم + الشك + السكور + السبب.
 * @returns null إذا لا يوجد تاريخ كافٍ
 */
function analyzeListing(listing, opts = {}) {
  const stats = computeStats(listing.id, opts);
  if (!stats) return null;

  const disc = realDiscount(stats);
  const susp = isSuspicious(stats, disc);
  const deal = dealScore(stats, disc, { listing, matchesPrefs: opts.matchesPrefs });

  // حالة العرض المعروضة للمستخدم
  let status = deal.tier;
  if (susp.suspicious) status = 'مشكوك فيه';

  const reasons = [];
  if (stats.isAllTimeLow) reasons.push('أقل سعر تاريخي مسجّل');
  if (disc.vsAvg90 !== null && disc.vsAvg90 >= config.alert.realDiscountPct)
    reasons.push(`أقل بنسبة ${disc.vsAvg90.toFixed(1)}% من متوسط 90 يومًا`);
  else if (disc.vsAvg30 !== null && disc.vsAvg30 >= 20)
    reasons.push(`أقل بنسبة ${disc.vsAvg30.toFixed(1)}% من متوسط 30 يومًا`);
  if (deal.score >= 70) reasons.push(`Deal Score ${deal.score}/100`);
  if (susp.suspicious) reasons.push(`⚠️ ${susp.reason}`);
  if (!reasons.length) reasons.push('السعر ضمن نطاقه الطبيعي');

  // توصية شراء مختصرة
  let recommendation;
  if (susp.suspicious) recommendation = 'الخصم المعلن مبالغ فيه — الخصم الحقيقي محدود مقارنة بتاريخ السعر.';
  else if (deal.score >= 85) recommendation = 'فرصة شراء ممتازة الآن.';
  else if (deal.score >= 70) recommendation = 'عرض قوي يستحق الشراء.';
  else if (deal.score >= 50) recommendation = 'عرض جيد لكن ليس الأدنى تاريخيًا.';
  else recommendation = 'الأفضل الانتظار — السعر ليس مميزًا حاليًا.';

  return {
    listing,
    stats,
    discount: disc,
    suspicious: susp,
    deal,
    status,
    reason: reasons.join(' · '),
    reasons,
    recommendation,
  };
}

module.exports = { analyzeListing, realDiscount, dealScore, isSuspicious, pct, STORE_TRUST };
