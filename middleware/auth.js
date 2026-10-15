'use strict';

const { ROLES, findUserById } = require('../config/database');

const wantsJson = (req) => req.xhr || req.originalUrl.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';

/**
 * Any request that reaches the next handler is from a logged-in user whose account
 * still exists. The role is re-read from the DB on every request (not trusted from
 * the cookie/session), so deleting or demoting a user takes effect immediately.
 */
function requireLogin(req, res, next) {
  const userId = req.session && req.session.userId;
  const user = userId ? findUserById(userId) : null;

  if (!user) {
    // Stale session for a deleted user: destroy it rather than leave it lying around.
    if (req.session && userId) req.session.destroy(() => {});
    if (wantsJson(req)) return res.status(401).json({ error: 'Authentication required' });
    return res.redirect('/login');
  }

  req.user = user;          // { id, username, role } — never includes password_hash
  res.locals.user = user;   // available in EJS views
  next();
}

/**
 * requireRole('admin', 'custodian') -> logged in AND role is one of those.
 * Includes the login check, so it can be used on its own.
 */
function requireRole(...allowed) {
  return [
    requireLogin,
    (req, res, next) => {
      if (allowed.includes(req.user.role)) return next();
      if (wantsJson(req)) return res.status(403).json({ error: 'Forbidden' });
      return res.status(403).send('403 Forbidden: you do not have permission to view this page.');
    },
  ];
}

// Inventory management: admins and custodians only.
const requireInventoryAccess = requireRole(ROLES.ADMIN, ROLES.CUSTODIAN);

/**
 * Call after verifyCredentials() succeeds. Regenerating the session ID on login
 * prevents session fixation (an attacker planting a known session ID pre-login).
 */
function loginUser(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;   // store only the id; role is looked up per request
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

function logoutUser(req, res) {
  return new Promise((resolve) => {
    req.session.destroy(() => {
      res.clearCookie('sid');
      resolve();
    });
  });
}

module.exports = { requireLogin, requireRole, requireInventoryAccess, loginUser, logoutUser };
