'use strict';
const log = require('../../lib/logger').scope('notify:console');

// قناة احتياطية دائمة — تطبع التنبيه في السجل. مفيدة للتجربة بدون إعداد بريد/تيليجرام.
module.exports = {
  isConfigured: () => true,
  async send(target, msg) {
    const to = target && target.user ? target.user.email : 'unknown';
    const body = [msg.title, ...(msg.lines || []), msg.url ? `🔗 ${msg.url}` : ''].filter(Boolean).join('\n  ');
    log.info(`تنبيه إلى ${to}:\n  ${body}`);
    return true;
  },
};
