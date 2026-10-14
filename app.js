const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to parse URL-encoded bodies (for forms) and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files (CSS, JS, images) from the public folder
app.use(express.static(path.join(__dirname, 'public')));
// Import and use equipment routes

const equipmentRoutes = require('./routes/equipment');
app.use('/equipment', equipmentRoutes);

// Basic route for testing
app.get('/', (req, res) => {
    res.send('Equipment Borrowing System - Server is Running!');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});