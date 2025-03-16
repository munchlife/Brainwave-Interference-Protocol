// lifeAccount.js
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');
const BrainwaveAlignmentCohort = require('../dataModels/brainwaveAlignmentCohort.js');
const InterferenceReceipt = require('../dataModels/interferenceReceipt.js');
const LifeBrainwave = require('../dataModels/lifeBrainwave.js');

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
        allowNull: false,
    },
    lastName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
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
    timestamp: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    indexes: [
        { fields: ['email'], unique: true },
    ],
});

LifeAccount.hasMany(BrainwaveAlignmentCohort, { foreignKey: 'lifeId' });
LifeAccount.belongsTo(BrainwaveAlignmentCohort, { foreignKey: 'brainwaveAlignmentCohortId' });
LifeAccount.hasMany(InterferenceReceipt, {foreignKey: 'lifeId' });
LifeAccount.hasMany(LifeBrainwave, {foreignKey: 'lifeId' });

// Sync the LifeAccount table
LifeAccount.sync({ alter: true })
    .then(() => console.log('LifeAccount table synced'))
    .catch(err => console.error('Error syncing LifeAccount table:', err));

module.exports = LifeAccount;