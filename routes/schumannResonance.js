// routes/schumannResonance.js
const express = require('express');
const router = express.Router();
const SchumannPhaseData = require('../dataModels/schumannResonance.js');  // Import the SchumannPhaseData model

// POST: Log Schumann resonance phase data
router.post('/log', async (req, res) => {
    const { phase, location } = req.body;

    // Ensure phase and location are provided in the request body
    if (typeof phase !== 'number' || !location) {
        return res.status(400).json({ error: 'Phase and location are required' });
    }

    try {
        // Create a new entry for Schumann phase data
        const timestamp = new Date();  // Current timestamp
        await SchumannPhaseData.create({
            phase,
            timestamp,
            location,
        });

        // Respond with success message
        res.status(200).json({ message: 'Schumann phase data logged successfully' });
    } catch (error) {
        console.error('Error logging Schumann phase data:', error);
        res.status(500).json({ error: 'Failed to log Schumann phase data' });
    }
});

module.exports = router;