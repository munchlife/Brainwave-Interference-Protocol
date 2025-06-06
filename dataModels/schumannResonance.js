const { DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');

const SchumannResonance = sequelize.define('SchumannPhaseData', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    phase: {
        type: DataTypes.FLOAT,
        allowNull: false, // The Schumann resonance phase data for the current reading
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false, // The timestamp when the phase data was recorded
    },
    location: {
        type: DataTypes.STRING,
        allowNull: true, // Optional field for location information
    },
}, {
    indexes: [
        { fields: ['timestamp'] }, // Index for efficient querying by timestamp
    ],
});

module.exports = SchumannResonance;