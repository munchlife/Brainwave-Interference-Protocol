// models/InterferenceReceipt.js
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js'); // Import your sequelize instance
const Life = require('../dataModels/life.js'); // Import the Life model

// Define the InterferenceReceipt model
const InterferenceReceipt = sequelize.define('InterferenceReceipt', {
    interferenceReceiptId: {
        type: DataTypes.INTEGER,
        primaryKey: true, // Define interferenceReceiptId as the primary key
        autoIncrement: true, // Automatically increment the ID
    },
    interferenceDegree: {
        type: DataTypes.BOOLEAN,
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
});

// Define the relationship between InterferenceReceipt and Life (Association)
InterferenceReceipt.belongsTo(Life, { foreignKey: 'lifeId' });

module.exports = InterferenceReceipt;


