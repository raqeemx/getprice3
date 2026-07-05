'use strict';
const express = require('express');
const router = express.Router();
const config = require('../config');
const { Phones, PushSubs, PollRuns } = require('../db/models');
const { chartSeries } = require('../services/phoneView');
const { requireAuth } = require('../auth/middleware');

// بيانات الرسم البياني لتاريخ سعر هاتف
router.get('/phone/:slug/history', (req, res) => {
  const phone = Phones.bySlug(req.params.slug);
  if (!phone) return res.status(404).json({ error: 'not found' });
  res.json({ phone: Phones.fullName(phone), series: chartSeries(phone) });
});

// صحة الـ adapters (لوحة مراقبة بسيطة)
router.get('/health/adapters', (req, res) => {
  res.json({ runs: PollRuns.latestPerStore() });
});

// المفتاح العام لـ Web Push
router.get('/push/public-key', (req, res) => {
  res.json({ key: config.webpush.publicKey || null });
});

// تسجيل اشتراك Web Push
router.post('/push/subscribe', requireAuth, (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint || !sub.keys) return res.status(400).json({ error: 'اشتراك غير صالح' });
  PushSubs.add(req.user.id, sub);
  res.json({ ok: true });
});

module.exports = router;
