// lifeBrainwave.js
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');
const LifeAccount = require('./lifeAccount.js'); // Import LifeAccount model

// Define the LifeBrainwave model
const LifeBrainwave = sequelize.define('LifeBrainwave', {
    lifeBrainwaveId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    bandpowerDelta: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
    },
    bandpowerTheta: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
    },
    bandpowerAlpha: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
    },
    bandpowerBeta: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
    },
    bandpowerGamma: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
    },
    frequencyWeightedBandpower: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
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
    timestamp: {
        type: DataTypes.DATE,
        allowNull: true,
    }
});

// Define relationships
LifeBrainwave.belongsTo(LifeAccount, { foreignKey: 'lifeId' });

// Sync the LifeBrainwave table
LifeBrainwave.sync({ alter: true })
    .then(() => console.log('LifeBrainwave table synced'))
    .catch(err => console.error('Error syncing LifeBrainwave table:', err));

module.exports = LifeBrainwave;