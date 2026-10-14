
const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipmentController');


function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).render('error', {
      message: 'Forbidden: administrator access required.',
    });
  }
  next();
}




router.get('/', requireLogin, equipmentController.listAvailable);


router.post('/borrow', requireLogin, equipmentController.requestBorrow);


router.get('/my-requests', requireLogin, equipmentController.myRequests);




router.get('/admin/requests', requireLogin, requireAdmin, equipmentController.listRequests);


router.post('/admin/requests/:id/approve', requireLogin, requireAdmin, equipmentController.approveRequest);


router.post('/admin/requests/:id/return', requireLogin, requireAdmin, equipmentController.returnEquipment);

module.exports = router;
