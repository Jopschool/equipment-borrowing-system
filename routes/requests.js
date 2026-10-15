'use strict';

const express = require('express');
const { db, ROLES } = require('../config/database');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
const requireBorrower = requireRole(ROLES.BORROWER);
const requireCustodian = requireRole(ROLES.ADMIN, ROLES.CUSTODIAN);

const toId = (value) => (/^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null);

function isValidDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= new Date().toISOString().slice(0, 10);
}

const requestQueries = {
  pending: db.prepare(`
    SELECT r.id, r.requested_at, r.due_date, u.username, e.name AS equipment_name
    FROM requests r
    JOIN users u ON u.id = r.user_id
    JOIN equipment e ON e.id = r.equipment_id
    WHERE r.status = 'pending'
    ORDER BY r.requested_at, r.id
  `),
  approved: db.prepare(`
    SELECT r.id, r.requested_at, r.due_date, u.username, e.name AS equipment_name,
           (r.due_date < date('now')) AS is_overdue
    FROM requests r
    JOIN users u ON u.id = r.user_id
    JOIN equipment e ON e.id = r.equipment_id
    WHERE r.status = 'approved' AND e.status = 'borrowed'
    ORDER BY r.due_date, r.id
  `),
};

router.post('/request-borrow/:equipmentId', requireBorrower, (req, res, next) => {
  const equipmentId = toId(req.params.equipmentId);
  const dueDate = req.body.due_date;
  if (equipmentId === null || !isValidDueDate(dueDate)) {
    return res.redirect('/dashboard?error=' + encodeURIComponent('Choose a valid due date and try again.'));
  }

  try {
    const createRequest = db.transaction(() => {
      const equipment = db.prepare('SELECT status FROM equipment WHERE id = ?').get(equipmentId);
      if (!equipment || equipment.status !== 'available') return 'unavailable';

      const activeRequest = db.prepare(`
        SELECT 1 FROM requests
        WHERE user_id = ? AND equipment_id = ? AND status IN ('pending', 'approved')
      `).get(req.user.id, equipmentId);
      if (activeRequest) return 'duplicate';

      db.prepare(`
        INSERT INTO requests (user_id, equipment_id, due_date)
        VALUES (?, ?, ?)
      `).run(req.user.id, equipmentId, dueDate);
      return 'created';
    });

    const result = createRequest();
    if (result === 'unavailable') {
      return res.redirect('/dashboard?error=' + encodeURIComponent('That equipment is no longer available.'));
    }
    if (result === 'duplicate') {
      return res.redirect('/dashboard?error=' + encodeURIComponent('You already have an active request for that equipment.'));
    }
    return res.redirect('/dashboard?success=' + encodeURIComponent('Borrowing request submitted for approval.'));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.redirect('/dashboard?error=' + encodeURIComponent('You already have an active request for that equipment.'));
    }
    return next(err);
  }
});

router.get('/admin/requests', requireCustodian, (req, res) => {
  res.render('layout', {
    title: 'Borrowing requests',
    contentView: 'requests',
    pendingRequests: requestQueries.pending.all(),
    approvedRequests: requestQueries.approved.all(),
    error: req.query.error || null,
    success: req.query.success || null,
  });
});

router.get('/history', requireCustodian, (req, res) => {
  const history = db.prepare(`
    SELECT r.id, r.requested_at, r.due_date, r.returned_at, r.status,
           u.username, e.name AS equipment_name
    FROM requests r
    JOIN users u ON u.id = r.user_id
    JOIN equipment e ON e.id = r.equipment_id
    WHERE r.status IN ('returned', 'rejected')
    ORDER BY COALESCE(r.returned_at, r.requested_at) DESC, r.id DESC
  `).all();

  res.render('layout', {
    title: 'Borrowing history',
    contentView: 'history',
    history,
  });
});

const approvalTransaction = db.transaction((requestId) => {
  const request = db.prepare(`
    SELECT equipment_id FROM requests WHERE id = ? AND status = 'pending'
  `).get(requestId);
  if (!request) return 'not-pending';

  const equipmentUpdate = db.prepare(`
    UPDATE equipment SET status = 'borrowed'
    WHERE id = ? AND status = 'available'
  `).run(request.equipment_id);
  if (equipmentUpdate.changes !== 1) return 'unavailable';

  const requestUpdate = db.prepare(`
    UPDATE requests SET status = 'approved'
    WHERE id = ? AND status = 'pending'
  `).run(requestId);
  if (requestUpdate.changes !== 1) throw new Error('Request state changed during approval.');

  return 'approved';
});

router.post('/requests/:id/approve', requireCustodian, (req, res, next) => {
  const requestId = toId(req.params.id);
  if (requestId === null) {
    return res.redirect('/admin/requests?error=' + encodeURIComponent('Invalid request.'));
  }

  try {
    const result = approvalTransaction(requestId);
    if (result !== 'approved') {
      const message = result === 'unavailable'
        ? 'That equipment is no longer available; the request was not approved.'
        : 'That request is no longer pending.';
      return res.redirect('/admin/requests?error=' + encodeURIComponent(message));
    }
    return res.redirect('/admin/requests?success=' + encodeURIComponent('Request approved.'));
  } catch (err) {
    return next(err);
  }
});

router.post('/requests/:id/reject', requireCustodian, (req, res, next) => {
  const requestId = toId(req.params.id);
  if (requestId === null) {
    return res.redirect('/admin/requests?error=' + encodeURIComponent('Invalid request.'));
  }

  try {
    const result = db.prepare(`
      UPDATE requests SET status = 'rejected'
      WHERE id = ? AND status = 'pending'
    `).run(requestId);
    const target = result.changes
      ? '/admin/requests?success=' + encodeURIComponent('Request rejected.')
      : '/admin/requests?error=' + encodeURIComponent('That request is no longer pending.');
    return res.redirect(target);
  } catch (err) {
    return next(err);
  }
});

const returnTransaction = db.transaction((requestId) => {
  const request = db.prepare(`
    SELECT equipment_id FROM requests WHERE id = ? AND status = 'approved'
  `).get(requestId);
  if (!request) return 'not-approved';

  const equipmentUpdate = db.prepare(`
    UPDATE equipment SET status = 'available'
    WHERE id = ? AND status = 'borrowed'
  `).run(request.equipment_id);
  if (equipmentUpdate.changes !== 1) return 'equipment-state';

  const requestUpdate = db.prepare(`
    UPDATE requests SET status = 'returned', returned_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'approved'
  `).run(requestId);
  if (requestUpdate.changes !== 1) throw new Error('Request state changed during return.');
  return 'returned';
});

router.post('/requests/:id/return', requireCustodian, (req, res, next) => {
  const requestId = toId(req.params.id);
  if (requestId === null) {
    return res.redirect('/admin/requests?error=' + encodeURIComponent('Invalid request.'));
  }

  try {
    const result = returnTransaction(requestId);
    if (result !== 'returned') {
      const message = result === 'equipment-state'
        ? 'The equipment is not marked as borrowed, so it could not be returned.'
        : 'That request is no longer an active loan.';
      return res.redirect('/admin/requests?error=' + encodeURIComponent(message));
    }
    return res.redirect('/admin/requests?success=' + encodeURIComponent('Equipment marked as returned.'));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
