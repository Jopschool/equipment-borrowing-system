'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

// Roles and statuses are defined once and enforced both here (CHECK constraints)
// and in middleware/auth.js, so the DB can never hold a value the app doesn't know.
const ROLES = Object.freeze({
  ADMIN: 'admin',
  CUSTODIAN: 'custodian',
  BORROWER: 'borrower',
});
const EQUIPMENT_STATUSES = Object.freeze(['available', 'borrowed', 'maintenance', 'retired']);

// bcrypt work factor. 12 is a sane 2020s default; raise it as hardware gets faster.
const BCRYPT_ROUNDS = 12;
// bcrypt silently ignores bytes past 72, so cap input to avoid a false sense of security
// (and to stop multi-megabyte passwords being used as a CPU-DoS vector).
const MAX_PASSWORD_LENGTH = 72;
const MIN_PASSWORD_LENGTH = 8;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'equipment.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');   // better concurrency + crash safety
db.pragma('foreign_keys = ON');    // SQLite has FK enforcement OFF by default

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT '${ROLES.BORROWER}'
                  CHECK (role IN ('${Object.values(ROLES).join("','")}'))
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'available'
                CHECK (status IN ('${EQUIPMENT_STATUSES.join("','")}'))
  );

  CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment (status);

  CREATE TABLE IF NOT EXISTS requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected', 'returned')),
    requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    due_date     TEXT NOT NULL,
    returned_at  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_requests_status_requested_at
    ON requests (status, requested_at);
  CREATE INDEX IF NOT EXISTS idx_requests_user_requested_at
    ON requests (user_id, requested_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_active_user_equipment
    ON requests (user_id, equipment_id)
    WHERE status IN ('pending', 'approved');
`);

// --- Prepared statements: always parameterised, never string-concatenated (SQL injection). ---
const stmts = {
  insertUser: db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'),
  userByName: db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?'),
  userById:   db.prepare('SELECT id, username, role FROM users WHERE id = ?'), // no hash
};

// A real hash of a random string, used so login takes the same time whether or not
// the username exists (prevents username enumeration via response timing).
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_ROUNDS);

/**
 * Hash the password and store the user. The plaintext never touches the database.
 * Throws on invalid role/password or a duplicate username.
 */
async function createUser(username, plainPassword, role = ROLES.BORROWER) {
  if (typeof username !== 'string' || !username.trim()) throw new Error('Username is required');
  if (!Object.values(ROLES).includes(role)) throw new Error(`Invalid role: ${role}`);
  if (typeof plainPassword !== 'string' ||
      plainPassword.length < MIN_PASSWORD_LENGTH ||
      Buffer.byteLength(plainPassword) > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} bytes long`);
  }
  const hash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
  const info = stmts.insertUser.run(username.trim(), hash, role);
  return { id: Number(info.lastInsertRowid), username: username.trim(), role };
}

/**
 * Returns { id, username, role } on success, or null. Never reveals *why* it failed.
 */
async function verifyCredentials(username, plainPassword) {
  const row = typeof username === 'string' ? stmts.userByName.get(username.trim()) : undefined;
  const ok = typeof plainPassword === 'string' &&
             Buffer.byteLength(plainPassword) <= MAX_PASSWORD_LENGTH &&
             await bcrypt.compare(plainPassword, row ? row.password_hash : DUMMY_HASH);
  return ok && row ? { id: row.id, username: row.username, role: row.role } : null;
}

const findUserById = (id) => stmts.userById.get(id) || null;

module.exports = {
  db,
  ROLES,
  EQUIPMENT_STATUSES,
  createUser,
  verifyCredentials,
  findUserById,
};
