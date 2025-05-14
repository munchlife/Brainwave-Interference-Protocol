const { DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');

// Define the LifeBalance model
const LifeBalance = sequelize.define('LifeBalance', {
    lifeBalanceId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    influencerLifeId: {
        type: DataTypes.INTEGER,
        allowNull: true, // This can be null if there is no influencer
    },
    subjectiveConstructiveInterference: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
    },
    subjectiveDestructiveInterference: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
    },
    objectiveConstructiveInterference: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
    },
    objectiveDestructiveInterference: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
    },
    totalObjectiveConstructiveInterference: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    totalObjectiveDestructiveInterference: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    totalSubjectiveConstructiveInterference: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    totalSubjectiveDestructiveInterference: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    netObjectiveInterferenceBalance: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    netSubjectiveInterferenceBalance: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: true,
    }
});

module.exports = LifeBalance;