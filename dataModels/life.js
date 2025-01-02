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
    unique: true, // Ensure email is unique in the database
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
  // Phase values for each frequency band
  phaseDelta: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  phaseTheta: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  phaseAlpha: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  phaseBeta: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  phaseGamma: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  NeuralSynchronyCohortId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: NeuralSynchronyCohort,
      key: 'id'
    },
    onUpdate: 'CASCADE', // Update foreign key on parent change
    onDelete: 'SET NULL', // Set to null if parent is deleted
  },
  checkedIn: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  }
}, {
  indexes: [
    { fields: ['email'], unique: true }, // Index for email field
  ],
});

Life.hasMany(NeuralSynchronyCohort, { foreignKey: 'lifeId', as: 'neuralSynchronyCohorts' });
Life.belongsTo(NeuralSynchronyCohort, { foreignKey: 'neuralSynchronyCohortId' });

Life.sync({ alter: true }) // Use `alter` for schema migrations
    .then(() => console.log('Life model synced'))
    .catch(err => console.error('Error syncing Life model:', err));

module.exports = Life;
