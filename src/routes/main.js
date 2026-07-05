'use strict';
const express = require('express');
const router = express.Router();
const { Phones, Watches, Settings, Alerts } = require('../db/models');
const { requireAuth } = require('../auth/middleware');
const { buildPhoneView, chartSeries } = require('../services/phoneView');
const { scanDeals } = require('../workers/dealScanner');
const adapters = require('../adapters');
const { addPhoneFromInput } = require('../services/catalog');

// ============ الصفحة الرئيسية ============
router.get('/', async (req, res) => {
  const deals = (await scanDeals({ alert: false })).slice(0, 8);
  res.render('home', { title: 'GetPrice — مراقبة أسعار الهواتف', deals, adapters });
});

// ============ البحث ============
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const results = q ? Phones.search(q) : Phones.all(60);
  res.render('search', { title: 'بحث عن هاتف', q, results });
});

// ============ صفحة الهاتف ============
router.get('/phone/:slug', (req, res) => {
  const phone = Phones.bySlug(req.params.slug);
  if (!phone) return res.status(404).render('404', { title: 'غير موجود' });
  const matchesPrefs = req.user ? require('../services/alertEngine').matchesPrefs(phone, Settings.get(req.user.id)) : false;
  const view = buildPhoneView(phone, { matchesPrefs });
  const watch = req.user ? Watches.get(req.user.id, phone.id) : null;
  res.render('phone', {
    title: view.fullName,
    view,
    watch,
    series: chartSeries(phone),
  });
});

// ============ العروض المكتشفة تلقائيًا ============
router.get('/deals', async (req, res) => {
  let deals = await scanDeals({ alert: false });
  const { store, brand, minDiscount, maxPrice, storage } = req.query;
  if (store) deals = deals.filter((d) => d.analysis.listing.store === store);
  if (brand) deals = deals.filter((d) => d.phone.brand.toLowerCase() === brand.toLowerCase());
  if (storage) deals = deals.filter((d) => (d.phone.storage || '').toLowerCase() === storage.toLowerCase());
  if (minDiscount) deals = deals.filter((d) => d.analysis.discount.real >= Number(minDiscount));
  if (maxPrice) deals = deals.filter((d) => d.analysis.stats.current <= Number(maxPrice));

  const brands = [...new Set(Phones.all(500).map((p) => p.brand))].sort();
  res.render('deals', {
    title: 'العروض القوية',
    deals,
    filters: { store, brand, minDiscount, maxPrice, storage },
    stores: adapters.all(),
    brands,
  });
});

// ============ لوحة المستخدم ============
router.get('/dashboard', requireAuth, (req, res) => {
  const watches = Watches.forUser(req.user.id);
  const items = watches.map((w) => {
    const phone = Phones.byId(w.phone_id);
    const view = buildPhoneView(phone, {
      matchesPrefs: require('../services/alertEngine').matchesPrefs(phone, Settings.get(req.user.id)),
    });
    return { watch: w, view };
  });
  const recentAlerts = Alerts.forUser(req.user.id, 20);
  res.render('dashboard', { title: 'لوحتي', items, recentAlerts, adapters });
});

// إضافة/تحديث متابعة
router.post('/watch', requireAuth, (req, res) => {
  const { phone_id, slug, target_price, drop_pct, alert_target, alert_all_time_low, alert_pct_drop, alert_strong_deal } =
    req.body;
  const phone = phone_id ? Phones.byId(Number(phone_id)) : Phones.bySlug(slug);
  if (!phone) return res.status(404).send('هاتف غير موجود');

  Watches.upsert(req.user.id, phone.id, {
    target_price: target_price ? Number(target_price) : null,
    drop_pct: drop_pct ? Number(drop_pct) : 15,
  });
  // تحديث أنواع التنبيه (checkboxes)
  const db = require('../db/index');
  db.prepare(
    `UPDATE watches SET alert_target=?, alert_all_time_low=?, alert_pct_drop=?, alert_strong_deal=?
     WHERE user_id=? AND phone_id=?`
  ).run(
    alert_target ? 1 : 0,
    alert_all_time_low ? 1 : 0,
    alert_pct_drop ? 1 : 0,
    alert_strong_deal ? 1 : 0,
    req.user.id,
    phone.id
  );
  res.redirect(req.get('referer') || '/dashboard');
});

router.post('/unwatch', requireAuth, (req, res) => {
  const phone = req.body.phone_id ? Phones.byId(Number(req.body.phone_id)) : Phones.bySlug(req.body.slug);
  if (phone) Watches.remove(req.user.id, phone.id);
  res.redirect(req.get('referer') || '/dashboard');
});

// إضافة هاتف/رابط منتج مباشر
router.get('/add', requireAuth, (req, res) => {
  res.render('add', { title: 'إضافة هاتف أو رابط', error: null, adapters, ok: null });
});
router.post('/add', requireAuth, async (req, res) => {
  try {
    const { input, brand, model, storage } = req.body;
    const result = await addPhoneFromInput({ input, brand, model, storage, userId: req.user.id });
    if (result.watched) Watches.upsert(req.user.id, result.phone.id, {});
    res.render('add', { title: 'إضافة هاتف أو رابط', error: null, adapters, ok: result });
  } catch (err) {
    res.status(400).render('add', { title: 'إضافة هاتف أو رابط', error: err.message, adapters, ok: null });
  }
});

// ============ الإعدادات ============
router.get('/settings', requireAuth, (req, res) => {
  const s = Settings.get(req.user.id);
  res.render('settings', { title: 'الإعدادات', settings: s, saved: req.query.saved, vapid: require('../config').webpush.publicKey });
});
router.post('/settings', requireAuth, (req, res) => {
  const channels = [].concat(req.body.channel || []).filter(Boolean).join(',') || 'console';
  const brands = [].concat(req.body.brands || []).filter(Boolean).join(',');
  Settings.update(req.user.id, {
    channel: channels,
    min_discount_pct: Number(req.body.min_discount_pct) || 40,
    max_price: req.body.max_price ? Number(req.body.max_price) : null,
    preferred_brands: brands,
    telegram_chat_id: req.body.telegram_chat_id || null,
  });
  res.redirect('/settings?saved=1');
});

module.exports = router;
