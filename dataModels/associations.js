// dataModels/associations.js
const BrainwaveAlignmentCohort = require('./brainwaveAlignmentCohort.js');
const InterferenceReceipt = require('./interferenceReceipt.js');
const LifeAccount = require('./lifeAccount.js');
const LifeBalance = require('./lifeBalance.js');
const LifeBrainwave = require('./lifeBrainwave.js');
const SchumannResonance = require('./schumannResonance.js');
const CohortMember = require('./cohortMember.js'); // Import the new junction table

// === Define Associations ===

// BrainwaveAlignmentCohort
BrainwaveAlignmentCohort.belongsTo(LifeAccount, { foreignKey: 'lifeId', as: 'primaryContact' });
BrainwaveAlignmentCohort.belongsTo(LifeAccount, { foreignKey: 'cohortAdminLifeId', as: 'admin' });

// InterferenceReceipt
InterferenceReceipt.belongsTo(LifeAccount, { foreignKey: 'lifeId' });

// LifeAccount
LifeAccount.hasMany(InterferenceReceipt, { foreignKey: 'lifeId' });
LifeAccount.hasMany(LifeBrainwave, { foreignKey: 'lifeId' });
LifeAccount.hasMany(BrainwaveAlignmentCohort, { foreignKey: 'cohortAdminLifeId', as: 'administeredCohorts' });

// Many-to-Many relationship between LifeAccount and BrainwaveAlignmentCohort through CohortMember
LifeAccount.belongsToMany(BrainwaveAlignmentCohort, {
    through: CohortMember,
    foreignKey: 'lifeId',
    otherKey: 'brainwaveAlignmentCohortId',
    as: 'memberCohorts'
});
BrainwaveAlignmentCohort.belongsToMany(LifeAccount, {
    through: CohortMember,
    foreignKey: 'brainwaveAlignmentCohortId',
    otherKey: 'lifeId',
    as: 'members'
});

// LifeBalance
LifeBalance.belongsTo(LifeAccount, { foreignKey: 'lifeId' });

// LifeBrainwave
LifeBrainwave.belongsTo(LifeAccount, { foreignKey: 'lifeId' });

// SchumannResonance: no associations yet

module.exports = {
    BrainwaveAlignmentCohort,
    InterferenceReceipt,
    LifeAccount,
    LifeBalance,
    LifeBrainwave,
    SchumannResonance,
    CohortMember, // Export the new junction table
};