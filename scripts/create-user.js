'use strict';
// NEW_ROLE is one of: admin | custodian | borrower (default: borrower)
require('dotenv').config();
const { createUser, ROLES } = require('../config/database');

(async () => {
  const { NEW_USERNAME, NEW_PASSWORD, NEW_ROLE = ROLES.BORROWER } = process.env;
  if (!NEW_USERNAME || !NEW_PASSWORD) {
    console.error('Set NEW_USERNAME and NEW_PASSWORD (and optionally NEW_ROLE).');
    process.exit(1);
  }
  try {
    const u = await createUser(NEW_USERNAME, NEW_PASSWORD, NEW_ROLE);
    console.log(`Created ${u.role} "${u.username}" (id ${u.id}).`);
  } catch (e) {
    console.error('Failed:', /UNIQUE/.test(e.message) ? 'username already exists' : e.message);
    process.exit(1);
  }
})();
