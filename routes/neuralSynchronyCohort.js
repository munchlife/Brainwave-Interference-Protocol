const express = require('express');
const router = express.Router();
const { Sequelize, sequelize } = require('../dataModels/database.js');
const NeuralSynchronyCohort = require('../dataModels/neuralSynchronyCohort');
const LifeAccount = require('../dataModels/lifeAccount.js');
const LifeBalance = require('../dataModels/lifeBalance.js');
const LifeSignal = require('../dataModels/lifeSignal.js');
const authenticateToken = require('../middlewares/authenticateToken'); // Import middleware

// GET route to retrieve all cohorts for a specific lifeId
router.get('/:lifeId/cohorts', authenticateToken, async (req, res) => {
    const { lifeId } = req.params;

    try {
        const life = await LifeAccount.findByPk(lifeId, {
            include: [{
                model: NeuralSynchronyCohort,
                as: 'neuralSynchronyCohorts',
            }],
        });

        if (!life) {
            return res.status(404).json({ message: 'Life not found' });
        }

        const cohorts = life.get('neuralSynchronyCohorts') || life['neuralSynchronyCohorts'];
        res.status(200).json(cohorts);
    } catch (err) {
        console.error('Error retrieving cohorts for lifeId:', err);
        res.status(500).json({ error: 'Failed to retrieve cohorts' });
    }
});

// POST: Create a new Neural Synchrony Cohort and associate lives
router.post('/create', authenticateToken, async (req, res) => {
    const { topic, phaseLockingValue, lifeIds } = req.body;

    if (!topic || phaseLockingValue == null || !Array.isArray(lifeIds) || lifeIds.length === 0) {
        return res.status(400).json({ error: 'Missing required fields or invalid lifeIds array' });
    }

    try {
        const newCohort = await NeuralSynchronyCohort.create({ topic, phaseLockingValue });

        const lives = await LifeAccount.findAll({ where: { lifeId: lifeIds } });

        if (lives.length !== lifeIds.length) {
            return res.status(404).json({ error: 'One or more lifeIds not found' });
        }

        await Promise.all(
            lives.map(life => life.update({ neuralSynchronyCohortId: newCohort.neuralSynchronyCohortId }))
        );

        res.status(201).json({ message: 'Neural Synchrony Cohort created successfully', newCohort });
    } catch (error) {
        console.error('Error creating Neural Synchrony Cohort:', error);
        res.status(500).json({ error: 'Failed to create Neural Synchrony Cohort' });
    }
});

// POST: Check-in a life to a Neural Synchrony Cohort
router.post('/:neuralSynchronyCohortId/check-in', authenticateToken, async (req, res) => {
    const { lifeId } = req.body;  // lifeId from the request body
    const { neuralSynchronyCohortId } = req.params;  // Cohort ID from URL parameter

    try {
        // Fetch the life details from the LifeAccount model
        const life = await LifeAccount.findByPk(lifeId);
        if (!life) {
            return res.status(404).json({ message: 'Life not found' });
        }

        // Check if the life is already checked into another cohort
        if (life.checkedIn) {
            return res.status(400).json({ message: 'This life is already checked into a cohort' });
        }

        // Fetch the cohort details from the NeuralSynchronyCohort model
        const cohort = await NeuralSynchronyCohort.findByPk(neuralSynchronyCohortId);
        if (!cohort) {
            return res.status(404).json({ message: 'Cohort not found' });
        }

        // Set the relationship between Life and NeuralSynchronyCohort
        life.NeuralSynchronyCohortId = neuralSynchronyCohortId;  // Associate with NeuralSynchronyCohort
        life.checkedIn = true;  // Mark as checked-in
        await life.save();  // Save the updates to the LifeAccount model

        // Send success response
        res.status(200).json({ message: 'Life successfully checked into the cohort', life });
    } catch (err) {
        console.error('Error checking in life to cohort:', err);
        res.status(500).json({ error: 'Failed to check in life to cohort' });
    }
});

// Helper function to calculate Phase-Locking Value (PLV)
function calculatePLV(phaseA, phaseB) {
    const phaseDifference = Math.abs(phaseA - phaseB);
    return Math.min(phaseDifference, 360 - phaseDifference); // Normalize phase difference to [0, 180]
}

router.post('/group-phase-locking-value', async (req, res) => {
    try {
        // Fetch the NeuralSynchronyCohort by cohortId
        const neuralSynchronyCohort = await NeuralSynchronyCohort.findByPk(req.body.neuralSynchronyCohortId);

        if (!neuralSynchronyCohort) {
            return res.status(400).json({ error: 'NeuralSynchronyCohort not found' });
        }

        // Fetch the associated LifeAccounts that are checked in
        const lifeAccounts = await LifeAccount.findAll({
            where: {
                neuralSynchronyCohortId: neuralSynchronyCohort.neuralSynchronyCohortId,
                checkedIn: true  // Only fetch accounts that are checked in
            }
        });

        if (lifeAccounts.length < 2) {
            return res.status(400).json({ error: 'Not enough lives checked in to calculate interference' });
        }

        let pairwisePhaseLockingValues = [];
        let bandwiseTotals = {
            Alpha: { total: 0, count: 0 },
            Beta: { total: 0, count: 0 },
            Theta: { total: 0, count: 0 },
            Gamma: { total: 0, count: 0 },
            Delta: { total: 0, count: 0 }
        };

        let totalGroupPhaseLockingValue = 0;
        let pairwiseCount = 0;

        // Loop through pairs of lifeAccounts in the cohort
        for (let i = 0; i < lifeAccounts.length; i++) {
            for (let j = i + 1; j < lifeAccounts.length; j++) {
                const lifeA = lifeAccounts[i];
                const lifeB = lifeAccounts[j];

                // Fetch the most recent LifeSignal for each life using sequelize.literal
                const lifeASignal = await LifeSignal.findOne({
                    where: sequelize.literal(`lifeId = ${lifeA.lifeId}`),
                    order: [['timestamp', 'DESC']],  // Get the most recent signal
                });

                const lifeBSignal = await LifeSignal.findOne({
                    where: sequelize.literal(`lifeId = ${lifeB.lifeId}`),
                    order: [['timestamp', 'DESC']],  // Get the most recent signal
                });

                if (lifeASignal && lifeBSignal) {
                    // Loop through the brainwave bands to check phase-locking
                    for (const band of ['Alpha', 'Beta', 'Theta', 'Gamma', 'Delta']) {
                        const phaseA = lifeASignal[`phase${band}`];
                        const phaseB = lifeBSignal[`phase${band}`];

                        if (phaseA != null && phaseB != null) {
                            const phaseLockingValue = calculatePLV(phaseA, phaseB);
                            const interferenceType = phaseLockingValue <= 90 ? 'subjectiveConstructiveInterference' : 'subjectiveDestructiveInterference';
                            const normalizedValue = phaseLockingValue <= 90 ? (90 - phaseLockingValue) / 90 : (phaseLockingValue - 90) / 90;

                            // Use sequelize.literal to fetch the LifeBalance record for both lives
                            const balanceA = await LifeBalance.findOne({
                                where: sequelize.literal(`lifeAccountId = ${lifeA.lifeId}`)
                            });

                            const balanceB = await LifeBalance.findOne({
                                where: sequelize.literal(`lifeAccountId = ${lifeB.lifeId}`)
                            });

                            if (balanceA && balanceB) {
                                balanceA[interferenceType] = (balanceA[interferenceType] || 0) + normalizedValue;
                                balanceB[interferenceType] = (balanceB[interferenceType] || 0) + normalizedValue;
                                await balanceA.save();
                                await balanceB.save();
                            }

                            // Log pairwise PLV for reference
                            pairwisePhaseLockingValues.push({
                                band,
                                pair: [lifeA.lifeId, lifeB.lifeId],
                                phaseLockingValue,
                                normalizedValue,
                            });

                            // Update bandwise totals
                            bandwiseTotals[band].total += phaseLockingValue;
                            bandwiseTotals[band].count++;

                            // Aggregate phaseLockingValue for group calculation
                            totalGroupPhaseLockingValue += phaseLockingValue;
                            pairwiseCount++;
                        }
                    }
                }
            }
        }

        // Calculate the group phaseLockingValue by averaging the pairwise results
        const groupPhaseLockingValue = pairwiseCount > 0 ? totalGroupPhaseLockingValue / pairwiseCount : 0;

        // Update the NeuralSynchronyCohort with the calculated group phaseLockingValue
        neuralSynchronyCohort.phaseLockingValue = groupPhaseLockingValue;
        await neuralSynchronyCohort.save();

        // Calculate the average PLV for each band
        let bandwiseAverages = {};
        for (const band of Object.keys(bandwiseTotals)) {
            const { total, count } = bandwiseTotals[band];
            bandwiseAverages[band] = count > 0 ? total / count : 0;
        }

        // Return the results
        res.status(200).json({
            pairwisePhaseLockingValues,
            bandwiseAverages,
            groupPhaseLockingValue  // Include the group-level PLV
        });
    } catch (err) {
        console.error('Error calculating interference:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET endpoint to calculate and return the average bandpower for each brainwave band in the cohort
router.get('/:neuralSynchronyCohortId/group-bandpower', authenticateToken, async (req, res) => {
    const { neuralSynchronyCohortId } = req.params;

    try {
        const lives = await LifeAccount.findAll({
            include: [{
                model: NeuralSynchronyCohort,
                required: true,
                where: { neuralSynchronyCohortId },
            }],
            where: { checkedIn: true },
        });

        if (!lives || lives.length === 0) {
            return res.status(404).json({ message: 'No checked-in lives found for this cohort' });
        }

        const sumBandpowers = {
            delta: 0,
            theta: 0,
            alpha: 0,
            beta: 0,
            gamma: 0,
            frequencyWeighted: 0,
        };

        lives.forEach(life => {
            sumBandpowers.delta += life.bandpowerDelta || 0;
            sumBandpowers.theta += life.bandpowerTheta || 0;
            sumBandpowers.alpha += life.bandpowerAlpha || 0;
            sumBandpowers.beta += life.bandpowerBeta || 0;
            sumBandpowers.gamma += life.bandpowerGamma || 0;
            sumBandpowers.frequencyWeighted += life.frequencyWeightedBandpower || 0;
        });

        const numberOfLives = lives.length;
        const averages = {
            delta: sumBandpowers.delta / numberOfLives,
            theta: sumBandpowers.theta / numberOfLives,
            alpha: sumBandpowers.alpha / numberOfLives,
            beta: sumBandpowers.beta / numberOfLives,
            gamma: sumBandpowers.gamma / numberOfLives,
            frequencyWeighted: sumBandpowers.frequencyWeighted / numberOfLives,
        };

        const neuralSynchronyCohort = await NeuralSynchronyCohort.findByPk(neuralSynchronyCohortId);
        if (!neuralSynchronyCohort) {
            return res.status(404).json({ message: 'Cohort not found' });
        }

        neuralSynchronyCohort.groupBandpowerDelta = averages.delta;
        neuralSynchronyCohort.groupBandpowerTheta = averages.theta;
        neuralSynchronyCohort.groupBandpowerAlpha = averages.alpha;
        neuralSynchronyCohort.groupBandpowerBeta = averages.beta;
        neuralSynchronyCohort.groupBandpowerGamma = averages.gamma;
        neuralSynchronyCohort.groupFrequencyWeightedBandpower = averages.frequencyWeighted;

        await neuralSynchronyCohort.save();
        res.status(200).json(averages);

    } catch (err) {
        console.error('Error fetching group bandpower:', err);
        res.status(500).json({ error: 'Failed to fetch group bandpower' });
    }
});

module.exports = router;