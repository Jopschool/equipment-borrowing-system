
const EquipmentModel = require('../models/equipmentModel');



const isPositiveInt = (value) => /^\d+$/.test(String(value)) && Number(value) > 0;


function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const [y, m, day] = value.split('-').map(Number);
  if (d.getFullYear() !== y || d.getMonth() + 1 !== m || d.getDate() !== day) return null;
  return d;
}

function validateBorrowInput({ equipmentId, borrowDate, returnDate }) {
  const errors = [];

  if (!equipmentId) errors.push('Equipment ID is required.');
  else if (!isPositiveInt(equipmentId)) errors.push('Equipment ID must be a positive number.');

  if (!borrowDate) errors.push('Borrow date is required.');
  if (!returnDate) errors.push('Return date is required.');

  const start = borrowDate ? parseDate(borrowDate) : null;
  const end = returnDate ? parseDate(returnDate) : null;

  if (borrowDate && !start) errors.push('Borrow date must be a valid date (YYYY-MM-DD).');
  if (returnDate && !end) errors.push('Return date must be a valid date (YYYY-MM-DD).');

  if (start && end) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) errors.push('Borrow date cannot be in the past.');
    if (end < start) errors.push('Return date cannot be before the borrow date.');
  }

  return errors;
}


function handleServerError(res, err, context) {
  console.error(`[equipmentController] ${context}:`, err);
  return res.status(500).render('error', {
    message: 'Something went wrong on our side. Please try again later.',
  });
}


exports.listAvailable = async (req, res) => {
  try {
    const equipment = await EquipmentModel.getAvailable();
    res.render('equipment/list', {
      equipment,
      user: req.session.user,
      error: null,
      success: req.query.success || null,
    });
  } catch (err) {
    handleServerError(res, err, 'listAvailable');
  }
};


exports.requestBorrow = async (req, res) => {
  const { equipmentId, borrowDate, returnDate } = req.body;
  const userId = req.session.user.id;

  
  const fail = async (status, message) => {
    const equipment = await EquipmentModel.getAvailable();
    return res.status(status).render('equipment/list', {
      equipment,
      user: req.session.user,
      error: message,
      success: null,
    });
  };

  try {
    const errors = validateBorrowInput({ equipmentId, borrowDate, returnDate });
    if (errors.length) return fail(400, errors.join(' '));

    const equipment = await EquipmentModel.getById(Number(equipmentId));
    if (!equipment) return fail(404, `Equipment with ID ${equipmentId} does not exist.`);
    if (equipment.status !== 'available') {
      return fail(409, `"${equipment.name}" is not available for borrowing right now.`);
    }

    await EquipmentModel.requestBorrow(userId, Number(equipmentId), borrowDate, returnDate);

    res.redirect('/equipment?success=' + encodeURIComponent('Borrow request submitted. Awaiting admin approval.'));
  } catch (err) {
    handleServerError(res, err, 'requestBorrow');
  }
};

// GET /equipment/my-requests
exports.myRequests = async (req, res) => {
  try {
    const requests = await EquipmentModel.getRequestsByUser(req.session.user.id);
    res.render('equipment/my-requests', { requests, user: req.session.user });
  } catch (err) {
    handleServerError(res, err, 'myRequests');
  }
};


exports.listRequests = async (req, res) => {
  try {
    const requests = await EquipmentModel.getAllRequests();
    res.render('equipment/admin-requests', {
      requests,
      user: req.session.user,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    handleServerError(res, err, 'listRequests');
  }
};


exports.approveRequest = async (req, res) => {
  const { id } = req.params;
  const redirectWith = (type, msg) =>
    res.redirect(`/equipment/admin/requests?${type}=${encodeURIComponent(msg)}`);

  try {
    if (!isPositiveInt(id)) return redirectWith('error', 'Invalid request ID.');

    const request = await EquipmentModel.getRequestById(Number(id));
    if (!request) return redirectWith('error', `Request #${id} was not found.`);
    if (request.status !== 'pending') {
      return redirectWith('error', `Request #${id} is already ${request.status} and cannot be approved.`);
    }

    
    const equipment = await EquipmentModel.getById(request.equipmentId);
    if (!equipment || equipment.status !== 'available') {
      return redirectWith('error', 'This equipment is no longer available, so the request cannot be approved.');
    }

    await EquipmentModel.approveRequest(Number(id), req.session.user.id);
    redirectWith('success', `Request #${id} approved.`);
  } catch (err) {
    handleServerError(res, err, 'approveRequest');
  }
};


exports.returnEquipment = async (req, res) => {
  const { id } = req.params;
  const redirectWith = (type, msg) =>
    res.redirect(`/equipment/admin/requests?${type}=${encodeURIComponent(msg)}`);

  try {
    if (!isPositiveInt(id)) return redirectWith('error', 'Invalid request ID.');

    const request = await EquipmentModel.getRequestById(Number(id));
    if (!request) return redirectWith('error', `Request #${id} was not found.`);
    if (request.status !== 'approved') {
      return redirectWith('error', `Request #${id} is "${request.status}". Only approved (borrowed) items can be marked as returned.`);
    }

    await EquipmentModel.markReturned(Number(id));
    redirectWith('success', `Request #${id} marked as returned.`);
  } catch (err) {
    handleServerError(res, err, 'returnEquipment');
  }
};
