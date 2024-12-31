const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');
const NeuralSynchronyCohort = require('../dataModels/neuralSynchronyCohort.js');

const Life = sequelize.define('Life', {
  lifeId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  registered: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  bandpowerDelta: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  bandpowerTheta: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  bandpowerAlpha: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  bandpowerBeta: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  bandpowerGamma: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  frequencyWeightedBandpower: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  constructiveInterference: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  destructiveInterference: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  phase: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
});

Life.hasMany(NeuralSynchronyCohort, { foreignKey: 'lifeId', as: 'neuralSynchronyCohorts' });

Life.sync({ force: false })
    .then(() => console.log('Life model synced'))
    .catch(err => console.error('Error syncing Life model:', err));

module.exports = Life;


