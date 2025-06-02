// dataModels/cohortMember.js
const { DataTypes } = require('sequelize');
const sequelize = require('./database.js');

const CohortMember = sequelize.define('CohortMember', {
    cohortMemberId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    checkedIn: { // This is for individual check-in status within a cohort
        type: DataTypes.BOOLEAN,
        allowNull: false, // Make it false by default if a member is not checked in
        defaultValue: false,
    },
    isAdmin: { // This is for admin status *within this specific cohort*
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    timestamps: false // Adjust if you need createdAt/updatedAt for membership
});

module.exports = CohortMember;