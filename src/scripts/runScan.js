'use strict';
// فحص العروض التلقائي يدويًا: npm run scan
const { scanDeals } = require('../workers/dealScanner');
scanDeals({ alert: true })
  .then((deals) => {
    console.log(`عدد العروض المؤهّلة: ${deals.length}`);
    for (const d of deals.slice(0, 10)) {
      console.log(`- ${d.phone.brand} ${d.phone.model} | ${d.analysis.listing.store} | ${d.analysis.stats.current} ر.س | score ${d.analysis.deal.score}`);
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error('خطأ:', e);
    process.exit(1);
  });
