'use strict';
const { BaseAdapter } = require('./base');

class ExtraAdapter extends BaseAdapter {
  constructor() {
    super();
    this.key = 'extra';
    this.label = 'Extra';
    this.host = 'extra.com';
    this.baseUrl = 'https://www.extra.com';
  }

  parsePrice($) {
    const priceText =
      $('[data-testid="product-price"]').first().text() ||
      $('.product-price .price').first().text() ||
      $('[itemprop="price"]').attr('content');
    const listText = $('.was-price, .old-price').first().text();
    const inStock = !/غير متوفر|out of stock/i.test($('.availability, .stock-status').text() || '');
    return {
      price: BaseAdapter.toNumber(priceText),
      listPrice: BaseAdapter.toNumber(listText),
      currency: 'SAR',
      inStock,
    };
  }
}

module.exports = new ExtraAdapter();
