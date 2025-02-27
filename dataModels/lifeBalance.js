// lifeBalance.js
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');
const LifeAccount = require('./lifeAccount.js'); // Import LifeAccount model

// Define the LifeBalance model
const LifeBalance = sequelize.define('LifeBalance', {
    lifeBalanceId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
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

// Define relationships
LifeBalance.belongsTo(LifeAccount, { foreignKey: 'lifeId' });

// Sync the LifeBalance table
LifeBalance.sync({ alter: true })
    .then(() => console.log('LifeBalance table synced'))
    .catch(err => console.error('Error syncing LifeBalance table:', err));

module.exports = LifeBalance;