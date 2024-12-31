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

// GET: Calculate and return pairwise or group PLVs for the Neural Synchrony Cohort
router.get('/:neuralSynchronyCohortId/phase-locking-value', authenticateToken, async (req, res) => {
    const { neuralSynchronyCohortId } = req.params;
    const { calculationType } = req.query;

    if (!['pairwise', 'group'].includes(calculationType)) {
        return res.status(400).json({ error: "Invalid calculationType. It should be either 'pairwise' or 'group'." });
    }

    try {
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

        const pairwisePLVs = [];
        let totalPLV = 0;

        for (let i = 0; i < lives.length; i++) {
            for (let j = i + 1; j < lives.length; j++) {
                const lifeA = lives[i];
                const lifeB = lives[j];

                const phaseA = lifeA.phase;
                const phaseB = lifeB.phase;

                if (phaseA == null || phaseB == null) {
                    continue;
                }

                const plv = calculatePLV(phaseA, phaseB);
                pairwisePLVs.push({ pair: [lifeA.lifeId, lifeB.lifeId], plv });
                totalPLV += plv;
            }
        }

        const groupPLV = pairwisePLVs.length > 0 ? totalPLV / pairwisePLVs.length : 0;

        if (calculationType === 'pairwise') {
            res.status(200).json({ pairwisePLVs });
        } else if (calculationType === 'group') {
            res.status(200).json({ groupPLV, pairwisePLVs });
        }

    } catch (err) {
        console.error('Error calculating PLV:', err);
        res.status(500).json({ error: 'Failed to calculate PLV' });
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
                where: { id: neuralSynchronyCohortId },
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

        const numberOfLives = lives.length;
        lives.forEach(life => {
            sumBandpowers.delta += life.bandpowerDelta || 0;
            sumBandpowers.theta += life.bandpowerTheta || 0;
            sumBandpowers.alpha += life.bandpowerAlpha || 0;
            sumBandpowers.beta += life.bandpowerBeta || 0;
            sumBandpowers.gamma += life.bandpowerGamma || 0;
            sumBandpowers.frequencyWeighted += life.frequencyWeightedBandpower || 0;
        });

        const averages = {
            delta: sumBandpowers.delta / numberOfLives,
            theta: sumBandpowers.theta / numberOfLives,
            alpha: sumBandpowers.alpha / numberOfLives,
            beta: sumBandpowers.beta / numberOfLives,
            gamma: sumBandpowers.gamma / numberOfLives,
            frequencyWeighted: sumBandpowers.frequencyWeighted / numberOfLives,
        };

        res.status(200).json(averages);
    } catch (err) {
        console.error('Error fetching group bandpower:', err);
        res.status(500).json({ error: 'Failed to fetch group bandpower' });
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
        const existingLife = await Life.findOne({
            include: [{
                model: NeuralSynchronyCohort,
                required: true,
                where: { id: neuralSynchronyCohortId },
            }],
        });

        if (existingLife) {
            return res.status(400).json({ message: 'This cohort already has a life checked in' });
        }

        const life = await Life.findByPk(lifeId);
        if (!life) {
            return res.status(404).json({ message: 'Life not found' });
        }

        const cohort = await NeuralSynchronyCohort.findByPk(neuralSynchronyCohortId);
        if (!cohort) {
            return res.status(404).json({ message: 'Cohort not found' });
        }

        life.set('NeuralSynchronyCohortId', neuralSynchronyCohortId);
        life.checkedIn = true;
        await life.save();

        res.status(200).json({ message: 'Life successfully checked into the cohort', life });
    } catch (err) {
        console.error('Error checking in life to cohort:', err);
        res.status(500).json({ error: 'Failed to check in life to cohort' });
    }
});

// Helper function to calculate PLV for a pair of lives
const calculatePLV = (phaseA, phaseB) => {
    const phaseDifference = Math.abs(phaseA - phaseB);
    return Math.abs(Math.cos(phaseDifference));
};

module.exports = router;