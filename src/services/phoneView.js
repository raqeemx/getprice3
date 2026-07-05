'use strict';
const { Listings, Prices, Phones } = require('../db/models');
const { analyzeListing } = require('./dealAnalysis');
const adapters = require('../adapters');

// يبني نموذج عرض كامل لهاتف: تحليل كل متجر + أفضل عرض + بيانات الرسم البياني.
function buildPhoneView(phone, opts = {}) {
  const listings = Listings.forPhone(phone.id);
  const perStore = [];
  for (const listing of listings) {
    const history = Prices.history(listing.id, 120);
    const analysis = analyzeListing(listing, { history, matchesPrefs: opts.matchesPrefs });
    perStore.push({
      listing,
      storeLabel: adapters.label(listing.store),
      analysis,
      history,
    });
  }
  // أفضل عرض = أعلى Deal Score (مع وجود تحليل)
  const withAnalysis = perStore.filter((s) => s.analysis);
  withAnalysis.sort((a, b) => b.analysis.deal.score - a.analysis.deal.score);
  const best = withAnalysis[0] || null;
  const cheapest = perStore
    .filter((s) => s.listing.last_price)
    .sort((a, b) => a.listing.last_price - b.listing.last_price)[0] || null;

  return {
    phone,
    fullName: Phones.fullName(phone),
    perStore,
    best,
    cheapest,
  };
}

// سلسلة بيانات الرسم البياني لكل متجر (تواريخ + أسعار)
function chartSeries(phone) {
  const listings = Listings.forPhone(phone.id);
  return listings.map((l) => {
    const hist = Prices.history(l.id, 120);
    return {
      store: l.store,
      label: adapters.label(l.store),
      points: hist.map((p) => ({ x: p.captured_at.slice(0, 10), y: p.price })),
    };
  });
}

module.exports = { buildPhoneView, chartSeries };
