'use strict';
// سجل الـ Adapters — إضافة متجر جديد = ملف جديد يُسجّل هنا فقط.
const amazonSa = require('./amazonSa');
const jarir = require('./jarir');
const noon = require('./noon');
const extra = require('./extra');

const adapters = [amazonSa, jarir, noon, extra];
const byKey = new Map(adapters.map((a) => [a.key, a]));

module.exports = {
  all: () => adapters,
  keys: () => adapters.map((a) => a.key),
  get: (key) => byKey.get(key),
  label: (key) => (byKey.get(key) ? byKey.get(key).label : key),
  // اكتشاف المتجر من رابط منتج يضيفه المستخدم
  matchUrl(url) {
    return adapters.find((a) => a.matchProductUrl(url)) || null;
  },
};
