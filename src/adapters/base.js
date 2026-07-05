'use strict';
const config = require('../config');
const log = require('../lib/logger').scope('adapter');

// خريطة آخر وقت طلب لكل متجر لاحترام Rate Limit
const lastRequestAt = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * BaseAdapter — الواجهة الموحّدة لكل متجر.
 * يوفّر منطق: تحديد المصدر (seed/scraper)، احترام معدل الطلب، وقالب fetchPrice.
 * كل متجر يرث ويطبّق:
 *   - key            (معرّف المتجر)
 *   - label          (اسم للعرض)
 *   - baseUrl
 *   - parsePrice($, html)   عند الزحف الحقيقي
 *   - matchProductUrl(url)  للتحقق أن الرابط يخص هذا المتجر
 */
class BaseAdapter {
  constructor() {
    this.key = 'base';
    this.label = 'Base';
    this.baseUrl = '';
  }

  matchProductUrl(url) {
    try {
      const host = new URL(url).host;
      return host.includes(this.host || '____');
    } catch {
      return false;
    }
  }

  // احترام الحد الأدنى للتأخير بين طلبات نفس المتجر
  async throttle() {
    const last = lastRequestAt.get(this.key) || 0;
    const wait = config.scrapeMinDelayMs - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(this.key, Date.now());
  }

  /**
   * الدالة الرئيسية: جلب السعر الحالي لعرض متجر.
   * @param {object} listing صف من جدول listings
   * @returns {Promise<{price:number, listPrice?:number, currency:string, inStock:boolean, source:string}>}
   */
  async fetchPrice(listing) {
    if (config.priceSource === 'scraper') {
      return this.fetchViaScraper(listing);
    }
    return this.fetchViaSeed(listing);
  }

  // ===== مسار Seed: يولّد سعرًا حاليًا واقعيًا (مسار حقيقي للتخزين بدون إنترنت) =====
  async fetchViaSeed(listing) {
    const base = listing.last_price || this.seedBasePrice(listing) || 2000;
    // مشي عشوائي بسيط ±4% مع ميل خفيف نحو الوسط + احتمال عرض مفاجئ
    const drift = (Math.random() - 0.5) * 0.08;
    let next = base * (1 + drift);
    if (Math.random() < 0.06) next = base * (0.72 + Math.random() * 0.1); // عرض قوي أحيانًا
    next = Math.max(this.seedFloor(listing), Math.round(next));
    const listPrice = Math.round((this.seedBasePrice(listing) || base) * 1.35);
    return {
      price: next,
      listPrice,
      currency: 'SAR',
      inStock: Math.random() > 0.03,
      source: 'seed',
    };
  }

  seedBasePrice(listing) {
    return listing.__seedBase || null;
  }
  seedFloor(listing) {
    const base = this.seedBasePrice(listing) || listing.last_price || 1000;
    return Math.round(base * 0.55);
  }

  // ===== مسار Scraper الحقيقي =====
  async fetchViaScraper(listing) {
    await this.throttle();
    const cheerio = require('cheerio');
    const res = await fetch(listing.product_url, {
      headers: {
        'User-Agent': config.scrapeUserAgent,
        'Accept-Language': 'ar,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} من ${this.key}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const parsed = this.parsePrice($, html);
    if (!parsed || !parsed.price) throw new Error(`تعذّر استخراج السعر من ${this.key}`);
    return {
      price: parsed.price,
      listPrice: parsed.listPrice || null,
      currency: parsed.currency || 'SAR',
      inStock: parsed.inStock !== false,
      source: 'scraper',
    };
  }

  // يُنفّذ في المتاجر الوارثة عند الزحف الحقيقي
  parsePrice(/* $, html */) {
    log.warn(`${this.key}: parsePrice غير مطبّق — يجب تخصيص المحدّدات (selectors).`);
    return null;
  }

  // أداة مساعدة: تحويل نص سعر عربي/لاتيني إلى رقم
  static toNumber(text) {
    if (!text) return null;
    const map = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
    const norm = String(text).replace(/[٠-٩]/g, (d) => map[d]);
    const cleaned = norm.replace(/[^\d.,]/g, '').replace(/,/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
}

module.exports = { BaseAdapter, sleep };
