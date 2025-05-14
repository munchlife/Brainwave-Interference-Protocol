const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
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
        const cohorts = await BrainwaveAlignmentCohort.findAll({
            where: { lifeId },
        });

        res.status(200).json(cohorts);
    } catch (err) {
        console.error('Error retrieving cohorts for lifeId:', err);
        res.status(500).json({ error: 'Failed to retrieve cohorts' });
    }
});

// GET route to retrieve a specific cohort by cohortId with specific fields and associated lifeId emails
router.get('/:lifeId/cohorts/:cohortId', authenticateToken, verifyLifeId, async (req, res) => {
    const { lifeId, cohortId } = req.params;

    try {
        const cohort = await BrainwaveAlignmentCohort.findOne({
            where: {
                brainwaveAlignmentCohortId: cohortId,
                lifeId: lifeId,
            },
            attributes: [
                'topic',
                'cohortConstructiveInterference',
                'cohortDestructiveInterference',
                'netCohortInterferenceBalance',
            ],
            include: [{
                model: LifeAccount,
                // Use the correct alias for the association if you have one
                as: 'life', // or 'lives' if it's a hasMany
                attributes: ['email']
            }]
        });

        if (!cohort) {
            return res.status(404).json({ message: 'Cohort not found' });
        }

        // If 'life' is an array (hasMany), use map. If belongsTo (single), wrap in array.
        const emails = Array.isArray(cohort.life)
            ? cohort.life.map(l => l.email)
            : cohort.life ? [cohort.life.email] : [];

        res.status(200).json({
            topic: cohort.topic,
            cohortConstructiveInterference: cohort.cohortConstructiveInterference,
            cohortDestructiveInterference: cohort.cohortDestructiveInterference,
            netCohortInterference: cohort.netCohortInterferenceBalance,
            emails
        });
    } catch (err) {
        console.error('Error retrieving cohort:', err);
        res.status(500).json({ error: 'Failed to retrieve cohort' });
    }
});

// POST: Create a new Neural Synchrony Cohort with an administrator
router.post('/create', authenticateToken, verifyLifeId, async (req, res) => {
    const { topic, lifeIds } = req.body;

    // Validate input
    if (!topic || !Array.isArray(lifeIds) || lifeIds.length === 0) {
        return res.status(400).json({ error: 'Missing required fields or invalid lifeIds array' });
    }

    try {
        // Fetch all LifeAccounts to ensure all provided lifeIds exist
        const lives = await LifeAccount.findAll({ where: { lifeId: lifeIds } });

        if (lives.length !== lifeIds.length) {
            return res.status(404).json({ error: 'One or more lifeIds not found' });
        }

        // Create a new cohort
        const newCohort = await BrainwaveAlignmentCohort.create({
            topic,
            phaseLockingValue: null, // PLV will be updated later
            cohortAdminLifeId: lifeIds[0], // Assign the first life as the admin
        });

        // Associate lives with the cohort
        await Promise.all(
            lives.map(life => life.update({ brainwaveAlignmentCohortId: newCohort.brainwaveAlignmentCohortId }))
        );

        res.status(201).json({
            message: 'Neural Synchrony Cohort created successfully',
            cohort: newCohort,
            cohortAdmin: lifeIds[0], // Return the assigned administrator
        });

    } catch (error) {
        console.error('Error creating Neural Synchrony Cohort:', error);
        res.status(500).json({ error: 'Failed to create Neural Synchrony Cohort' });
    }
});

// POST: Add a Life to an existing Brainwave Alignment Cohort using email
router.post('/add-life', authenticateToken, verifyLifeId, async (req, res) => {
    const { brainwaveAlignmentCohortId, email } = req.body;

    if (!brainwaveAlignmentCohortId || !email) {
        return res.status(400).json({ error: 'Missing cohort ID or email' });
    }

    try {
        // Find the cohort using findOne
        const cohort = await BrainwaveAlignmentCohort.findOne({
            where: { brainwaveAlignmentCohortId }
        });

        if (!cohort) {
            return res.status(404).json({ error: 'Cohort not found' });
        }

        // Ensure the request is coming from the cohort admin
        if (cohort.cohortAdminLifeId !== req.lifeId) {
            return res.status(403).json({ error: 'Only the cohort admin can add members' });
        }

        // Find the life account using email (no raw SQL)
        const life = await LifeAccount.findOne({
            where: { email }
        });

        if (!life) {
            return res.status(404).json({ error: 'Life not found' });
        }

        // Add life to cohort
        await life.update({ brainwaveAlignmentCohortId });

        res.status(200).json({ message: 'Life added to cohort successfully', life });

    } catch (error) {
        console.error('Error adding life to cohort:', error);
        res.status(500).json({ error: 'Failed to add life to cohort' });
    }
});

router.get('/search-cohorts', authenticateToken, verifyLifeId, async (req, res) => {
    const { topic } = req.query;  // Topic is expected as a query parameter

    try {
        // Check if topic is provided
        if (!topic) {
            return res.status(400).json({ message: 'Topic query parameter is required' });
        }

        // Fetch brainwave alignment cohorts matching the topic
        const cohorts = await BrainwaveAlignmentCohort.findAll({
            where: {
                topic: {
                    [Op.iLike]: `%${topic}%`,  // Use ILIKE for case-insensitive matching
                }
            }
        });

        // If no cohorts are found
        if (!cohorts || cohorts.length === 0) {
            return res.status(404).json({ message: 'No cohorts found for the specified topic' });
        }

        // Return the matched cohorts
        res.status(200).json({ cohorts });
    } catch (err) {
        console.error('Error searching cohorts:', err);
        res.status(500).json({ error: 'Failed to search cohorts' });
    }
});

// POST: Check-in a life to a Brainwave Alignment Cohort
router.post('/:brainwaveAlignmentCohortId/check-in', authenticateToken, verifyLifeId, async (req, res) => {
    const { lifeId } = req.body;  // lifeId from the request body
    const { brainwaveAlignmentCohortId } = req.params;  // Cohort ID from URL parameter

    try {
        // Fetch the life details using findOne instead of findByPk
        const life = await LifeAccount.findOne({
            where: { lifeId }
        });

        if (!life) {
            return res.status(404).json({ message: 'Life not found' });
        }

        // Check if the life is already checked into another cohort
        if (life.checkedIn) {
            return res.status(400).json({ message: 'This life is already checked into a cohort' });
        }

        // Fetch the cohort details using findOne instead of findByPk
        const cohort = await BrainwaveAlignmentCohort.findOne({
            where: { brainwaveAlignmentCohortId }
        });

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
        const brainwaveAlignmentCohort = await BrainwaveAlignmentCohort.findOne({
            where: { brainwaveAlignmentCohortId }
        });
        if (!brainwaveAlignmentCohort) {
            return res.status(400).json({ error: 'BrainwaveAlignmentCohort not found' });
        }

        // Fetch all checked-in LifeAccounts for the cohort
        const lifeAccounts = await LifeAccount.findAll({
            where: {
                brainwaveAlignmentCohortId,
                checkedIn: true
            }
        });

        if (lifeAccounts.length < 2) {
            return res.status(400).json({ error: 'Not enough lives checked in to calculate interference' });
        }

        // Fetch the requesting user's LifeAccount
        const requestingLifeAccount = await LifeAccount.findOne({
            where: { lifeId }
        });
        const isAdmin = requestingLifeAccount?.isAdmin || false;

        // Fetch all LifeBalances in one query
        const lifeBalances = await LifeBalance.findAll({
            where: {
                lifeAccountId: lifeAccounts.map(life => life.lifeId)
            }
        });

        // Create a Map for quick access
        const balanceMap = new Map(lifeBalances.map(balance => [balance.lifeAccountId, balance]));

        let pairwisePhaseLockingValues = [];
        let totalGroupPhaseLockingValue = 0;
        let pairwiseCount = 0;
        let bulkUpdates = [];

        // Initialize the cohort balance variables
        let constructiveCohortInterference = brainwaveAlignmentCohort.constructiveCohortInterference || 0;
        let destructiveCohortInterference = brainwaveAlignmentCohort.destructiveCohortInterference || 0;

        // Loop through all pairs in the cohort
        for (let i = 0; i < lifeAccounts.length; i++) {
            for (let j = i + 1; j < lifeAccounts.length; j++) {
                const lifeA = lifeAccounts[i];
                const lifeB = lifeAccounts[j];

                // If not admin, only process pairs that involve the requesting lifeId
                if (!isAdmin && lifeA.lifeId !== lifeId && lifeB.lifeId !== lifeId) {
                    continue;
                }

                // Fetch most recent LifeBrainwave for both lifeA and lifeB
                const [lifeABrainwave, lifeBBrainwave] = await Promise.all([
                    LifeBrainwave.findOne({
                        where: { lifeId: lifeA.lifeId },
                        order: [['timestamp', 'DESC']]
                    }),
                    LifeBrainwave.findOne({
                        where: { lifeId: lifeB.lifeId },
                        order: [['timestamp', 'DESC']]
                    })
                ]);

                if (lifeABrainwave && lifeBBrainwave) {
                    const phaseA = lifeABrainwave.frequencyWeightedPhase;
                    const phaseB = lifeBBrainwave.frequencyWeightedPhase;

                    if (phaseA != null && phaseB != null) {
                        const phaseLockingValue = calculatePLV(phaseA, phaseB);
                        const isConstructive = phaseLockingValue <= 90;
                        const interferenceType = isConstructive ? 'subjectiveConstructiveInterference' : 'subjectiveDestructiveInterference';
                        const adjustedPhaseLockingValue = isConstructive ? phaseLockingValue : 180 - phaseLockingValue;

                        // Update balance for all participants if admin
                        if (isAdmin) {
                            // Update balance for both lifeA and lifeB
                            [lifeA.lifeId, lifeB.lifeId].forEach(lifeIdToUpdate => {
                                const balanceToUpdate = balanceMap.get(lifeIdToUpdate);
                                if (balanceToUpdate) {
                                    balanceToUpdate[interferenceType] = (balanceToUpdate[interferenceType] || 0) + adjustedPhaseLockingValue;
                                    bulkUpdates.push({
                                        lifeAccountId: balanceToUpdate.lifeAccountId,
                                        subjectiveConstructiveInterference: balanceToUpdate.subjectiveConstructiveInterference,
                                        subjectiveDestructiveInterference: balanceToUpdate.subjectiveDestructiveInterference
                                    });

                                    // Update cohort balance for both constructive and destructive interference
                                    if (isConstructive) {
                                        constructiveCohortInterference += adjustedPhaseLockingValue;
                                    } else {
                                        destructiveCohortInterference += adjustedPhaseLockingValue;
                                    }
                                }
                            });
                        } else {
                            // Non-admin users only update their own balance
                            const balanceToUpdate = balanceMap.get(lifeA.lifeId === lifeId ? lifeA.lifeId : lifeB.lifeId);
                            if (balanceToUpdate) {
                                balanceToUpdate[interferenceType] = (balanceToUpdate[interferenceType] || 0) + adjustedPhaseLockingValue;
                                bulkUpdates.push({
                                    lifeAccountId: balanceToUpdate.lifeAccountId,
                                    subjectiveConstructiveInterference: balanceToUpdate.subjectiveConstructiveInterference,
                                    subjectiveDestructiveInterference: balanceToUpdate.subjectiveDestructiveInterference
                                });
                            }

                            // Update cohort balance for either constructive or destructive interference
                            if (isConstructive) {
                                constructiveCohortInterference += adjustedPhaseLockingValue;
                            } else {
                                destructiveCohortInterference += adjustedPhaseLockingValue;
                            }
                        }

                        // Log pairwise PLV
                        pairwisePhaseLockingValues.push({
                            pair: [lifeA.lifeId, lifeB.lifeId],
                            phaseLockingValue,
                            adjustedPhaseLockingValue,
                        });

                        // Aggregate for group calculation
                        totalGroupPhaseLockingValue += phaseLockingValue;
                        pairwiseCount++;
                    }
                }
            }
        }

        // Bulk update all modified balances
        if (bulkUpdates.length > 0) {
            await LifeBalance.bulkCreate(bulkUpdates, {
                updateOnDuplicate: ['subjectiveConstructiveInterference', 'subjectiveDestructiveInterference']
            });
        }

        // Compute and save the group phaseLockingValue
        const groupPhaseLockingValue = pairwiseCount > 0 ? totalGroupPhaseLockingValue / pairwiseCount : 0;
        brainwaveAlignmentCohort.phaseLockingValue = groupPhaseLockingValue;
        await brainwaveAlignmentCohort.save();

        // Update cohort balance after all individual balances have been updated
        const netCohortInterference = constructiveCohortInterference - destructiveCohortInterference;

        // Save constructive and destructive balances to the cohort model
        brainwaveAlignmentCohort.constructiveCohortInterference = constructiveCohortInterference;
        brainwaveAlignmentCohort.destructiveCohortInterference = destructiveCohortInterference;
        brainwaveAlignmentCohort.netCohortInterference = netCohortInterference;
        await brainwaveAlignmentCohort.save();

        // Return response
        res.status(200).json({
            pairwisePhaseLockingValues,
            groupPhaseLockingValue,
            constructiveCohortInterference,
            destructiveCohortInterference,
            netCohortInterference
        });

    } catch (err) {
        console.error('Error calculating interference:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:brainwaveAlignmentCohortId/group-bandpower', authenticateToken, verifyLifeId, async (req, res) => {
    const { brainwaveAlignmentCohortId } = req.params;
    const { lifeId } = req.body;  // Assuming lifeId is in the request body for validation

    try {
        // Fetch the requesting LifeAccount to check if the user is an admin
        const requestingLifeAccount = await LifeAccount.findOne({
            where: { lifeId }  // Directly use lifeId in the where clause without sequelize.literal
        });
        const isAdmin = requestingLifeAccount?.isAdmin || false;

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

        // If admin, update the cohort with the calculated average frequencyWeightedBandpower
        if (isAdmin) {
            brainwaveAlignmentCohort.groupFrequencyWeightedBandpower = averageFrequencyWeightedBandpower;
            await brainwaveAlignmentCohort.save();
            return res.status(200).json({
                message: 'Group bandpower updated successfully',
                averageFrequencyWeightedBandpower,
            });
        }

        // For non-admins, only return the group bandpower without updating it
        res.status(200).json({
            averageFrequencyWeightedBandpower,
        });

    } catch (err) {
        console.error('Error fetching group bandpower:', err);
        res.status(500).json({ error: 'Failed to fetch group bandpower' });
    }
});

module.exports = router;