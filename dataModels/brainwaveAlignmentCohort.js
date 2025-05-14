const { DataTypes } = require('sequelize');
const sequelize = require('../dataModels/database.js');
const LifeAccount = require('../dataModels/lifeAccount.js');

const BrainwaveAlignmentCohort = sequelize.define('BrainwaveAlignmentCohort', {
    brainwaveAlignmentCohortId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    cohortAdminLifeId: {  // New field for cohort admin
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: LifeAccount,
            key: 'lifeId',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL', // If admin account is deleted, don't delete the cohort
    },
    topic: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,  // Assuming 'topic' is unique, if not, you can remove this.
    },
    phaseLockingValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
            max: 180,
        },
    },
    groupBandpowerDelta: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
        },
    },
    groupBandpowerTheta: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
        },
    },
    groupBandpowerAlpha: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
        },
    },
    groupBandpowerBeta: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
        },
    },
    groupBandpowerGamma: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
        },
    },
    groupFrequencyWeightedBandpower: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
        },
    },
    groupDeltaPhaseLockingValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
            max: 180,
        },
    },
    groupThetaPhaseLockingValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
            max: 180,
        },
    },
    groupAlphaPhaseLockingValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
            max: 180,
        },
    },
    groupBetaPhaseLockingValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
            max: 180,
        },
    },
    groupGammaPhaseLockingValue: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
            max: 180,
        },
    },
    cohortConstructiveInterference: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
    },
    cohortDestructiveInterference: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
    },
    netCohortInterferenceBalance: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
    },
    lifeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: LifeAccount, // Ensures that the foreign key points to the 'Life' model.
            key: 'lifeId',
        },
        onUpdate: 'CASCADE', // If lifeId changes, update this field accordingly.
        onDelete: 'SET NULL', // If the associated Life is deleted, set lifeId to NULL.
    },
}, {
    indexes: [
        { fields: ['topic'], unique: true }, // Unique index on topic, if applicable
        { fields: ['lifeId'] }, // Index on foreign key for fast lookups
    ],
});

module.exports = BrainwaveAlignmentCohort;