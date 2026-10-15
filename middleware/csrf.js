'use strict';

const crypto = require('crypto');

// Synchroniser-token CSRF protection tied to the session (no extra dependency).
// Every state-changing request must carry the token in a hidden `_csrf` field.
function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const sent = Buffer.from(String((req.body && req.body._csrf) || ''));
  const expected = Buffer.from(req.session.csrfToken);
  if (sent.length === expected.length && crypto.timingSafeEqual(sent, expected)) return next();

  return res.status(403).send('403 Forbidden: invalid CSRF token. Reload the page and try again.');
}

module.exports = csrf;
