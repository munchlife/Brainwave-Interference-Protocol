const express = require('express');
const router = express.Router();
const NeuralSynchronyCohort = require('../dataModels/neuralSynchronyCohort');
const Life = require('../dataModels/life');
const authenticateToken = require('../middlewares/authenticateToken'); // Import middleware

// GET route to retrieve all cohorts for a specific lifeId
router.get('/:lifeId/cohorts', authenticateToken, async (req, res) => {
    const { lifeId } = req.params;

    try {
        const life = await Life.findByPk(lifeId, {
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

        const lives = await Life.findAll({ where: { lifeId: lifeIds } });

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
    const { lifeId } = req.body;
    const { neuralSynchronyCohortId } = req.params;

    try {
        // Check if the life is already checked into the cohort
        const existingLife = await Life.findOne({
            include: [{
                model: NeuralSynchronyCohort,
                required: true,
                where: { id: neuralSynchronyCohortId },
            }],
        });

        if (existingLife) {
            return res.status(400).json({ message: 'This life is already checked into the specified cohort' });
        }

        // Fetch the life details from the Life model
        const life = await Life.findByPk(lifeId);
        if (!life) {
            return res.status(404).json({ message: 'Life not found' });
        }

        // Fetch the cohort details from the NeuralSynchronyCohort model
        const cohort = await NeuralSynchronyCohort.findByPk(neuralSynchronyCohortId);
        if (!cohort) {
            return res.status(404).json({ message: 'Cohort not found' });
        }

        // Set the relationship between Life and NeuralSynchronyCohort
        life.NeuralSynchronyCohortId = neuralSynchronyCohortId;  // Associate with NeuralSynchronyCohort
        life.checkedIn = true;  // Mark as checked-in
        await life.save();  // Save the updates to the Life model

        // Send success response
        res.status(200).json({ message: 'Life successfully checked into the cohort', life });
    } catch (err) {
        console.error('Error checking in life to cohort:', err);
        res.status(500).json({ error: 'Failed to check in life to cohort' });
    }
});

// Phase alignment helper function for deriving pairwise 0-180 degree values
function calculatePLV(phaseA, phaseB) {
    const phaseDifference = Math.abs(phaseA - phaseB);

    // Ensure phaseDifference is within the 0-180 degree range
    const adjustedDifference = Math.min(phaseDifference, 360 - phaseDifference);

    // Return the normalized phase-locking value
    return 180 - adjustedDifference;
}

// GET: Calculate and return pairwise or group PLVs for the Neural Synchrony Cohort
router.get('/:neuralSynchronyCohortId/phase-locking-value', authenticateToken, async (req, res) => {
    const { neuralSynchronyCohortId } = req.params;
    const { calculationType } = req.query;

    if (!['pairwise', 'group'].includes(calculationType)) {
        return res.status(400).json({ error: "Invalid calculationType. It should be either 'pairwise' or 'group'." });
    }

    try {
        // Fetch all lives in the cohort
        const lives = await Life.findAll({
            include: [{
                model: NeuralSynchronyCohort,
                required: true,
                where: { id: neuralSynchronyCohortId },
            }],
            where: { checkedIn: true },
        });

        if (!lives || lives.length < 2) {
            return res.status(404).json({ message: 'Not enough checked-in lives found for this cohort.' });
        }

        // Define brainwave bands
        const brainwaveBands = ['Alpha', 'Beta', 'Theta', 'Delta', 'Gamma'];

        // Initialize group PLVs for each band
        const groupPLVs = brainwaveBands.reduce((acc, band) => {
            acc[`group${band}PhaseLockingValue`] = 0;
            return acc;
        }, {});

        const pairwisePhaseLockingValues = [];
        let bandwiseTotals = brainwaveBands.reduce((acc, band) => {
            acc[band] = { total: 0, count: 0 };
            return acc;
        }, {});

        // Pairwise calculations for each band
        for (let i = 0; i < lives.length; i++) {
            for (let j = i + 1; j < lives.length; j++) {
                const lifeA = lives[i];
                const lifeB = lives[j];

                brainwaveBands.forEach(band => {
                    const phaseA = lifeA[`phase${band}`];
                    const phaseB = lifeB[`phase${band}`];

                    if (phaseA != null && phaseB != null) {
                        const phaseLockingValue = calculatePLV(phaseA, phaseB);

                        // Categorize the interference
                        const interferenceType =
                            phaseLockingValue <= 90 ? 'subjectiveConstructiveInterference' : 'subjectiveDestructiveInterference';

                        const normalizedValue = phaseLockingValue <= 90
                            ? (90 - phaseLockingValue) / 90 // Constructive
                            : (phaseLockingValue - 90) / 90; // Destructive

                        // Log interference for both lives in the pair
                        lifeA[interferenceType] = (lifeA[interferenceType] || 0) + normalizedValue;
                        lifeB[interferenceType] = (lifeB[interferenceType] || 0) + normalizedValue;

                        // Push pairwise calculation
                        pairwisePhaseLockingValues.push({
                            band,
                            pair: [lifeA.lifeId, lifeB.lifeId],
                            phaseLockingValue,
                            normalizedValue,
                        });

                        // Update totals for group PLV calculation
                        bandwiseTotals[band].total += phaseLockingValue;
                        bandwiseTotals[band].count++;
                    }
                });
            }
        }

        // Calculate group PLVs
        brainwaveBands.forEach(band => {
            const total = bandwiseTotals[band].total;
            const count = bandwiseTotals[band].count;

            if (count > 0) {
                groupPLVs[`group${band}PhaseLockingValue`] = total / count;
            }
        });

        // Save updated group PLVs to the NeuralSynchronyCohort
        const cohort = await NeuralSynchronyCohort.findByPk(neuralSynchronyCohortId);
        if (!cohort) {
            return res.status(404).json({ error: 'Neural Synchrony Cohort not found' });
        }

        // Update the cohort with group PLVs for each band
        brainwaveBands.forEach(band => {
            cohort[`group${band}PhaseLockingValue`] = groupPLVs[`group${band}PhaseLockingValue`];
        });
        await cohort.save();

        // Save the interference results back to the database for each life
        for (const life of lives) {
            await life.save();
        }

        // Respond with the calculated PLVs
        if (calculationType === 'pairwise') {
            res.status(200).json({ phaseLockingValues: pairwisePhaseLockingValues });
        } else if (calculationType === 'group') {
            res.status(200).json({ groupPLVs, phaseLockingValues: pairwisePhaseLockingValues });
        }
    } catch (err) {
        console.error('Error calculating PLV:', err);
        res.status(500).json({ error: 'Failed to calculate phase-locking value' });
    }
});

// GET endpoint to calculate and return the average bandpower for each brainwave band in the cohort
router.get('/:neuralSynchronyCohortId/group-bandpower', authenticateToken, async (req, res) => {
    const { neuralSynchronyCohortId } = req.params;

    try {
        const lives = await Life.findAll({
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