'use strict';
const config = require('../../config');
const log = require('../../lib/logger').scope('notify:webpush');
const { PushSubs } = require('../../db/models');

let wp = null;
function getWebPush() {
  if (wp) return wp;
  if (!config.webpush.publicKey || !config.webpush.privateKey) return null;
  wp = require('web-push');
  wp.setVapidDetails(config.webpush.subject, config.webpush.publicKey, config.webpush.privateKey);
  return wp;
}

module.exports = {
  isConfigured: () => !!(config.webpush.publicKey && config.webpush.privateKey),
  async send(target, msg) {
    const lib = getWebPush();
    if (!lib) return false;
    if (!target || !target.user) return false;
    const subs = PushSubs.forUser(target.user.id);
    if (!subs.length) return false;
    const payload = JSON.stringify({
      title: msg.title,
      body: (msg.lines || []).join('\n'),
      url: msg.url || '/',
    });
    let sent = 0;
    for (const s of subs) {
      try {
        await lib.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) PushSubs.remove(s.endpoint);
        else log.warn('فشل push:', err.message);
      }
    }
    return sent > 0;
  },
};
