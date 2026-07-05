'use strict';
const log = require('../lib/logger').scope('scanner');
const { Listings, Phones } = require('../db/models');
const { analyzeListing } = require('../services/dealAnalysis');
const alertEngine = require('../services/alertEngine');

/**
 * فحص العروض التلقائي: يمرّ على كل العروض النشطة، يحسب التحليل،
 * ويجمع العروض المؤهّلة (قوية/أقل سعر/خصم حقيقي كبير) لعرضها وإطلاق تنبيهاتها.
 * دور احتياطي مكمّل للـ poller (منع التكرار يحمي من الإزعاج).
 * @param {object} [opts] { alert?: boolean }
 * @returns {Promise<Array>} قائمة العروض المؤهّلة مرتّبة حسب القوة
 */
async function scanDeals(opts = {}) {
  const doAlert = opts.alert !== false;
  const listings = Listings.allActive();
  const deals = [];
  let alerts = 0;

  for (const listing of listings) {
    const analysis = analyzeListing(listing);
    if (!analysis) continue;
    if (!alertEngine.qualifiesAsAutoDeal(analysis)) continue;
    const phone = Phones.byId(listing.phone_id);
    if (!phone) continue;
    deals.push({ phone, analysis });
    if (doAlert) {
      alerts += await alertEngine.processListingUpdate(phone, analysis);
    }
  }

  deals.sort((a, b) => b.analysis.deal.score - a.analysis.deal.score);
  log.info(`فحص العروض: ${deals.length} عرض مؤهّل، ${alerts} تنبيه.`);
  return deals;
}

module.exports = { scanDeals };
