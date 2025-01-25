const express = require('express');
const router = express.Router();
const { sequelize } = require('../dataModels/database.js');
const BrainwaveAlignmentCohort = require('../dataModels/brainwaveAlignmentCohort');
const LifeAccount = require('../dataModels/lifeAccount.js');
const LifeBalance = require('../dataModels/lifeBalance.js');
const LifeBrainwave = require('../dataModels/lifeBrainwave.js');
const authenticateToken = require('../middlewares/authenticateToken');
const verifyLifeId = require("../middlewares/verifyLifeId"); // Import middleware

// GET route to retrieve all cohorts for a specific lifeId
router.get('/:lifeId/cohorts', authenticateToken, verifyLifeId, async (req, res) => {
    const { lifeId } = req.params;

    try {
        const life = await LifeAccount.findByPk(lifeId, {
            include: [{
                model: BrainwaveAlignmentCohort,
                as: 'brainwaveAlignmentCohorts',
            }],
        });

        if (!life) {
            return res.status(404).json({ message: 'Life not found' });
        }

        const cohorts = life.get('brainwaveAlignmentCohorts') || life['brainwaveAlignmentCohorts'];
        res.status(200).json(cohorts);
    } catch (err) {
        console.error('Error retrieving cohorts for lifeId:', err);
        res.status(500).json({ error: 'Failed to retrieve cohorts' });
    }
});

// POST: Create a new Neural Synchrony Cohort and associate lives
router.post('/create', authenticateToken, verifyLifeId, async (req, res) => {
    const { topic, phaseLockingValue, lifeIds } = req.body;

    if (!topic || phaseLockingValue == null || !Array.isArray(lifeIds) || lifeIds.length === 0) {
        return res.status(400).json({ error: 'Missing required fields or invalid lifeIds array' });
    }

    try {
        const newCohort = await BrainwaveAlignmentCohort.create({ topic, phaseLockingValue });

        const lives = await LifeAccount.findAll({ where: { lifeId: lifeIds } });

        if (lives.length !== lifeIds.length) {
            return res.status(404).json({ error: 'One or more lifeIds not found' });
        }

        await Promise.all(
            lives.map(life => life.update({ brainwaveAlignmentCohortId: newCohort.brainwaveAlignmentCohortId }))
        );

        res.status(201).json({ message: 'Neural Synchrony Cohort created successfully', newCohort });
    } catch (error) {
        console.error('Error creating Neural Synchrony Cohort:', error);
        res.status(500).json({ error: 'Failed to create Neural Synchrony Cohort' });
    }
});

// POST: Check-in a life to a Neural Synchrony Cohort
router.post('/:brainwaveAlignmentCohortId/check-in', authenticateToken, verifyLifeId, async (req, res) => {
    const { lifeId } = req.body;  // lifeId from the request body
    const { brainwaveAlignmentCohortId } = req.params;  // Cohort ID from URL parameter

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

        // Fetch the cohort details from the BrainwaveAlignmentCohort model
        const cohort = await BrainwaveAlignmentCohort.findByPk(brainwaveAlignmentCohortId);
        if (!cohort) {
            return res.status(404).json({ message: 'Cohort not found' });
        }

        // Set the relationship between Life and BrainwaveAlignmentCohort
        life.BrainwaveAlignmentCohortId = brainwaveAlignmentCohortId;  // Associate with BrainwaveAlignmentCohort
        life.checkedIn = true;  // Mark as checked-in
        await life.save();  // Save the updates to the LifeAccount model

        // Send success response
        res.status(200).json({ message: 'Life successfully checked into the cohort', life });
    } catch (err) {
        console.error('Error checking in life to cohort:', err);
        res.status(500).json({ error: 'Failed to check in life to cohort' });
    }
});

// GET endpoint to retrieve the number of check-ins for a brainwave alignment cohort.
router.get('/:brainwaveAlignmentCohortId/checkins', authenticateToken, verifyLifeId, async (req, res) => {
    const { brainwaveAlignmentCohortId } = req.params;

    try {
        // Find all lives in the specified cohort with checkedIn = true
        const checkins = await LifeAccount.findAll({
            where: {
                brainwaveAlignmentCohortId: brainwaveAlignmentCohortId,
                checkedIn: true,
            },
        });

        // Count the number of check-ins
        const checkinCount = checkins.length;

        res.status(200).json({ checkinCount });
    } catch (error) {
        console.error('Error fetching check-ins:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper function to calculate Phase-Locking Value (PLV)
function calculatePLV(phaseA, phaseB) {
    const phaseDifference = Math.abs(phaseA - phaseB);
    return Math.min(phaseDifference, 360 - phaseDifference); // Normalize phase difference to [0, 180]
}

router.post('/group-phase-locking-value', authenticateToken, verifyLifeId, async (req, res) => {
    try {
        const { brainwaveAlignmentCohortId, lifeId } = req.body;

        // Fetch the BrainwaveAlignmentCohort by cohortId
        const brainwaveAlignmentCohort = await BrainwaveAlignmentCohort.findByPk(brainwaveAlignmentCohortId);

        if (!brainwaveAlignmentCohort) {
            return res.status(400).json({ error: 'BrainwaveAlignmentCohort not found' });
        }

        // Fetch the associated LifeAccounts that are checked in
        const lifeAccounts = await LifeAccount.findAll({
            where: {
                brainwaveAlignmentCohortId: brainwaveAlignmentCohort.brainwaveAlignmentCohortId,
                checkedIn: true
            }
        });

        if (lifeAccounts.length < 2) {
            return res.status(400).json({ error: 'Not enough lives checked in to calculate interference' });
        }

        let pairwisePhaseLockingValues = [];
        let totalGroupPhaseLockingValue = 0;
        let pairwiseCount = 0;

        // Loop through pairs of lifeAccounts in the cohort
        for (let i = 0; i < lifeAccounts.length; i++) {
            for (let j = i + 1; j < lifeAccounts.length; j++) {
                const lifeA = lifeAccounts[i];
                const lifeB = lifeAccounts[j];

                // Skip pairs that do not include the requesting user's lifeId
                if (lifeA.lifeId !== lifeId && lifeB.lifeId !== lifeId) {
                    continue;
                }

                // Fetch the most recent LifeBrainwave for each life using sequelize.literal
                const lifeABrainwave = await LifeBrainwave.findOne({
                    where: sequelize.literal(`lifeId = ${lifeA.lifeId}`),
                    order: [['timestamp', 'DESC']],
                });

                const lifeBBrainwave = await LifeBrainwave.findOne({
                    where: sequelize.literal(`lifeId = ${lifeB.lifeId}`),
                    order: [['timestamp', 'DESC']],
                });

                if (lifeABrainwave && lifeBBrainwave) {
                    const phaseA = lifeABrainwave.frequencyWeightedPhase;
                    const phaseB = lifeBBrainwave.frequencyWeightedPhase;

                    if (phaseA != null && phaseB != null) {
                        const phaseLockingValue = calculatePLV(phaseA, phaseB);
                        const isConstructive = phaseLockingValue <= 90;
                        const interferenceType = isConstructive ? 'subjectiveConstructiveInterference' : 'subjectiveDestructiveInterference';
                        const adjustedPhaseLockingValue = isConstructive ? phaseLockingValue : 180 - phaseLockingValue;

                        // Update only the LifeBalance of the requesting user
                        const balanceToUpdate = lifeA.lifeId === lifeId ? lifeA : lifeB;
                        const balance = await LifeBalance.findOne({
                            where: sequelize.literal(`lifeAccountId = ${balanceToUpdate.lifeId}`)
                        });

                        if (balance) {
                            balance[interferenceType] = (balance[interferenceType] || 0) + adjustedPhaseLockingValue;
                            await balance.save();
                        }

                        // Log pairwise PLV for reference
                        pairwisePhaseLockingValues.push({
                            pair: [lifeA.lifeId, lifeB.lifeId],
                            phaseLockingValue,
                            adjustedPhaseLockingValue,
                        });

                        // Aggregate phaseLockingValue for group calculation
                        totalGroupPhaseLockingValue += phaseLockingValue;
                        pairwiseCount++;
                    }
                }
            }
        }

        // Calculate the group phaseLockingValue by averaging the pairwise results
        const groupPhaseLockingValue = pairwiseCount > 0 ? totalGroupPhaseLockingValue / pairwiseCount : 0;

        // Update the BrainwaveAlignmentCohort with the calculated group phaseLockingValue
        brainwaveAlignmentCohort.phaseLockingValue = groupPhaseLockingValue;
        await brainwaveAlignmentCohort.save();

        // Return the results
        res.status(200).json({
            pairwisePhaseLockingValues,
            groupPhaseLockingValue
        });
    } catch (err) {
        console.error('Error calculating interference:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:brainwaveAlignmentCohortId/group-bandpower', authenticateToken, verifyLifeId, async (req, res) => {
    const { brainwaveAlignmentCohortId } = req.params;

    try {
        // Fetch checked-in lives associated with the specified brainwave alignment cohort
        const lives = await LifeAccount.findAll({
            include: [{
                model: BrainwaveAlignmentCohort,
                required: true,
                where: { brainwaveAlignmentCohortId },
            }],
            where: { checkedIn: true },
        });

        // Check if there are at least 2 checked-in lives
        if (!lives || lives.length < 2) {
            return res.status(400).json({ message: 'At least 2 checked-in lives are required to calculate group bandpower.' });
        }

        // Sum of frequencyWeightedBandpower values
        let sumFrequencyWeightedBandpower = 0;

        // Iterate over lives and accumulate frequencyWeightedBandpower
        lives.forEach(life => {
            sumFrequencyWeightedBandpower += life.frequencyWeightedBandpower || 0;
        });

        // Calculate the average frequencyWeightedBandpower
        const numberOfLives = lives.length;
        const averageFrequencyWeightedBandpower = sumFrequencyWeightedBandpower / numberOfLives;

        // Fetch the brainwave alignment cohort to update the values
        const brainwaveAlignmentCohort = await BrainwaveAlignmentCohort.findByPk(brainwaveAlignmentCohortId);
        if (!brainwaveAlignmentCohort) {
            return res.status(404).json({ message: 'Cohort not found' });
        }

        // Update the cohort with the calculated average frequencyWeightedBandpower
        brainwaveAlignmentCohort.groupFrequencyWeightedBandpower = averageFrequencyWeightedBandpower;

        // Save the updated cohort
        await brainwaveAlignmentCohort.save();

        // Return the calculated average frequencyWeightedBandpower
        res.status(200).json({ averageFrequencyWeightedBandpower });

    } catch (err) {
        console.error('Error fetching group bandpower:', err);
        res.status(500).json({ error: 'Failed to fetch group bandpower' });
    }
});

module.exports = router;