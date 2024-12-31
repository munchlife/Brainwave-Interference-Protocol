const express = require('express');
const router = express.Router();
const Life = require('../dataModels/life.js'); // Import the Life model (to link with Life)
const InterferenceReceipt = require('../dataModels/interferenceReceipt.js'); // Import the InterferenceReceipt model
const authenticateToken = require('../middlewares/authenticateToken'); // Import the middleware

// GET: Retrieve all InterferenceReceipt records for a specific lifeId
router.get('/receipts/:lifeId', authenticateToken, async (req, res) => {
    const { lifeId } = req.params;

    try {
        // Check if the lifeId exists in the Life table
        const lifeExists = await Life.findByPk(lifeId);

        if (!lifeExists) {
            return res.status(404).json({ error: 'Life not found' });
        }

        // Fetch all InterferenceReceipt records related to the specific lifeId
        const interferenceReceipts = await InterferenceReceipt.findAll({
            where: { lifeId },
        });

        // If no records found, send an empty array response
        if (interferenceReceipts.length === 0) {
            return res.status(404).json({ message: 'No interference receipts found for this lifeId' });
        }

        return res.json(interferenceReceipts);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// GET: Retrieve a specific InterferenceReceipt record by ID
router.get('/receipt/:id', authenticateToken, async (req, res) => {
    try {
        const interferenceReceipt = await InterferenceReceipt.findByPk(req.params.id);
        if (!interferenceReceipt) {
            return res.status(404).json({ error: 'InterferenceReceipt not found' });
        }
        return res.json(interferenceReceipt);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// POST: Create a new InterferenceReceipt record
router.post('/create', authenticateToken, async (req, res) => {
    const {
        lifeId,
        interferenceDegree,
        bandPowerDelta,
        bandPowerTheta,
        bandPowerAlpha,
        bandPowerBeta,
        bandPowerGamma,
        frequencyWeightedBandpower,
        wordDefinition,
    } = req.body;

    try {
        // Fetch Life details
        const life = await Life.findByPk(lifeId);
        if (!life) {
            return res.status(404).json({ error: 'Life not found' });
        }

        // Retrieve previous bandpower values
        const previousBandpowers = {
            delta: life.bandpowerDelta,
            theta: life.bandpowerTheta,
            alpha: life.bandpowerAlpha,
            beta: life.bandpowerBeta,
            gamma: life.bandpowerGamma,
            frequencyWeighted: life.frequencyWeightedBandpower,
        };

        const currentBandpowers = {
            delta: bandPowerDelta,
            theta: bandPowerTheta,
            alpha: bandPowerAlpha,
            beta: bandPowerBeta,
            gamma: bandPowerGamma,
            frequencyWeighted: frequencyWeightedBandpower,
        };

        let constructiveInterferenceUnits = 0;
        let destructiveInterferenceUnits = 0;

        // Calculate percent changes for each band
        const percentChanges = {};
        for (const band in previousBandpowers) {
            if (previousBandpowers[band] !== null) {
                percentChanges[band] = ((currentBandpowers[band] - previousBandpowers[band]) / previousBandpowers[band]) * 100;

                // Determine interference units
                if (percentChanges[band] >= 10) {
                    constructiveInterferenceUnits += Math.floor(percentChanges[band] / 10);
                } else if (percentChanges[band] <= -10) {
                    destructiveInterferenceUnits += Math.ceil(percentChanges[band] / 10);
                }
            } else {
                percentChanges[band] = null; // No previous value to compare
            }
        }

        // Update Life's bandpower fields
        life.bandpowerDelta = bandPowerDelta;
        life.bandpowerTheta = bandPowerTheta;
        life.bandpowerAlpha = bandPowerAlpha;
        life.bandpowerBeta = bandPowerBeta;
        life.bandpowerGamma = bandPowerGamma;
        life.frequencyWeightedBandpower = frequencyWeightedBandpower;
        await life.save();

        // Create a new InterferenceReceipt entry
        const newInterferenceReceipt = await InterferenceReceipt.create({
            lifeId: life.id,
            interferenceDegree,
            bandPowerDeltaIncrease: percentChanges.delta >= 10 ? percentChanges.delta : null,
            bandPowerDeltaDecrease: percentChanges.delta <= -10 ? percentChanges.delta : null,
            bandPowerThetaIncrease: percentChanges.theta >= 10 ? percentChanges.theta : null,
            bandPowerThetaDecrease: percentChanges.theta <= -10 ? percentChanges.theta : null,
            bandPowerAlphaIncrease: percentChanges.alpha >= 10 ? percentChanges.alpha : null,
            bandPowerAlphaDecrease: percentChanges.alpha <= -10 ? percentChanges.alpha : null,
            bandPowerBetaIncrease: percentChanges.beta >= 10 ? percentChanges.beta : null,
            bandPowerBetaDecrease: percentChanges.beta <= -10 ? percentChanges.beta : null,
            bandPowerGammaIncrease: percentChanges.gamma >= 10 ? percentChanges.gamma : null,
            bandPowerGammaDecrease: percentChanges.gamma <= -10 ? percentChanges.gamma : null,
            constructiveInterferenceUnits,
            destructiveInterferenceUnits,
            wordDefinition,
        });

        return res.status(201).json(newInterferenceReceipt);
    } catch (err) {
        console.error('Error creating InterferenceReceipt:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;