const BrainwaveAlignmentCohort = require('./brainwaveAlignmentCohort.js');
const CohortCheckin = require('./cohortCheckin.js');
const InterferenceReceipt = require('./interferenceReceipt.js');
const LifeAccount = require('./lifeAccount.js');
const LifeBalance = require('./lifeBalance.js');
const LifeBrainwave = require('./lifeBrainwave.js');
const SchumannResonance = require('./schumannResonance.js');

// === Define Associations ===

// BrainwaveAlignmentCohort
BrainwaveAlignmentCohort.belongsTo(LifeAccount, { foreignKey: 'lifeId', as: 'life' });
BrainwaveAlignmentCohort.belongsTo(LifeAccount, { foreignKey: 'cohortAdminLifeId', as: 'admin' });

// CohortCheckin
CohortCheckin.belongsTo(LifeAccount, { foreignKey: 'lifeId' });

// InterferenceReceipt
InterferenceReceipt.belongsTo(LifeAccount, { foreignKey: 'lifeId' });

// LifeAccount
LifeAccount.hasMany(BrainwaveAlignmentCohort, { foreignKey: 'lifeId', as: 'brainwaveAlignmentCohorts' }); // ✅ Correct alias
LifeAccount.belongsTo(BrainwaveAlignmentCohort, { foreignKey: 'brainwaveAlignmentCohortId' }); // If needed
LifeAccount.hasMany(InterferenceReceipt, { foreignKey: 'lifeId' });
LifeAccount.hasMany(LifeBrainwave, { foreignKey: 'lifeId' });

// LifeBalance
LifeBalance.belongsTo(LifeAccount, { foreignKey: 'lifeId' });

// LifeBrainwave
LifeBrainwave.belongsTo(LifeAccount, { foreignKey: 'lifeId' });

// SchumannResonance: no associations yet

module.exports = {
    BrainwaveAlignmentCohort,
    CohortCheckin,
    InterferenceReceipt,
    LifeAccount,
    LifeBalance,
    LifeBrainwave,
    SchumannResonance,
};