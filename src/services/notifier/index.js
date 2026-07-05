'use strict';
const email = require('./email');
const telegram = require('./telegram');
const webpush = require('./webpush');
const consoleCh = require('./console');
const log = require('../../lib/logger').scope('notifier');

const channels = { email, telegram, webpush, console: consoleCh };

/**
 * يرسل رسالة عبر قناة واحدة.
 * @param {string} channel
 * @param {object} target { user, settings } سياق المستلم
 * @param {object} msg   { title, lines[], url, text, html }
 * @returns {Promise<boolean>} نجاح الإرسال
 */
async function send(channel, target, msg) {
  const ch = channels[channel];
  if (!ch) {
    log.warn('قناة غير معروفة:', channel);
    return false;
  }
  if (!ch.isConfigured()) {
    // في حال عدم الإعداد نسقط تلقائيًا إلى console حتى لا يُفقد التنبيه
    log.warn(`القناة ${channel} غير مُعدّة — تحويل إلى console.`);
    return consoleCh.send(target, msg);
  }
  try {
    return await ch.send(target, msg);
  } catch (err) {
    log.error(`فشل الإرسال عبر ${channel}:`, err.message);
    return false;
  }
}

/**
 * يرسل عبر قائمة قنوات (CSV) ويعيد القنوات الناجحة.
 */
async function sendMulti(channelsCsv, target, msg) {
  const list = String(channelsCsv || 'console')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const ok = [];
  for (const c of list) {
    if (await send(c, target, msg)) ok.push(c);
  }
  if (!ok.length) {
    // ضمان وصول التنبيه دائمًا
    if (await consoleCh.send(target, msg)) ok.push('console');
  }
  return ok;
}

function buildText(msg) {
  const lines = [msg.title, '', ...(msg.lines || [])];
  if (msg.url) lines.push('', `رابط الشراء: ${msg.url}`);
  return lines.join('\n');
}

module.exports = { send, sendMulti, buildText, channels };
