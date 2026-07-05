'use strict';
const config = require('../config');
const log = require('../lib/logger').scope('poller');
const adapters = require('../adapters');
const { Listings, Prices, Phones, PollRuns } = require('../db/models');
const { analyzeListing } = require('../services/dealAnalysis');
const alertEngine = require('../services/alertEngine');

const FAIL_ALERT_THRESHOLD = 3; // بعد كم فشل متتالٍ ننبّه المشرف

/**
 * يجمع أسعار كل العروض النشطة لمتجر واحد.
 */
async function pollStore(storeKey) {
  const adapter = adapters.get(storeKey);
  if (!adapter) return;
  const listings = Listings.byStore(storeKey);
  let succeeded = 0;
  let failed = 0;
  const touched = [];

  for (const listing of listings) {
    try {
      const result = await adapter.fetchPrice(listing);
      if (!result || !result.price) throw new Error('لا يوجد سعر');
      Prices.add(listing.id, {
        price: result.price,
        listPrice: result.listPrice,
        currency: result.currency,
        inStock: result.inStock,
      });
      Listings.recordSuccess(listing.id, {
        price: result.price,
        currency: result.currency,
        inStock: result.inStock,
      });
      succeeded++;
      touched.push(Listings.byId(listing.id));
    } catch (err) {
      failed++;
      const fails = Listings.recordFailure(listing.id);
      log.warn(`فشل جلب ${storeKey} listing#${listing.id}: ${err.message} (فشل متتالٍ: ${fails})`);
      if (fails === FAIL_ALERT_THRESHOLD) {
        await alertEngine.notifyAdmin(`⚠️ فشل جلب السعر ${FAIL_ALERT_THRESHOLD} مرات — ${adapters.label(storeKey)}`, [
          `العرض: listing#${listing.id}`,
          `الرابط: ${listing.product_url}`,
          'قد يحتاج الـ adapter لتحديث المحدّدات أو التبديل إلى API رسمي.',
        ]);
      }
    }
  }

  const ok = failed === 0 || succeeded > 0;
  PollRuns.record({
    store: storeKey,
    ok,
    attempted: listings.length,
    succeeded,
    failed,
    message: `نجح ${succeeded} / فشل ${failed}`,
  });
  log.info(`${adapters.label(storeKey)}: نجح ${succeeded} فشل ${failed} من ${listings.length}`);
  return touched;
}

/**
 * تشغيل دورة جمع كاملة لكل المتاجر ثم تقييم التنبيهات.
 */
async function runPoll() {
  log.info(`بدء دورة الجمع (المصدر: ${config.priceSource})`);
  const allTouched = [];
  for (const key of adapters.keys()) {
    const touched = await pollStore(key);
    if (touched) allTouched.push(...touched);
  }

  // تقييم التنبيهات على العروض التي تحدّثت
  let alerts = 0;
  for (const listing of allTouched) {
    const phone = Phones.byId(listing.phone_id);
    if (!phone) continue;
    const analysis = analyzeListing(listing);
    if (!analysis) continue;
    alerts += await alertEngine.processListingUpdate(phone, analysis);
  }
  log.info(`انتهت الدورة — تحديث ${allTouched.length} عرض، إرسال ${alerts} تنبيه.`);
  return { updated: allTouched.length, alerts };
}

module.exports = { runPoll, pollStore };
