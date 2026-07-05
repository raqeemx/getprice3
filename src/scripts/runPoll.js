'use strict';
// تشغيل دورة جمع أسعار واحدة يدويًا: npm run poll
const { runPoll } = require('../workers/poller');
runPoll()
  .then((r) => {
    console.log('تم:', r);
    process.exit(0);
  })
  .catch((e) => {
    console.error('خطأ:', e);
    process.exit(1);
  });
