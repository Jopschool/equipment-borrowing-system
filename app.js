const express = require('express');
const path = require('path');
require('dotenv').config();

const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const { db, EQUIPMENT_STATUSES } = require('./config/database');
const { requireLogin, requireInventoryAccess } = require('./middleware/auth');
const csrf = require('./middleware/csrf');
const authRoutes = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');
const requestRoutes = require('./routes/requests');

const isProd = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.error('SESSION_SECRET must be set (32+ chars). See .env.example.');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
if (isProd) app.set('trust proxy', 1); // needed for secure cookies behind an HTTPS proxy

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// Basic hardening headers (no extra dependency).
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    });
    next();
});

app.use(session({
    name: 'sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 8 * 60 * 60 * 1000,
    },
}));

app.use(csrf);

app.get('/', (req, res) => res.redirect(req.session.userId ? '/dashboard' : '/login'));

app.use(authRoutes);

app.get('/dashboard', requireLogin, (req, res) => {
    const items = db.prepare(`
        SELECT e.id, e.name, e.description, e.status,
               EXISTS (
                   SELECT 1 FROM requests r
                   WHERE r.equipment_id = e.id AND r.user_id = ?
                     AND r.status IN ('pending', 'approved')
               ) AS has_active_request,
               EXISTS (
                   SELECT 1 FROM requests r
                   WHERE r.equipment_id = e.id AND r.status = 'approved'
                     AND e.status = 'borrowed' AND r.due_date < date('now')
               ) AS is_overdue
        FROM equipment e
        ORDER BY e.name
    `).all(req.user.id);
    const overdueCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM requests r
        JOIN equipment e ON e.id = r.equipment_id
        WHERE r.status = 'approved' AND e.status = 'borrowed'
          AND r.due_date < date('now')
    `).get().count;
    const myRequests = req.user.role === 'borrower'
        ? db.prepare(`
            SELECT r.id, r.status, r.requested_at, r.due_date, r.returned_at, e.name AS equipment_name
            FROM requests r
            JOIN equipment e ON e.id = r.equipment_id
            WHERE r.user_id = ?
            ORDER BY r.requested_at DESC
          `).all(req.user.id)
        : [];
    res.render('layout', {
        title: 'Dashboard',
        contentView: 'dashboard',
        items,
        overdueCount,
        myRequests,
        error: req.query.error || null,
        success: req.query.success || null,
        today: db.prepare("SELECT date('now') AS today").get().today,
    });
});

app.use(requestRoutes);
app.use('/inventory', requireInventoryAccess, inventoryRoutes);

app.use((req, res) => res.status(404).send('404 Not Found'));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Something went wrong.');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
