const { DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');

// Define the LifeBrainwave model
const LifeBrainwave = sequelize.define('LifeBrainwave', {
    lifeBrainwaveId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    rawEEGJSON: {
        type: DataTypes.TEXT, // Stores raw EEG as a JSON string
        allowNull: true,
    },
    rawEEGBinary: {
        type: DataTypes.BLOB, // Stores raw EEG as binary data
        allowNull: true,
    },
    bandpowerDelta: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    bandpowerTheta: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    bandpowerAlpha: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    bandpowerBeta: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    bandpowerGamma: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    frequencyWeightedBandpower: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    amplitudeDelta: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    amplitudeTheta: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    amplitudeAlpha: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    amplitudeBeta: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    amplitudeGamma: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    phaseDelta: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    phaseTheta: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    phaseAlpha: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    phaseBeta: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    phaseGamma: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    frequencyWeightedPhase: {
        type: DataTypes.FLOAT,
        allowNull: true,
    },
    thoughtWord: {
        type: DataTypes.STRING, // Stores the decoded word from brainwaves
        allowNull: true // Allow NULL initially until a word is decoded
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: true,
    },
});

module.exports = LifeBrainwave;