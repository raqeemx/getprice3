'use strict';
const { BaseAdapter } = require('./base');

class AmazonSaAdapter extends BaseAdapter {
  constructor() {
    super();
    this.key = 'amazon_sa';
    this.label = 'Amazon.sa';
    this.host = 'amazon.sa';
    this.baseUrl = 'https://www.amazon.sa';
  }

  // محدّدات تقريبية لصفحة منتج أمازون — قد تحتاج تحديثًا إذا غيّر الموقع تصميمه.
  parsePrice($) {
    const priceText =
      $('#corePrice_feature_div .a-offscreen').first().text() ||
      $('.a-price .a-offscreen').first().text() ||
      $('#priceblock_ourprice').text();
    const listText = $('.basisPrice .a-offscreen').first().text() || $('#listPrice').text();
    const inStock = !/غير متوفر|currently unavailable|out of stock/i.test($('#availability').text() || '');
    return {
      price: BaseAdapter.toNumber(priceText),
      listPrice: BaseAdapter.toNumber(listText),
      currency: 'SAR',
      inStock,
    };
  }
}

module.exports = new AmazonSaAdapter();
