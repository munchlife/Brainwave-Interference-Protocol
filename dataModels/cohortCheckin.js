// cohortCheckin.js
const { DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');

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

module.exports = CohortCheckin;