'use strict';
const fs = require('fs');
const path = require('path');
// نستخدم قاعدة بيانات SQLite المدمجة في Node (node:sqlite) — لا حاجة لأي حزمة native.
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const log = require('../lib/logger').scope('db');

// تأكد من وجود مجلد قاعدة البيانات
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ============ المخطط (Schema) ============
// نستخدم CREATE TABLE IF NOT EXISTS كهجرات بسيطة idempotent.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- تفضيلات وإعدادات التنبيه لكل مستخدم (سجل واحد لكل مستخدم)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  channel            TEXT NOT NULL DEFAULT 'email',   -- email|telegram|webpush|console (CSV مسموح)
  min_discount_pct   REAL NOT NULL DEFAULT 40,        -- الحد الأدنى لنسبة الخصم للتنبيه
  max_price          REAL,                            -- الحد الأعلى للسعر المهتم به
  preferred_brands   TEXT DEFAULT '',                 -- CSV: Apple,Samsung,...
  telegram_chat_id   TEXT,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- اشتراكات Web Push
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, endpoint)
);

-- كتالوج الهواتف
CREATE TABLE IF NOT EXISTS phones (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  brand      TEXT NOT NULL,
  model      TEXT NOT NULL,
  storage    TEXT,             -- 128GB / 256GB ...
  image_url  TEXT,
  slug       TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- قوائم المتاجر لكل هاتف (Adapter Pattern: كل صف = عرض متجر لهاتف)
CREATE TABLE IF NOT EXISTS listings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_id      INTEGER NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
  store         TEXT NOT NULL,           -- amazon_sa | jarir | noon | extra
  product_url   TEXT NOT NULL,
  external_id   TEXT,                    -- معرف داخلي/ASIN/SKU للـ adapter
  active        INTEGER NOT NULL DEFAULT 1,
  last_price    REAL,                    -- آخر سعر ناجح
  last_currency TEXT DEFAULT 'SAR',
  last_in_stock INTEGER DEFAULT 1,
  last_success_at TEXT,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store, product_url)
);
CREATE INDEX IF NOT EXISTS idx_listings_phone ON listings(phone_id);
CREATE INDEX IF NOT EXISTS idx_listings_store ON listings(store);

-- تاريخ السعر (نقطة لكل عملية جمع ناجحة)
CREATE TABLE IF NOT EXISTS price_points (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price       REAL NOT NULL,
  list_price  REAL,                      -- السعر المشطوب المعلن (قد يكون وهميًا)
  currency    TEXT NOT NULL DEFAULT 'SAR',
  in_stock    INTEGER NOT NULL DEFAULT 1,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_price_points_listing ON price_points(listing_id, captured_at);

-- متابعات المستخدم لهواتف محددة
CREATE TABLE IF NOT EXISTS watches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_id      INTEGER NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
  target_price  REAL,                    -- سعر مستهدف اختياري
  -- أنواع التنبيه المفعّلة:
  alert_target       INTEGER NOT NULL DEFAULT 1,  -- نزول تحت السعر المستهدف
  alert_all_time_low INTEGER NOT NULL DEFAULT 1,  -- أقل سعر تاريخي
  alert_pct_drop     INTEGER NOT NULL DEFAULT 1,  -- انخفاض بنسبة معينة
  alert_strong_deal  INTEGER NOT NULL DEFAULT 1,  -- عرض قوي مقارنة بالتاريخ
  drop_pct           REAL NOT NULL DEFAULT 15,    -- نسبة الانخفاض التي تهم المستخدم
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, phone_id)
);
CREATE INDEX IF NOT EXISTS idx_watches_user ON watches(user_id);
CREATE INDEX IF NOT EXISTS idx_watches_phone ON watches(phone_id);

-- سجل التنبيهات (لمنع التكرار خلال 24 ساعة ولعرض السجل)
CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL = تنبيه إداري
  phone_id    INTEGER REFERENCES phones(id) ON DELETE SET NULL,
  listing_id  INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,       -- target|all_time_low|pct_drop|strong_deal|auto_deal|admin
  price       REAL,
  reason      TEXT,
  deal_score  REAL,
  dedup_key   TEXT,                -- user:phone:store:priceBucket
  channels    TEXT,                -- القنوات التي أُرسل عبرها فعليًا
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_dedup ON alerts(dedup_key, created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, created_at);

-- سجل تشغيل الجمع لكل متجر (لمراقبة صحة الـ adapters)
CREATE TABLE IF NOT EXISTS poll_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  store       TEXT NOT NULL,
  ok          INTEGER NOT NULL,
  attempted   INTEGER NOT NULL DEFAULT 0,
  succeeded   INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  message     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

db.exec(SCHEMA);
log.info('تم فتح قاعدة البيانات:', config.dbPath);

module.exports = db;
