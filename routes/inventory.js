'use strict';

const express = require('express');
const { db, ROLES, EQUIPMENT_STATUSES } = require('../config/database');
const { requireRole } = require('../middleware/auth');

// Mounted behind requireInventoryAccess (admin + custodian) in app.js.
const router = express.Router();

const q = {
  all:    db.prepare('SELECT id, name, description, status FROM equipment ORDER BY name'),
  insert: db.prepare('INSERT INTO equipment (name, description, status) VALUES (?, ?, ?)'),
  update: db.prepare('UPDATE equipment SET name = ?, description = ?, status = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM equipment WHERE id = ?'),
};

const clean = (body) => ({
  name: String(body.name || '').trim().slice(0, 100),
  description: String(body.description || '').trim().slice(0, 500),
  status: String(body.status || 'available'),
});
const valid = ({ name, status }) => name.length > 0 && EQUIPMENT_STATUSES.includes(status);
const toId = (v) => (/^\d+$/.test(v) ? Number(v) : null);

router.get('/', (req, res) => {
  res.render('inventory', {
    items: q.all.all(),
    statuses: EQUIPMENT_STATUSES,
    canDelete: req.user.role === ROLES.ADMIN,
    error: null,
  });
});

router.post('/', (req, res) => {
  const e = clean(req.body);
  if (!valid(e)) return res.status(400).send('Invalid equipment data.');
  q.insert.run(e.name, e.description, e.status);
  res.redirect('/inventory');
});

router.post('/:id/update', (req, res) => {
  const id = toId(req.params.id);
  const e = clean(req.body);
  if (id === null || !valid(e)) return res.status(400).send('Invalid equipment data.');
  q.update.run(e.name, e.description, e.status, id);
  res.redirect('/inventory');
});

// Deleting is destructive, so it is admin-only (custodians can still retire items via status).
router.post('/:id/delete', requireRole(ROLES.ADMIN), (req, res) => {
  const id = toId(req.params.id);
  if (id === null) return res.status(400).send('Invalid id.');
  q.remove.run(id);
  res.redirect('/inventory');
});

module.exports = router;
