const express = require('express');
const router = express.Router();
const LifeAccount = require('../dataModels/lifeAccount.js'); // Import the Life model (to link with Life)
const InterferenceReceipt = require('../dataModels/interferenceReceipt.js'); // Import the InterferenceReceipt model
const authenticateToken = require('../middlewares/authenticateToken');
const verifyLifeId = require("../middlewares/verifyLifeId"); // Import the middleware

// GET: Retrieve all InterferenceReceipt records for a specific lifeId
router.get('/receipts/:lifeId', authenticateToken, verifyLifeId, async (req, res) => {
    const { lifeId } = req.params;

    try {
        // Check if the lifeId exists in the LifeAccount table using findOne
        const lifeExists = await LifeAccount.findOne({
            where: { lifeId } // Using lifeId in the where clause directly
        });

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
router.get('/receipt/:id', authenticateToken, verifyLifeId, async (req, res) => {
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

router.post('/create/:lifeId', authenticateToken, verifyLifeId, async (req, res) => {
    const {
        interferenceDegree,
        bandPowerDelta,
        bandPowerTheta,
        bandPowerAlpha,
        bandPowerBeta,
        bandPowerGamma,
        frequencyWeightedBandpower,
        wordDefinition,
        interfererEmail, // Email address of the interferer
    } = req.body;

    const { lifeId } = req.params;

    try {
        // Fetch Life details by lifeId using findOne
        const life = await LifeAccount.findOne({
            where: { lifeId } // Fetch LifeAccount using the lifeId
        });

        if (!life) {
            return res.status(404).json({ error: 'Life not found' });
        }

        // Validate and fetch the interferer if the email is provided
        let interferer = null;
        if (interfererEmail) {
            if (typeof interfererEmail !== 'string' || !interfererEmail) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            interferer = await LifeAccount.findOne({
                where: { email: interfererEmail }, // Using findOne for interferer based on email
            });

            if (!interferer) {
                return res.status(404).json({ error: 'Interferer not found' });
            }
        }

        // Retrieve previous bandpower values from the LifeAccount
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

        // Calculate percent changes for each band and interference units
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

        // Update Life's bandpower fields with the new values
        life.bandpowerDelta = bandPowerDelta;
        life.bandpowerTheta = bandPowerTheta;
        life.bandpowerAlpha = bandPowerAlpha;
        life.bandpowerBeta = bandPowerBeta;
        life.bandpowerGamma = bandPowerGamma;
        life.frequencyWeightedBandpower = frequencyWeightedBandpower;
        await life.save();

        // Award interference units to the interferer (if found)
        if (interferer) {
            interferer.constructiveInterferenceTotal += constructiveInterferenceUnits;
            interferer.destructiveInterferenceTotal += destructiveInterferenceUnits;
            await interferer.save();
        }

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
            interfererId: interferer ? interferer.id : null, // Reference interferer if provided
        });

        return res.status(201).json(newInterferenceReceipt);
    } catch (err) {
        return res.status(500).json({ error: 'Server error', details: err.message });
    }
});

module.exports = router;