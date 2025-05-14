// lifeAccount.js
const { DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');

// Define the LifeAccount model
const LifeAccount = sequelize.define('LifeAccount', {
    lifeId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    firstName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    lastName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    passcode: {
        type: DataTypes.STRING, // Store as plain text or hashed, your choice
        allowNull: true,
    },
    passcodeExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    registered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    checkedIn: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
    },
    isAdmin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false // Ensures non-admins are false by default
    },
    influencerEmail: {
        type: DataTypes.STRING, // Add influencerEmail field
        allowNull: true, // Set to true if the field is optional
        unique: true, // Set to false to allow multiple users with the same influencer email
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    indexes: [
        { fields: ['email'], unique: true },
    ],
});

module.exports = LifeAccount;