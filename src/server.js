'use strict';
const path = require('path');
const express = require('express');
const session = require('express-session');
const cron = require('node-cron');

const config = require('./config');
const log = require('./lib/logger').scope('server');
require('./db/index'); // تهيئة قاعدة البيانات + المخطط
const SqliteSessionStore = require('./auth/sqliteSessionStore');
const { loadUser } = require('./auth/middleware');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new SqliteSessionStore(),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 30, sameSite: 'lax' },
  })
);

app.use(loadUser);

// المسارات
app.use('/', require('./routes/auth'));
app.use('/api', require('./routes/api'));
app.use('/', require('./routes/main'));

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'الصفحة غير موجودة' });
});

// معالج أخطاء عام
app.use((err, req, res, next) => {
  log.error('خطأ غير متوقع:', err.stack || err.message);
  if (res.headersSent) return next(err);
  res.status(500).render('error', { title: 'خطأ', message: config.env === 'production' ? 'حدث خطأ' : err.message });
});

// ============ الجدولة (Workers) ============
function scheduleWorkers() {
  const { runPoll } = require('./workers/poller');
  const { scanDeals } = require('./workers/dealScanner');

  if (cron.validate(config.pollCron)) {
    cron.schedule(config.pollCron, () => {
      runPoll().catch((e) => log.error('poll cron:', e.message));
    });
    log.info('جدولة الجمع:', config.pollCron);
  } else {
    log.warn('POLL_CRON غير صالح:', config.pollCron);
  }

  if (cron.validate(config.scanCron)) {
    cron.schedule(config.scanCron, () => {
      scanDeals({ alert: true }).catch((e) => log.error('scan cron:', e.message));
    });
    log.info('جدولة فحص العروض:', config.scanCron);
  }

  if (config.runOnBoot) {
    log.info('تشغيل دورة جمع عند الإقلاع...');
    runPoll().catch((e) => log.error('boot poll:', e.message));
  }
}

const server = app.listen(config.port, () => {
  log.info(`GetPrice يعمل على http://localhost:${config.port}  (env=${config.env}, source=${config.priceSource})`);
  scheduleWorkers();
});

process.on('SIGINT', () => {
  log.info('إيقاف الخادم...');
  server.close(() => process.exit(0));
});

module.exports = app;
