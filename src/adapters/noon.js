'use strict';
const { BaseAdapter } = require('./base');

class NoonAdapter extends BaseAdapter {
  constructor() {
    super();
    this.key = 'noon';
    this.label = 'Noon';
    this.host = 'noon.com';
    this.baseUrl = 'https://www.noon.com';
  }

  parsePrice($, html) {
    // noon يحقن بيانات المنتج في JSON داخل الصفحة
    let price = null;
    let listPrice = null;
    const m = html && html.match(/"price"\s*:\s*"?([\d.]+)"?/);
    if (m) price = BaseAdapter.toNumber(m[1]);
    const ml = html && html.match(/"sale_price"\s*:\s*"?([\d.]+)"?/);
    if (ml) listPrice = BaseAdapter.toNumber(ml[1]);
    if (!price) {
      price = BaseAdapter.toNumber($('[data-qa="pdp-price"]').first().text() || $('.priceNow').first().text());
    }
    return { price, listPrice, currency: 'SAR', inStock: true };
  }
}

module.exports = new NoonAdapter();
