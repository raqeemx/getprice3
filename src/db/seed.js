'use strict';
// بيانات Seed للتجربة — تُنشئ كتالوج هواتف + عروض متاجر + تاريخ سعر 90 يومًا + مستخدم تجريبي.
// شغّلها عبر: npm run seed
const bcrypt = require('bcryptjs');
const db = require('./index');
const { Users, Settings, Phones, Listings, Prices, Watches } = require('./models');
const adapters = require('../adapters');
const log = require('../lib/logger').scope('seed');

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// كتالوج هواتف: [brand, model, storage, basePrice(SAR), image]
const CATALOG = [
  ['Apple', 'iPhone 15 Pro Max', '256GB', 4899, 'https://picsum.photos/seed/ip15pm/300/300'],
  ['Apple', 'iPhone 15', '128GB', 3299, 'https://picsum.photos/seed/ip15/300/300'],
  ['Apple', 'iPhone 14', '128GB', 2799, 'https://picsum.photos/seed/ip14/300/300'],
  ['Samsung', 'Galaxy S24 Ultra', '256GB', 4699, 'https://picsum.photos/seed/s24u/300/300'],
  ['Samsung', 'Galaxy S24', '256GB', 3199, 'https://picsum.photos/seed/s24/300/300'],
  ['Samsung', 'Galaxy A55', '128GB', 1499, 'https://picsum.photos/seed/a55/300/300'],
  ['Xiaomi', '14 Pro', '512GB', 2899, 'https://picsum.photos/seed/mi14p/300/300'],
  ['Xiaomi', 'Redmi Note 13 Pro', '256GB', 999, 'https://picsum.photos/seed/rn13p/300/300'],
  ['Honor', 'Magic6 Pro', '512GB', 3299, 'https://picsum.photos/seed/magic6/300/300'],
  ['Huawei', 'Pura 70 Pro', '256GB', 3799, 'https://picsum.photos/seed/pura70/300/300'],
  ['OnePlus', '12', '256GB', 2799, 'https://picsum.photos/seed/op12/300/300'],
  ['Google', 'Pixel 8 Pro', '128GB', 3599, 'https://picsum.photos/seed/px8p/300/300'],
  ['Nothing', 'Phone (2a)', '128GB', 1299, 'https://picsum.photos/seed/nph2a/300/300'],
  ['Motorola', 'Edge 50 Pro', '256GB', 1899, 'https://picsum.photos/seed/edge50/300/300'],
];

const STORES = adapters.keys(); // amazon_sa, jarir, noon, extra

// يولّد مسار سعر لـ 90 يومًا بنمط معيّن
function generateHistory(base, pattern, days = 90, perDay = 1) {
  const points = [];
  let price = base;
  const now = Date.now();
  for (let d = days; d >= 0; d--) {
    // ميل يومي بسيط + تذبذب
    let daily = price * (1 + (Math.random() - 0.5) * 0.02);

    if (pattern === 'genuine_low' && d <= 3) {
      // انخفاض حقيقي مستقر في آخر 3 أيام
      daily = base * (0.6 + Math.random() * 0.03);
    } else if (pattern === 'fake_discount') {
      // رفع تدريجي ثم "خصم" ظاهري في آخر يومين (لكن قريب من المتوسط)
      if (d <= 2) daily = base * (0.96 + Math.random() * 0.02);
      else daily = base * (1.0 + Math.random() * 0.05);
    } else if (pattern === 'stable') {
      daily = base * (0.98 + Math.random() * 0.04);
    } else {
      // random walk عام
      daily = price * (1 + (Math.random() - 0.5) * 0.03);
    }

    price = Math.max(Math.round(base * 0.55), Math.round(daily));
    for (let k = 0; k < perDay; k++) {
      const ts = new Date(now - d * 86400000 - k * 3600000).toISOString().replace('T', ' ').slice(0, 19);
      // list_price المعلن: للـ fake_discount نجعله مرتفعًا دائمًا
      const listPrice =
        pattern === 'fake_discount' ? Math.round(base * 1.6) : Math.round(base * (1.2 + Math.random() * 0.1));
      points.push({ price, listPrice, capturedAt: ts, inStock: Math.random() > 0.02 });
    }
  }
  return points;
}

function run() {
  const tx = () => {
    log.info('حذف البيانات القديمة...');
    db.exec('DELETE FROM price_points; DELETE FROM listings; DELETE FROM watches; DELETE FROM phones;');

    const patterns = ['genuine_low', 'fake_discount', 'stable', 'walk'];
    const createdPhones = [];

    CATALOG.forEach(([brand, model, storage, base, image], i) => {
      const slug = slugify(`${brand}-${model}-${storage}`);
      const phone = Phones.upsert({ brand, model, storage, imageUrl: image, slug });
      createdPhones.push(phone);

      STORES.forEach((store, si) => {
        // اختلاف سعري بسيط بين المتاجر
        const storeBase = Math.round(base * (0.97 + si * 0.02));
        const pattern = patterns[(i + si) % patterns.length];
        const url = `${adapters.get(store).baseUrl}/product/${slug}`;
        const listing = Listings.create({ phoneId: phone.id, store, productUrl: url, externalId: `${slug}-${store}` });

        const history = generateHistory(storeBase, pattern, 90, 1);
        for (const pt of history) {
          Prices.add(listing.id, {
            price: pt.price,
            listPrice: pt.listPrice,
            currency: 'SAR',
            inStock: pt.inStock,
            capturedAt: pt.capturedAt,
          });
        }
        const last = history[history.length - 1];
        Listings.recordSuccess(listing.id, { price: last.price, currency: 'SAR', inStock: last.inStock });
      });
    });

    // مستخدم تجريبي
    let demo = Users.byEmail('demo@getprice.local');
    if (!demo) {
      demo = Users.create({
        email: 'demo@getprice.local',
        name: 'مستخدم تجريبي',
        passwordHash: bcrypt.hashSync('demo1234', 10),
      });
    }
    Settings.update(demo.id, {
      channel: 'console',
      min_discount_pct: 30,
      max_price: 6000,
      preferred_brands: 'Apple,Samsung',
    });

    // متابعة هاتفين مع سعر مستهدف
    const ip = Phones.bySlug(slugify('Apple-iPhone 15 Pro Max-256GB'));
    const s24 = Phones.bySlug(slugify('Samsung-Galaxy S24 Ultra-256GB'));
    if (ip) Watches.upsert(demo.id, ip.id, { target_price: 4200, drop_pct: 12 });
    if (s24) Watches.upsert(demo.id, s24.id, { target_price: 4000, drop_pct: 15 });

    return createdPhones.length;
  };

  db.exec('BEGIN');
  let count;
  try {
    count = tx();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  log.info(`تم إنشاء ${count} هاتف عبر ${STORES.length} متاجر مع تاريخ 90 يومًا.`);
  log.info('مستخدم تجريبي: demo@getprice.local / كلمة المرور: demo1234');
}

run();
process.exit(0);
