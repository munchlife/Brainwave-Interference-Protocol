// app.js

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require("path");
const http = require('http');
const cron = require('node-cron');

// Import WebSocket handler and Brainwave Miner functions
const { initWebSocketServer } = require('./websocketHandler');
const {
    runMinerTasksForLastEpoch,
    calculateAndStoreGroupBandpowerForCohorts
} = require('./brainwaveMiner');

// Import Sequelize models and associations
const {
    BrainwaveAlignmentCohort,
    CohortCheckin,
    InterferenceReceipt,
    LifeAccount,
    LifeBalance,
    LifeBrainwave,
    SchumannResonance,
    CohortMember
} = require('./dataModels/associations.js');

const app = express();
app.use(express.json());

// Configure CORS for frontend access
app.use(cors({
    origin: 'http://localhost:1234',
    credentials: true,
}));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// === Route Imports ===
const loginRoutes = require('./routes/login');
const lifeRoutes = require('./routes/life');
const brainwaveAlignmentCohortRoutes = require('./routes/brainwaveAlignmentCohort');
const interferenceReceiptRoutes = require('./routes/interferenceReceipt');
const schumannResonanceRoutes = require('./routes/schumannResonance');
const brainwaveAnalyticsRoutes = require('./routes/brainwaveAnalytics');

// === Register API Routes ===
app.use('/api/login', loginRoutes);
app.use('/api/life', lifeRoutes);
app.use('/api/brainwaveAlignmentCohort', brainwaveAlignmentCohortRoutes);
app.use('/api/interferenceReceipt', interferenceReceiptRoutes);
app.use('/api/schumannResonance', schumannResonanceRoutes);
app.use('/api/brainwaveAnalytics', brainwaveAnalyticsRoutes);

// Create HTTP server for Express and WebSockets
const httpServer = http.createServer(app);

// Initialize WebSocket server on the HTTP server
initWebSocketServer(httpServer);

// === Scheduled Brainwave Mining Tasks ===

// Define the duration for global time epochs (e.g., 1000ms for 1-second epochs)
const EPOCH_DURATION_MS = 1000;

// Schedule epoch-aligned PLV and Schumann Alignment calculations
cron.schedule('*/1 * * * * *', async () => { // Runs every second
    try {
        console.log(`[${new Date().toISOString()}] Running epoch-aligned miner tasks...`);
        await runMinerTasksForLastEpoch(EPOCH_DURATION_MS);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error during epoch-aligned miner tasks:`, error);
    }
});

// Schedule Group Bandpower calculation (runs independently, uses relative time window)
cron.schedule('*/1 * * * * *', async () => { // Runs every second
    // Check environment variable to enable/disable this specific task
    if (process.env.ENABLE_GROUP_BANDPOWER_CALCULATION === 'true') {
        try {
            console.log(`[${new Date().toISOString()}] Running scheduled group bandpower calculation...`);
            await calculateAndStoreGroupBandpowerForCohorts();
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error during scheduled group bandpower calculation:`, error);
        }
    }
});


// === Database Synchronization & Server Start ===
async function startServer() {
    try {
        // Sync Sequelize models with the database in dependency order
        await LifeAccount.sync({ alter: true });
        console.log('LifeAccount table synced');

        await BrainwaveAlignmentCohort.sync({ alter: true });
        console.log('BrainwaveAlignmentCohort table synced');

        await CohortMember.sync({ alter: true });
        console.log('CohortMember table synced');

        await LifeBalance.sync({ alter: true });
        console.log('LifeBalance table synced');

        await LifeBrainwave.sync({ alter: true });
        console.log('LifeBrainwave table synced');

        await InterferenceReceipt.sync({ alter: true });
        console.log('InterferenceReceipt table synced');

        await SchumannResonance.sync({ alter: true });
        console.log('SchumannResonance table synced');

        // Start the HTTP server (handles Express routes and WebSockets)
        const PORT = process.env.PORT || 3000;
        httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    } catch (err) {
        console.error('Database sync failed:', err);
        process.exit(1); // Exit process if database synchronization fails
    }
}

// Initiate server startup sequence
startServer()
    .then(() => {
        console.log('Server startup completed');
    })
    .catch(err => {
        console.error('Failed to start server:', err);
        process.exit(1); // Exit process if server fails to start
    });

module.exports = app;