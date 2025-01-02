const express = require('express');
const router = express.Router();
const Life = require('../dataModels/life.js'); // Life model
const authenticateToken = require('../middlewares/authenticateToken'); // Centralized middleware
const verifyLifeId = require('../middlewares/verifyLifeId'); // Centralized middleware

// GET: Get all Life records
router.get('/', authenticateToken, async (req, res) => {
    try {
        const lives = await Life.findAll();
        return res.json(lives);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// GET: Get a specific Life record by lifeId
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const life = await Life.findByPk(req.params.id);
        if (!life) {
            return res.status(404).json({ error: 'Life not found' });
        }
        return res.json(life);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// POST: Create a new Life record
router.post('/create', async (req, res) => {
    const {
        email,
        passcode,
        firstName,
        lastName,
        registered,
        interferenceDegree,
        totalConstructiveInterference,
        totalDestructiveInterference,
    } = req.body;

    try {
        const newLife = await Life.create({
            email,
            passcode,
            firstName,
            lastName,
            registered: registered || false,
            interferenceDegree: interferenceDegree || false,
            totalConstructiveInterference: totalConstructiveInterference || 0,
            totalDestructiveInterference: totalDestructiveInterference || 0,
        });
        return res.status(201).json(newLife);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// POST: Update the latest bandpower readings for a Life
router.post('/:lifeId/update-bandpower', authenticateToken, verifyLifeId, async (req, res) => {
    const {
        bandpowerDelta,
        bandpowerTheta,
        bandpowerAlpha,
        bandpowerBeta,
        bandpowerGamma,
        frequencyWeightedBandpower,
    } = req.body;

    try {
        const life = req.life; // Already validated by middleware

        // Update the bandpower fields
        life.bandpowerDelta = bandpowerDelta;
        life.bandpowerTheta = bandpowerTheta;
        life.bandpowerAlpha = bandpowerAlpha;
        life.bandpowerBeta = bandpowerBeta;
        life.bandpowerGamma = bandpowerGamma;
        life.frequencyWeightedBandpower = frequencyWeightedBandpower;

        // Save the updated life
        await life.save();

        res.status(200).json({ message: 'Bandpower updated successfully', life });
    } catch (err) {
        console.error('Error updating bandpower for life:', err);
        res.status(500).json({ error: 'Failed to update bandpower' });
    }
});

// POST: Update the frequency-weighted phase for each band
router.post('/:lifeId/phase', authenticateToken, verifyLifeId, async (req, res) => {
    const { phase } = req.body;  // phase should be an object with keys for each band (e.g., delta, theta, etc.)

    // Ensure the phase object contains valid values for each band
    const validBands = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
    const phaseKeys = Object.keys(phase || {});

    // Check if all keys in phase are valid bands
    const invalidBands = phaseKeys.filter(key => !validBands.includes(key));
    if (invalidBands.length > 0) {
        return res.status(400).json({ error: `Invalid phase keys: ${invalidBands.join(', ')}` });
    }

    try {
        const life = req.life; // Already validated by middleware

        // Update the phase for each valid band
        validBands.forEach(band => {
            if (phase[band] !== undefined) {
                life[band] = phase[band];  // Store the phase for each band
            }
        });

        // Save the updated life data
        await life.save();

        res.status(200).json({ message: 'Frequency-weighted phase updated successfully', life });
    } catch (err) {
        console.error('Error updating frequency-weighted phase:', err);
        res.status(500).json({ error: 'Failed to update frequency-weighted phase' });
    }
});

module.exports = router;