// app.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require("path");

const {
    BrainwaveAlignmentCohort,
    CohortCheckin,
    InterferenceReceipt,
    LifeAccount,
    LifeBalance,
    LifeBrainwave,
    SchumannResonance,
    CohortMember // <-- Crucial: Import the new junction table model
} = require('./dataModels/associations.js');

dotenv.config();
const app = express();
app.use(express.json());

app.use(cors({
    origin: 'http://localhost:63342', // Ensure this matches your frontend origin
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

// === DB Sync & Server Start ===
async function startServer() {
    try {
        // Sync models in order of dependencies.
        // Independent tables should be synced first, then tables that depend on them.
        // Junction tables (like CohortMember) must be synced AFTER the tables they link (LifeAccount, BrainwaveAlignmentCohort).

        await LifeAccount.sync({ alter: true });
        console.log('LifeAccount table synced');

        await BrainwaveAlignmentCohort.sync({ alter: true });
        console.log('BrainwaveAlignmentCohort table synced');

        await CohortMember.sync({ alter: true }); // <-- Crucial: Sync the junction table here
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