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
        type: DataTypes.STRING,
        allowNull: true,
    },
    passcodeExpiration: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    registered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    isSchumannActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // Default to false, can be set to true by the user or an admin
        allowNull: false
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