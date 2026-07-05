'use strict';
const session = require('express-session');
const db = require('../db/index');

// مخزن جلسات بسيط مبني على node:sqlite — بلا أي حزمة native.
db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  expires INTEGER,
  data    TEXT
);`);

const Store = session.Store;

class SqliteSessionStore extends Store {
  constructor(opts = {}) {
    super(opts);
    // تنظيف دوري للجلسات المنتهية
    this._cleanup();
    this._timer = setInterval(() => this._cleanup(), 15 * 60 * 1000);
    if (this._timer.unref) this._timer.unref();
  }

  _cleanup() {
    try {
      db.prepare('DELETE FROM sessions WHERE expires IS NOT NULL AND expires < ?').run(Date.now());
    } catch (_) {}
  }

  get(sid, cb) {
    try {
      const row = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row) return cb(null, null);
      if (row.expires && row.expires < Date.now()) {
        this.destroy(sid, () => {});
        return cb(null, null);
      }
      return cb(null, JSON.parse(row.data));
    } catch (err) {
      return cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
      db.prepare(
        `INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data`
      ).run(sid, expires, JSON.stringify(sess));
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
      db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').run(expires, sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }
}

module.exports = SqliteSessionStore;
