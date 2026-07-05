'use strict';
const db = require('./index');

// ================= Users =================
const Users = {
  create({ email, name, passwordHash }) {
    const info = db
      .prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
      .run(email.toLowerCase().trim(), name || null, passwordHash);
    // إنشاء إعدادات افتراضية
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(info.lastInsertRowid);
    return this.byId(info.lastInsertRowid);
  },
  byId(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  byEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  },
};

// ================= Settings =================
const Settings = {
  get(userId) {
    let s = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    if (!s) {
      db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(userId);
      s = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    }
    return s;
  },
  update(userId, fields) {
    const allowed = ['channel', 'min_discount_pct', 'max_price', 'preferred_brands', 'telegram_chat_id'];
    const sets = [];
    const vals = [];
    for (const k of allowed) {
      if (k in fields) {
        sets.push(`${k} = ?`);
        vals.push(fields[k]);
      }
    }
    if (!sets.length) return this.get(userId);
    vals.push(userId);
    db.prepare(`UPDATE user_settings SET ${sets.join(', ')}, updated_at = datetime('now') WHERE user_id = ?`).run(...vals);
    return this.get(userId);
  },
  preferredBrands(userId) {
    const s = this.get(userId);
    return (s.preferred_brands || '')
      .split(',')
      .map((b) => b.trim().toLowerCase())
      .filter(Boolean);
  },
};

// ================= Phones =================
const Phones = {
  bySlug(slug) {
    return db.prepare('SELECT * FROM phones WHERE slug = ?').get(slug);
  },
  byId(id) {
    return db.prepare('SELECT * FROM phones WHERE id = ?').get(id);
  },
  search(q, limit = 30) {
    const like = `%${String(q || '').trim()}%`;
    return db
      .prepare(
        `SELECT * FROM phones
         WHERE brand LIKE ? OR model LIKE ? OR (brand || ' ' || model) LIKE ?
         ORDER BY brand, model LIMIT ?`
      )
      .all(like, like, like, limit);
  },
  all(limit = 200) {
    return db.prepare('SELECT * FROM phones ORDER BY brand, model LIMIT ?').all(limit);
  },
  upsert({ brand, model, storage, imageUrl, slug }) {
    const existing = this.bySlug(slug);
    if (existing) return existing;
    const info = db
      .prepare('INSERT INTO phones (brand, model, storage, image_url, slug) VALUES (?, ?, ?, ?, ?)')
      .run(brand, model, storage || null, imageUrl || null, slug);
    return this.byId(info.lastInsertRowid);
  },
  fullName(p) {
    return [p.brand, p.model, p.storage].filter(Boolean).join(' ');
  },
};

// ================= Listings =================
const Listings = {
  byId(id) {
    return db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  },
  forPhone(phoneId) {
    return db.prepare('SELECT * FROM listings WHERE phone_id = ? AND active = 1 ORDER BY store').all(phoneId);
  },
  byStore(store) {
    return db.prepare('SELECT * FROM listings WHERE store = ? AND active = 1').all(store);
  },
  allActive() {
    return db.prepare('SELECT * FROM listings WHERE active = 1').all();
  },
  findByUrl(store, url) {
    return db.prepare('SELECT * FROM listings WHERE store = ? AND product_url = ?').get(store, url);
  },
  create({ phoneId, store, productUrl, externalId }) {
    const existing = this.findByUrl(store, productUrl);
    if (existing) return existing;
    const info = db
      .prepare('INSERT INTO listings (phone_id, store, product_url, external_id) VALUES (?, ?, ?, ?)')
      .run(phoneId, store, productUrl, externalId || null);
    return this.byId(info.lastInsertRowid);
  },
  recordSuccess(id, { price, currency, inStock }) {
    db.prepare(
      `UPDATE listings
       SET last_price = ?, last_currency = ?, last_in_stock = ?, last_success_at = datetime('now'), fail_count = 0
       WHERE id = ?`
    ).run(price, currency || 'SAR', inStock ? 1 : 0, id);
  },
  recordFailure(id) {
    db.prepare('UPDATE listings SET fail_count = fail_count + 1 WHERE id = ?').run(id);
    return this.byId(id).fail_count;
  },
};

// ================= Price points =================
const Prices = {
  add(listingId, { price, listPrice, currency, inStock, capturedAt }) {
    db.prepare(
      `INSERT INTO price_points (listing_id, price, list_price, currency, in_stock, captured_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`
    ).run(listingId, price, listPrice ?? null, currency || 'SAR', inStock ? 1 : 0, capturedAt || null);
  },
  history(listingId, days = 90) {
    return db
      .prepare(
        `SELECT price, list_price, in_stock, captured_at
         FROM price_points
         WHERE listing_id = ? AND captured_at >= datetime('now', ?)
         ORDER BY captured_at ASC`
      )
      .all(listingId, `-${days} days`);
  },
  latest(listingId) {
    return db
      .prepare('SELECT * FROM price_points WHERE listing_id = ? ORDER BY captured_at DESC LIMIT 1')
      .get(listingId);
  },
};

// ================= Watches =================
const Watches = {
  forUser(userId) {
    return db.prepare('SELECT * FROM watches WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  },
  get(userId, phoneId) {
    return db.prepare('SELECT * FROM watches WHERE user_id = ? AND phone_id = ?').get(userId, phoneId);
  },
  watchersOf(phoneId) {
    return db.prepare('SELECT * FROM watches WHERE phone_id = ?').all(phoneId);
  },
  upsert(userId, phoneId, fields = {}) {
    const existing = this.get(userId, phoneId);
    if (existing) {
      const allowed = ['target_price', 'alert_target', 'alert_all_time_low', 'alert_pct_drop', 'alert_strong_deal', 'drop_pct'];
      const sets = [];
      const vals = [];
      for (const k of allowed) {
        if (k in fields) {
          sets.push(`${k} = ?`);
          vals.push(fields[k]);
        }
      }
      if (sets.length) {
        vals.push(existing.id);
        db.prepare(`UPDATE watches SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      }
      return this.get(userId, phoneId);
    }
    db.prepare(
      `INSERT INTO watches (user_id, phone_id, target_price, drop_pct)
       VALUES (?, ?, ?, COALESCE(?, 15))`
    ).run(userId, phoneId, fields.target_price ?? null, fields.drop_pct ?? null);
    return this.get(userId, phoneId);
  },
  remove(userId, phoneId) {
    db.prepare('DELETE FROM watches WHERE user_id = ? AND phone_id = ?').run(userId, phoneId);
  },
};

// ================= Alerts =================
const Alerts = {
  recentByDedup(dedupKey, hours = 24) {
    return db
      .prepare(
        `SELECT * FROM alerts WHERE dedup_key = ? AND created_at >= datetime('now', ?) ORDER BY created_at DESC LIMIT 1`
      )
      .get(dedupKey, `-${hours} hours`);
  },
  create(row) {
    const info = db
      .prepare(
        `INSERT INTO alerts (user_id, phone_id, listing_id, kind, price, reason, deal_score, dedup_key, channels)
         VALUES (@user_id, @phone_id, @listing_id, @kind, @price, @reason, @deal_score, @dedup_key, @channels)`
      )
      .run({
        user_id: row.user_id ?? null,
        phone_id: row.phone_id ?? null,
        listing_id: row.listing_id ?? null,
        kind: row.kind,
        price: row.price ?? null,
        reason: row.reason ?? null,
        deal_score: row.deal_score ?? null,
        dedup_key: row.dedup_key ?? null,
        channels: row.channels ?? null,
      });
    return db.prepare('SELECT * FROM alerts WHERE id = ?').get(info.lastInsertRowid);
  },
  forUser(userId, limit = 50) {
    return db.prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
  },
};

// ================= Poll runs =================
const PollRuns = {
  record({ store, ok, attempted, succeeded, failed, message }) {
    db.prepare(
      `INSERT INTO poll_runs (store, ok, attempted, succeeded, failed, message)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(store, ok ? 1 : 0, attempted || 0, succeeded || 0, failed || 0, message || null);
  },
  latestPerStore() {
    return db
      .prepare(
        `SELECT p.* FROM poll_runs p
         JOIN (SELECT store, MAX(id) mid FROM poll_runs GROUP BY store) m ON m.mid = p.id
         ORDER BY p.store`
      )
      .all();
  },
};

const PushSubs = {
  add(userId, sub) {
    db.prepare(
      `INSERT OR IGNORE INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)`
    ).run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
  },
  forUser(userId) {
    return db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  },
  remove(endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  },
};

module.exports = { db, Users, Settings, Phones, Listings, Prices, Watches, Alerts, PollRuns, PushSubs };
