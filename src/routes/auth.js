'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { Users } = require('../db/models');
const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { title: 'إنشاء حساب', error: null, values: {} });
});

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  const values = { name, email };
  if (!EMAIL_RE.test(email || '')) {
    return res.status(400).render('register', { title: 'إنشاء حساب', error: 'بريد إلكتروني غير صالح', values });
  }
  if (!password || password.length < 6) {
    return res
      .status(400)
      .render('register', { title: 'إنشاء حساب', error: 'كلمة المرور يجب ألا تقل عن 6 أحرف', values });
  }
  if (Users.byEmail(email)) {
    return res.status(400).render('register', { title: 'إنشاء حساب', error: 'البريد مستخدم مسبقًا', values });
  }
  const user = Users.create({ email, name, passwordHash: bcrypt.hashSync(password, 10) });
  req.session.userId = user.id;
  res.redirect('/dashboard');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'تسجيل الدخول', error: null, values: {} });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = Users.byEmail(email || '');
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res
      .status(401)
      .render('login', { title: 'تسجيل الدخول', error: 'بيانات الدخول غير صحيحة', values: { email } });
  }
  req.session.userId = user.id;
  const to = req.session.returnTo || '/dashboard';
  delete req.session.returnTo;
  res.redirect(to);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
