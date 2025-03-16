const express = require("express");
const { Op } = require("sequelize");
const LifeBrainwave = require("../dataModels/lifeBrainwave.js"); // Import the model
const router = express.Router();

router.get("/daily-mean-bandpower", async (req, res) => {
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0); // Start of the day
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today

        // Query yesterday's frequencyWeightedBandpower values
        const bandpowers = await LifeBrainwave.findAll({
            attributes: ["frequencyWeightedBandpower"],
            where: {
                timestamp: {
                    [Op.gte]: yesterday, // Greater than or equal to yesterday's start
                    [Op.lt]: today, // Less than today's start (ensures only yesterday)
                },
                frequencyWeightedBandpower: { [Op.not]: null }, // Exclude null values
            },
        });

        // Calculate the mean
        if (bandpowers.length === 0) {
            return res.status(404).json({ error: "No bandpower data available for yesterday." });
        }

        const meanBandpower =
            bandpowers.reduce((sum, entry) => sum + entry.frequencyWeightedBandpower, 0) /
            bandpowers.length;

        res.json({ yesterdays_mean_bandpower: meanBandpower });

    } catch (error) {
        console.error("Error fetching daily mean bandpower:", error);
        res.status(500).json({ error: "Internal server error." });
    }
});

module.exports = router;