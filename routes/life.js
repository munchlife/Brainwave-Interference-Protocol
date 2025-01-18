const express = require('express');
const router = express.Router();
const LifeAccount = require('../dataModels/lifeAccount.js'); // Life
const LifeBrainwave = require('../dataModels/lifeBrainwave.js');
const LifeBalance = require('../dataModels/lifeBalance.js');
const SchumannResonance = require('../dataModels/schumannResonance.js'); // Life model// model
const authenticateToken = require('../middlewares/authenticateToken'); // Centralized middleware
const verifyLifeId = require('../middlewares/verifyLifeId'); // Centralized middleware

// GET: Get all Life records
router.get('/', authenticateToken, async (req, res) => {
    try {
        const lives = await LifeAccount.findAll();
        return res.json(lives);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// GET: Get a specific Life record by lifeId
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const life = await LifeAccount.findByPk(req.params.id);
        if (!life) {
            return res.status(404).json({ error: 'Life not found' });
        }
        return res.json(life);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// POST: Update the brainwave phase and bandpower for a Life (creates a new entry in LifeBrainwave table)
router.post('/:lifeId/update-brainwave', authenticateToken, verifyLifeId, async (req, res) => {
    const {
        phase,
        bandpowerDelta,
        bandpowerTheta,
        bandpowerAlpha,
        bandpowerBeta,
        bandpowerGamma,
        frequencyWeightedBandpower
    } = req.body;

    // Validate the phase object
    const validBands = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
    const phaseKeys = Object.keys(phase || {});

    const invalidBands = phaseKeys.filter(key => !validBands.includes(key));
    if (invalidBands.length > 0) {
        return res.status(400).json({ error: `Invalid phase keys: ${invalidBands.join(', ')}` });
    }

    // Validate bandpower values
    if (typeof bandpowerDelta !== 'number' || typeof bandpowerTheta !== 'number' ||
        typeof bandpowerAlpha !== 'number' || typeof bandpowerBeta !== 'number' ||
        typeof bandpowerGamma !== 'number' || typeof frequencyWeightedBandpower !== 'number') {
        return res.status(400).json({ error: 'Bandpower values must be numbers' });
    }

    try {
        const life = req.life; // Already validated by middleware

        // Create a new LifeBrainwave entry in the database
        const newlifeBrainwave = await LifeBrainwave.create({
            lifeId: life.lifeId,
            phaseDelta: phase.delta,
            phaseTheta: phase.theta,
            phaseAlpha: phase.alpha,
            phaseBeta: phase.beta,
            phaseGamma: phase.gamma,
            bandpowerDelta,
            bandpowerTheta,
            bandpowerAlpha,
            bandpowerBeta,
            bandpowerGamma,
            frequencyWeightedBandpower,
            timestamp: new Date()
        });

        res.status(200).json({
            message: 'Brainwave phase and bandpower updated successfully',
            lifeBrainwave: newlifeBrainwave
        });
    } catch (err) {
        console.error('Error updating brainwave data:', err);
        res.status(500).json({ error: 'Failed to update brainwave data' });
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

router.get('/:lifeId/schumann-alignment', authenticateToken, verifyLifeId, async (req, res) => {
    const { lifeId } = req.params;

    try {
        const latestlifeBrainwave = await LifeBrainwave.findOne({
            include: [{
                model: LifeAccount,
                where: { lifeId }
            }],
            order: [['timestamp', 'DESC']]
        });

        if (!latestlifeBrainwave) {
            return res.status(404).json({ error: 'No phase data found for this lifeId' });
        }

        // Filter the phases that are non-null
        const brainwaveBands = ['Alpha', 'Beta', 'Theta', 'Delta', 'Gamma'];
        const validPhases = brainwaveBands.filter(band => latestlifeBrainwave[`phase${band}`] !== null);

        if (validPhases.length === 0) {
            return res.status(404).json({ error: 'No valid phase data found for this lifeId' });
        }

        // Fetch Schumann resonance data
        const schumannResonances = await SchumannResonance.findAll();
        if (!schumannResonances.length) {
            return res.status(404).json({ error: 'No Schumann resonance data found' });
        }

        // Find the closest Schumann resonance timestamp to the life’s timestamp
        const closestSchumann = getClosestSchumannResonance(latestlifeBrainwave.timestamp, schumannResonances);

        // Calculate phase differences and interference for each band
        const interferenceResults = {};

        validPhases.forEach(band => {
            const bandPhase = latestlifeBrainwave[`phase${band}`];
            if (bandPhase !== null) {
                const phaseDifference = calculatePhaseDifference(bandPhase, closestSchumann[`phase${band}`]);
                interferenceResults[band] = {
                    phaseDifference,
                    interference: calculateInterference(phaseDifference),
                };
            }
        });

        // Determine the interference type (constructive or destructive)
        const constructiveInterference = Object.values(interferenceResults)
            .filter(result => result.phaseDifference <= 90)
            .reduce((sum, result) => sum + result.interference, 0);

        const destructiveInterference = Object.values(interferenceResults)
            .filter(result => result.phaseDifference > 90)
            .reduce((sum, result) => sum + result.interference, 0);

        // Log the interference in the LifeBalance table
        const lifeBalanceEntry = await LifeBalance.create({
            lifeId,
            interferenceType: constructiveInterference > destructiveInterference
                ? 'objectiveConstructiveInterference'
                : 'objectiveDestructiveInterference',
            interferenceValue: constructiveInterference > destructiveInterference
                ? constructiveInterference
                : destructiveInterference,
            timestamp: new Date(),
        });

        res.status(200).json({
            message: 'Schumann alignment calculated',
            interferenceResults,
            lifeBalanceEntry,
        });
    } catch (err) {
        console.error('Error in Schumann alignment:', err);
        res.status(500).json({ error: 'Failed to calculate Schumann alignment' });
    }
});

module.exports = router;