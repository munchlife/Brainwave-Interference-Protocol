const { DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js'); // Import your sequelize instance
const Life = require('./lifeAccount');

// Define the InterferenceReceipt model
const InterferenceReceipt = sequelize.define('InterferenceReceipt', {
    interferenceReceiptId: {
        type: DataTypes.INTEGER,
        primaryKey: true, // Define interferenceReceiptId as the primary key
        autoIncrement: true, // Automatically increment the ID
    },
    interferenceDegree: {
        type: DataTypes.BOOLEAN, // Set as BOOLEAN to indicate constructive (true) or destructive (false) interference
        allowNull: false,
    },
    bandPowerIncrease: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    bandPowerDecrease: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    constructiveInterferenceUnits: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    destructiveInterferenceUnits: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    wordDefinition: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    interfererId: {
        type: DataTypes.INTEGER,
        allowNull: true, // Stores the ID of the interferer (if applicable)
    },
    lifeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Life, // Ensures that the foreign key points to the 'Life' model
            key: 'lifeId',
        },
        onUpdate: 'CASCADE', // If lifeId changes, update this field accordingly
        onDelete: 'SET NULL', // If the associated Life is deleted, set lifeId to NULL
    },
}, {
    indexes: [
        { fields: ['lifeId'] }, // Index on lifeId for faster querying of interference receipts by Life
    ],
});

module.exports = InterferenceReceipt;


