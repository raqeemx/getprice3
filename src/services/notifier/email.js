'use strict';
const nodemailer = require('nodemailer');
const config = require('../../config');
const log = require('../../lib/logger').scope('notify:email');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host) return null;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

function htmlFor(msg) {
  const lines = (msg.lines || []).map((l) => `<div>${escapeHtml(l)}</div>`).join('');
  const btn = msg.url
    ? `<p><a href="${escapeHtml(msg.url)}" style="background:#0b7;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">رابط الشراء المباشر</a></p>`
    : '';
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:520px">
    <h2 style="margin:0 0 12px">${escapeHtml(msg.title)}</h2>
    <div style="font-size:15px;line-height:1.9">${lines}</div>
    ${btn}
    <hr style="margin-top:18px;border:none;border-top:1px solid #eee"/>
    <small style="color:#888">GetPrice — منصة مراقبة أسعار الهواتف</small>
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = {
  isConfigured: () => !!config.smtp.host,
  async send(target, msg) {
    const t = getTransporter();
    if (!t) return false;
    const to = (target && target.overrideEmail) || (target && target.user && target.user.email);
    if (!to) return false;
    await t.sendMail({
      from: config.smtp.from,
      to,
      subject: msg.title,
      text: require('./index').buildText(msg),
      html: msg.html || htmlFor(msg),
    });
    log.info('أُرسل بريد إلى', to);
    return true;
  },
};
