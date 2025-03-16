// cohortCheckin.js
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');
const LifeAccount = require('./lifeAccount.js'); // Import LifeAccount model

// Define the CohortCheckin model
const CohortCheckin = sequelize.define('CohortCheckin', {
    checkinId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    checkedIn: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: true,
    }
});

// Define relationships
CohortCheckin.belongsTo(LifeAccount, { foreignKey: 'lifeId' });

// Sync the CohortCheckin table
CohortCheckin.sync({ alter: true })
    .then(() => console.log('CohortCheckin table synced'))
    .catch(err => console.error('Error syncing CohortCheckin table:', err));

module.exports = CohortCheckin;