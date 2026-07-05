'use strict';
const config = require('../../config');
const log = require('../../lib/logger').scope('notify:telegram');

module.exports = {
  isConfigured: () => !!config.telegram.botToken,
  async send(target, msg) {
    const token = config.telegram.botToken;
    if (!token) return false;
    const chatId =
      (target && target.settings && target.settings.telegram_chat_id) ||
      (target && target.chatId) ||
      config.telegram.adminChatId;
    if (!chatId) {
      log.warn('لا يوجد telegram_chat_id للمستلم.');
      return false;
    }
    const text = require('./index').buildText(msg);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
    });
    if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
    log.info('أُرسل تنبيه تيليجرام إلى', chatId);
    return true;
  },
};
