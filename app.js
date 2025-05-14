// app.js
const express = require('express');
const dotenv = require('dotenv');
const {
    BrainwaveAlignmentCohort,
    CohortCheckin,
    InterferenceReceipt,
    LifeAccount,
    LifeBalance,
    LifeBrainwave,
    SchumannResonance
} = require('./dataModels/associations.js');

dotenv.config();
const app = express();
app.use(express.json());

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

// === DB Sync & Server Start ===
async function startServer() {
    try {
        // Sync models in order of dependencies
        await BrainwaveAlignmentCohort.sync({ alter: true });
        console.log('BrainwaveAlignmentCohort table synced');

        await LifeAccount.sync({ alter: true });
        console.log('LifeAccount table synced');

        await LifeBalance.sync({ alter: true });
        console.log('LifeBalance table synced');

        await LifeBrainwave.sync({ alter: true });
        console.log('LifeBrainwave table synced');

        await InterferenceReceipt.sync({ alter: true });
        console.log('InterferenceReceipt table synced');

        await CohortCheckin.sync({ alter: true });
        console.log('CohortCheckin table synced');

        await SchumannResonance.sync({ alter: true });
        console.log('SchumannResonance table synced');

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    } catch (err) {
        console.error('Database sync failed:', err);
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
