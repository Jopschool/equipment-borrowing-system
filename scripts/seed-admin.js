'use strict';
// Usage: ADMIN_USERNAME=admin ADMIN_PASSWORD='a-long-passphrase' npm run seed:admin
require('dotenv').config();
const { createUser, ROLES } = require('../config/database');

(async () => {
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD environment variables.');
    process.exit(1);
  }
  try {
    const u = await createUser(ADMIN_USERNAME, ADMIN_PASSWORD, ROLES.ADMIN);
    console.log(`Created admin "${u.username}" (id ${u.id}).`);
  } catch (e) {
    console.error('Failed:', /UNIQUE/.test(e.message) ? 'username already exists' : e.message);
    process.exit(1);
  }
})();
