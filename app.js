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
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
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
    const items = db.prepare('SELECT name, description, status FROM equipment ORDER BY name').all();
    res.render('dashboard', { items });
});

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
