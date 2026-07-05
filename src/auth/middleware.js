'use strict';
const { Users, Settings } = require('../db/models');

// يحمّل المستخدم الحالي من الجلسة إلى res.locals لكل الطلبات
function loadUser(req, res, next) {
  res.locals.user = null;
  res.locals.currentPath = req.path;
  if (req.session && req.session.userId) {
    const user = Users.byId(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.user = user;
      res.locals.settings = Settings.get(user.id);
    }
  }
  next();
}

// يحمي المسارات التي تتطلب تسجيل دخول
function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(401).json({ error: 'يتطلب تسجيل الدخول' });
  }
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

module.exports = { loadUser, requireAuth };
