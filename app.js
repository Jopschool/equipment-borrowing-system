const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.use(express.urlencoded({ extended: true }));
app.use(express.json());


app.use(express.static(path.join(__dirname, 'public')));


app.get('/', (req, res) => {
    res.send('Equipment Borrowing System - Server is Running!');
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});