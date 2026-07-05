'use strict';
const { BaseAdapter } = require('./base');

class JarirAdapter extends BaseAdapter {
  constructor() {
    super();
    this.key = 'jarir';
    this.label = 'Jarir';
    this.host = 'jarir.com';
    this.baseUrl = 'https://www.jarir.com';
  }

  parsePrice($) {
    const priceText =
      $('.price .price-wrapper [data-price-amount]').attr('data-price-amount') ||
      $('.price-box .price').first().text() ||
      $('[itemprop="price"]').attr('content');
    const listText = $('.old-price .price').first().text();
    const inStock = !/نفد|out of stock|غير متوفر/i.test($('.stock, .availability').text() || '');
    return {
      price: BaseAdapter.toNumber(priceText),
      listPrice: BaseAdapter.toNumber(listText),
      currency: 'SAR',
      inStock,
    };
  }
}

module.exports = new JarirAdapter();
