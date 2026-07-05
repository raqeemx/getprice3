'use strict';
const { Prices } = require('../db/models');

// يحسب إحصائيات تاريخ السعر لعرض متجر (listing) واحد.
// يعتمد على نقاط السعر المخزّنة فقط (سعر حقيقي وليس السعر المشطوب).

function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// نقاط السعر ضمن آخر N يوم
function pricesWithin(points, days) {
  const cutoff = Date.now() - days * 86400000;
  return points
    .filter((p) => new Date(p.captured_at.replace(' ', 'T') + 'Z').getTime() >= cutoff)
    .map((p) => p.price);
}

/**
 * @param {number} listingId
 * @param {object} [opts] { history?: points[] } لتفادي إعادة الاستعلام
 * @returns إحصائيات كاملة أو null إذا لا يوجد تاريخ
 */
function computeStats(listingId, opts = {}) {
  const points = opts.history || Prices.history(listingId, 400);
  if (!points.length) return null;

  const allPrices = points.map((p) => p.price);
  const current = points[points.length - 1].price;
  const latestListPrice = points[points.length - 1].list_price;

  const p7 = pricesWithin(points, 7);
  const p30 = pricesWithin(points, 30);
  const p90 = pricesWithin(points, 90);

  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);

  // كم مرة ظهر نفس السعر الحالي سابقًا (بتقريب أقرب ريال)
  const round = (n) => Math.round(n);
  const sameCount = allPrices.filter((p) => round(p) === round(current)).length;

  // هل كسر أدنى سعر سابق؟ (نقارن بأدنى سعر باستثناء النقطة الحالية)
  const priorPrices = allPrices.slice(0, -1);
  const priorMin = priorPrices.length ? Math.min(...priorPrices) : null;
  const isAllTimeLow = priorMin === null ? true : current <= priorMin;

  // انحراف معياري بسيط لقياس الاستقرار مقابل التذبذب
  const mean30 = avg(p30);
  let volatility = null;
  if (p30.length > 1 && mean30) {
    const variance = avg(p30.map((x) => (x - mean30) ** 2));
    volatility = Math.sqrt(variance) / mean30; // معامل التغير النسبي
  }

  return {
    current,
    latestListPrice,
    count: allPrices.length,
    avg7: avg(p7),
    avg30: avg(p30),
    avg90: avg(p90),
    min,
    max,
    priorMin,
    isAllTimeLow,
    sameCount,
    volatility, // 0 = مستقر، أعلى = متذبذب
    firstAt: points[0].captured_at,
    lastAt: points[points.length - 1].captured_at,
  };
}

module.exports = { computeStats, avg };
