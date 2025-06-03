// app.js

// --- FIX: dotenv.config() MUST BE THE VERY FIRST THING ---
require('dotenv').config();
// --- END FIX ---

const express = require('express');
const cors = require('cors');
const path = require("path");
const http = require('http');
const cron = require('node-cron');

const { initWebSocketServer } = require('./websocketHandler');
const { calculateAndStorePLVsForCohort, calculateAndStoreSchumannAlignment } = require('./brainwaveMiner');

// Now, when associations.js (and thus database.js) is required,
// process.env will already have the values from your .env file.
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

app.use(cors({
    origin: 'http://localhost:1234',
    credentials: true,
}));

app.use(express.static(path.join(__dirname, 'public')));

// === Routes ===
const loginRoutes = require('./routes/login');
const lifeRoutes = require('./routes/life');
const brainwaveAlignmentCohortRoutes = require('./routes/brainwaveAlignmentCohort');
const interferenceReceiptRoutes = require('./routes/interferenceReceipt');
const schumannResonanceRoutes = require('./routes/schumannResonance');
const brainwaveAnalyticsRoutes = require('./routes/brainwaveAnalytics');

// === Register Routes ===
app.use('/api/login', loginRoutes);
app.use('/api/life', lifeRoutes);
app.use('/api/brainwaveAlignmentCohort', brainwaveAlignmentCohortRoutes);
app.use('/api/interferenceReceipt', interferenceReceiptRoutes);
app.use('/api/schumannResonance', schumannResonanceRoutes);
app.use('/api/brainwaveAnalytics', brainwaveAnalyticsRoutes);

// === Create HTTP Server ===
const httpServer = http.createServer(app);

// === Initialize WebSocket Server ===
initWebSocketServer(httpServer);

// === Scheduled Brainwave Mining Tasks ===
const config = {
    isPLVCalculationActive: process.env.ENABLE_PLV_CALCULATION === 'true',
    isSchumannCalculationActive: process.env.ENABLE_SCHUMANN_CALCULATION === 'true',
};

cron.schedule('*/15 * * * * *', async () => {
    if (config.isPLVCalculationActive) {
        console.log(`[${new Date().toISOString()}] Running scheduled PLV calculation...`);
        await calculateAndStorePLVsForCohort();
    }
});

cron.schedule('*/30 * * * * *', async () => {
    if (config.isSchumannCalculationActive) {
        console.log(`[${new Date().toISOString()}] Running scheduled Schumann alignment calculation...`);
        await calculateAndStoreSchumannAlignment();
    }
});


// === DB Sync & Server Start ===
async function startServer() {
    try {
        // Sync models in order of dependencies.
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

        const PORT = process.env.PORT || 3000;
        httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    } catch (err) {
        console.error('Database sync failed:', err);
        process.exit(1);
    }
}

startServer()
    .then(() => {
        console.log('Server startup completed');
    })
    .catch(err => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });

module.exports = app;