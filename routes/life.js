const express = require('express');
const router = express.Router();
const Life = require('../dataModels/life.js'); // Life
const SchumannResonance = require('../dataModels/schumannResonance.js'); // Life model// model
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
router.post('/:lifeId/update-phase', authenticateToken, verifyLifeId, async (req, res) => {
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

// Helper functions for synchronizing timestamps and getting phase differences
function getClosestSchumannResonance(lifeTimestamp, schumannResonances) {
    let closestResonance = null;
    let smallestTimeDiff = Infinity;

    schumannResonances.forEach(resonance => {
        const timeDiff = Math.abs(resonance.timestamp - lifeTimestamp);
        if (timeDiff < smallestTimeDiff) {
            smallestTimeDiff = timeDiff;
            closestResonance = resonance;
        }
    });

    return closestResonance;
}

function calculatePhaseDifference(lifePhase, schumannPhase) {
    const phaseDiff = Math.abs(lifePhase - schumannPhase);
    return phaseDiff > 180 ? 360 - phaseDiff : phaseDiff; // Ensure the phase difference is between 0-180 degrees
}

function calculateInterference(phaseDifference) {
    if (phaseDifference <= 90) {
        return (90 - phaseDifference) / 90; // Constructive interference (0-1 range)
    } else if (phaseDifference <= 180) {
        return (phaseDifference - 90) / 90; // Destructive interference (0-1 range)
    }
    return 0;
}

// Endpoint to get brainwave-Schumann alignment and log interference
router.get('/:lifeId/schumann-alignment', authenticateToken, verifyLifeId, async (req, res) => {
    const { lifeId } = req.params;

    try {
        // Fetch the life record based on lifeId using findByPk
        const life = await Life.findByPk(lifeId);

        if (!life) {
            return res.status(404).json({ error: 'Life not found' });
        }

        // Fetch all Schumann resonance records
        const schumannResonances = await SchumannResonance.findAll();
        if (!schumannResonances.length) {
            return res.status(404).json({ error: 'No Schumann resonance data found' });
        }

        // Find the closest Schumann resonance timestamp to the life’s timestamp
        const closestSchumann = getClosestSchumannResonance(life.timestamp, schumannResonances);

        // Define the brainwave bands (this should correspond to the phase fields in the Life model)
        const brainwaveBands = ['Alpha', 'Beta', 'Theta', 'Delta', 'Gamma']; // Example brainwave bands

        // Initialize an array to hold the promises
        const interferencePromises = [];

        // Loop through the brainwave bands and calculate the interference for each
        for (const band of brainwaveBands) {
            const bandPhase = life[`phase${band}`]; // Assuming the phases are named phaseAlpha, phaseBeta, etc.

            if (bandPhase === undefined) continue; // Skip if phase data is not available for this band

            // Calculate phase difference and interference
            const phaseDifference = calculatePhaseDifference(bandPhase, closestSchumann[`phase${band}`]);
            const interferenceValue = calculateInterference(phaseDifference);

            // Log interference into the appropriate field in the life record
            if (phaseDifference <= 90) {
                life.objectiveConstructiveInterference = interferenceValue;
            } else if (phaseDifference <= 180) {
                life.objectiveDestructiveInterference = interferenceValue;
            }

            // Push the save operation into the array
            interferencePromises.push(life.save());
        }

        // Wait for all interference calculations to complete and the life data to be saved
        await Promise.all(interferencePromises);

        res.status(200).json({ message: 'Brainwave-Schumann alignment phase calculated and logged' });

    } catch (err) {
        console.error('Error fetching life or Schumann data:', err);
        res.status(500).json({ error: 'Failed to fetch life or Schumann data' });
    }
});

module.exports = router;