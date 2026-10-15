'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyCredentials } = require('../config/database');
const { loginUser, logoutUser } = require('../middleware/auth');

const router = express.Router();

// Slow down password guessing: 10 attempts / 15 min per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('login', { error: 'Too many attempts. Try again in 15 minutes.' }),
});

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const user = await verifyCredentials(req.body.username, req.body.password);
    if (!user) {
      // One generic message for unknown user and wrong password alike.
      return res.status(401).render('login', { error: 'Invalid username or password.' });
    }
    await loginUser(req, user);
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    await logoutUser(req, res);
    res.redirect('/login');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
