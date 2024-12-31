const express = require('express');
const cors = require('cors'); // Cross-Origin Resource Sharing middleware
const bodyParser = require('body-parser'); // Middleware to parse incoming requests
const dotenv = require('dotenv'); // Import dotenv

// Import routes
const lifeRoutes = require('./routes/life');
const neuralSynchronyCohortRoutes = require('./routes/neuralSynchronyCohort'); // Neural synchrony cohort routes
const interferenceReceiptRoutes = require('./routes/interferenceReceipt'); // Interference receipt routes
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
app.use('/api/life', lifeRoutes); // Life-related routes
app.use('/api/neuralSynchronyCohort', neuralSynchronyCohortRoutes); // Neural synchrony cohort routes
app.use('/api/interferenceReceipt', interferenceReceiptRoutes); // Interference receipt routes

// Apply the authentication middleware globally for protected routes
app.use(authenticateToken);

// Default route for 404 handling
app.all('*', (req, res) => {
    res.status(404).json({ message: 'Resource not found' });
});

module.exports = app;