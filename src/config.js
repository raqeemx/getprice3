'use strict';
require('dotenv').config();
const path = require('path');

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const ROOT = path.resolve(__dirname, '..');

const config = {
  root: ROOT,
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 3000),
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',

  dbPath: path.resolve(ROOT, process.env.DB_PATH || './data/getprice.db'),

  priceSource: (process.env.PRICE_SOURCE || 'seed').toLowerCase(), // seed | scraper
  scrapeMinDelayMs: num(process.env.SCRAPE_MIN_DELAY_MS, 4000),
  scrapeUserAgent: process.env.SCRAPE_USER_AGENT || 'GetPriceBot/1.0',
  pollCron: process.env.POLL_CRON || '*/30 * * * *',
  scanCron: process.env.SCAN_CRON || '15 * * * *',
  runOnBoot: bool(process.env.RUN_ON_BOOT, false),

  alert: {
    realDiscountPct: num(process.env.ALERT_REAL_DISCOUNT_PCT, 40),
    minDealScore: num(process.env.ALERT_MIN_DEAL_SCORE, 70),
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'GetPrice Alerts <alerts@example.com>',
  },
  adminEmail: process.env.ADMIN_EMAIL || '',

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || '',
  },

  webpush: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },
};

module.exports = config;
