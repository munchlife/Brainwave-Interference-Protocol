const express = require('express');
const cors = require('cors'); // Cross-Origin Resource Sharing middleware
const bodyParser = require('body-parser'); // Middleware to parse incoming requests
const dotenv = require('dotenv'); // Import dotenv

// Import routes
const loginRoutes = require('./routes/login');
const lifeRoutes = require('./routes/life');
const brainwaveAlignmentCohortRoutes = require('./routes/brainwaveAlignmentCohort'); // Neural synchrony cohort routes
const interferenceReceiptRoutes = require('./routes/interferenceReceipt'); // Interference receipt routes
const schumannResonanceRoutes = require('./routes/schumannResonance');
const authenticateToken = require('./middlewares/authenticateToken');

// Load environment variables from .env file
dotenv.config(); // This loads the .env file variables into process.env

// Initialize the app
const app = express();

// Middleware setup
app.use(cors()); // Enable CORS for all domains (can be restricted in production)
app.use(bodyParser.json()); // Parse JSON bodies
app.use(bodyParser.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Set up the routes
app.use('/api/login', loginRoutes);
app.use('/api/life', lifeRoutes); // Life-related routes
app.use('/api/brainwaveAlignmentCohort', brainwaveAlignmentCohortRoutes); // Neural synchrony cohort routes
app.use('/api/interferenceReceipt', interferenceReceiptRoutes); // Interference receipt routes
app.use('/api/schumannResonance', schumannResonanceRoutes);

// Apply the authentication middleware globally for protected routes
app.use(authenticateToken);

// Default route for 404 handling
app.all('*', (req, res) => {
    res.status(404).json({ message: 'Resource not found' });
});

module.exports = app;