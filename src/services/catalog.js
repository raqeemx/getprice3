'use strict';
const adapters = require('../adapters');
const { Phones, Listings, Prices } = require('../db/models');
const log = require('../lib/logger').scope('catalog');

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * يضيف هاتفًا للنظام إما من رابط منتج مباشر أو من اسم هاتف موجود.
 * - إذا كان input رابطًا: يكتشف المتجر، ينشئ الهاتف (من brand/model/storage) والعرض، ويجلب سعرًا أوليًا.
 * - إذا كان input نصًا: يبحث عن هاتف موجود ويعيده للمتابعة.
 * @returns {Promise<{phone, listing?, watched:boolean, message:string}>}
 */
async function addPhoneFromInput({ input, brand, model, storage }) {
  input = (input || '').trim();
  if (!input) throw new Error('أدخل اسم هاتف أو رابط منتج.');

  const isUrl = /^https?:\/\//i.test(input);
  if (!isUrl) {
    // بحث عن هاتف موجود
    const found = Phones.search(input, 1)[0];
    if (!found) throw new Error('لم يُعثر على الهاتف. أضف رابط منتج مباشر بدلًا من ذلك.');
    return { phone: found, watched: true, message: `تمت متابعة ${Phones.fullName(found)}` };
  }

  // رابط منتج
  const adapter = adapters.matchUrl(input);
  if (!adapter) {
    throw new Error('الرابط لا يخص أحد المتاجر المدعومة (Amazon.sa, Jarir, Noon, Extra).');
  }
  if (!brand || !model) {
    throw new Error('حدّد الشركة والموديل حتى نصنّف الهاتف بشكل صحيح.');
  }
  const slug = slugify(`${brand}-${model}-${storage || ''}`);
  const phone = Phones.upsert({ brand, model, storage: storage || null, slug });
  const listing = Listings.create({
    phoneId: phone.id,
    store: adapter.key,
    productUrl: input,
    externalId: null,
  });

  // مسار حقيقي: جلب السعر الحالي وتخزينه فورًا
  try {
    const r = await adapter.fetchPrice(listing);
    if (r && r.price) {
      Prices.add(listing.id, { price: r.price, listPrice: r.listPrice, currency: r.currency, inStock: r.inStock });
      Listings.recordSuccess(listing.id, { price: r.price, currency: r.currency, inStock: r.inStock });
    }
  } catch (err) {
    log.warn('تعذّر الجلب الأولي:', err.message);
  }

  return {
    phone,
    listing,
    watched: true,
    message: `أُضيف ${Phones.fullName(phone)} من ${adapter.label} وبدأت مراقبته.`,
  };
}

module.exports = { addPhoneFromInput, slugify };
