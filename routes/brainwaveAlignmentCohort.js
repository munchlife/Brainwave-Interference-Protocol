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

module.exports = router;