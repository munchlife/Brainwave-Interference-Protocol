const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');
const Life = require('../dataModels/life.js');

const NeuralSynchronyCohort = sequelize.define('NeuralSynchronyCohort', {
    neuralSynchronyCohortId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    topic: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    phaseLockingValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
            max: 1,
        },
    },
    groupBandpower: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
        },
    },
});

// Define the reverse association with alias
NeuralSynchronyCohort.belongsTo(Life, { foreignKey: 'lifeId', as: 'life' });

module.exports = NeuralSynchronyCohort;
