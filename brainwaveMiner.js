// brainwaveMiner.js

const { Op } = require('sequelize');
const {
    BrainwaveAlignmentCohort,
    // CohortCheckin, // Not directly used in the miner, but listed for completeness if needed in related logic
    // InterferenceReceipt, // Not directly used in the miner, but listed for completeness
    LifeAccount,
    LifeBalance,
    LifeBrainwave,
    SchumannResonance,
    CohortMember // Crucial for associating members to cohorts
} = require('./dataModels/associations.js'); // Adjust path to your associations file

// --- Helper Functions (moved from previous calculators) ---

// PLV Helper
function calculatePLV(phaseA, phaseB) {
    const phaseDifference = Math.abs(phaseA - phaseB);
    return Math.min(phaseDifference, 360 - phaseDifference); // Normalize phase difference to [0, 180]
}

// Schumann Alignment Helpers
function getClosestSchumannResonance(lifeTimestamp, schumannResonances) {
    let closestResonance = null;
    let smallestTimeDiff = Infinity;

    schumannResonances.forEach(resonance => {
        const timeDiff = Math.abs(resonance.timestamp.getTime() - lifeTimestamp.getTime());
        if (timeDiff < smallestTimeDiff) {
            smallestTimeDiff = timeDiff;
            closestResonance = resonance;
        }
    });
    return closestResonance;
}

function calculatePhaseDifference(lifePhase, schumannPhase) {
    const phaseDiff = Math.abs(lifePhase - schumannPhase);
    return phaseDiff > 180 ? 360 - phaseDiff : phaseDiff; // Ensure the phase difference is between 0-180 degrees
}

function calculateInterferenceStrength(phaseDifference) {
    if (phaseDifference <= 90) {
        return (90 - phaseDifference) / 90; // Constructive interference (0-1 range)
    } else if (phaseDifference <= 180) {
        return (phaseDifference - 90) / 90; // Destructive interference (0-1 range)
    }
    return 0; // Should not happen with 0-180 input
}

// --- Main Miner Functions ---

/**
 * Calculates and stores group and pairwise PLVs for active cohorts.
 * This function is intended to be called by a scheduled cron job.
 */
async function calculateAndStorePLVsForCohort() {
    try {
        // Fetch all cohorts that are marked as 'active' and have checked-in members
        const activeCohorts = await BrainwaveAlignmentCohort.findAll({
            where: { isActive: true }, // Assuming you add an 'isActive' boolean column to Cohort
            include: [{
                model: LifeAccount,
                as: 'members', // Make sure this alias matches your association definition
                through: {
                    model: CohortMember, // The junction table
                    attributes: ['checkedIn'],
                    where: { checkedIn: true }
                }
            }]
        });

        for (const cohort of activeCohorts) {
            const lifeAccounts = cohort.members;

            if (lifeAccounts.length < 2) {
                // console.log(`Not enough lives checked in (${lifeAccounts.length}) for cohort ${cohort.brainwaveAlignmentCohortId} to calculate PLV.`);
                continue;
            }

            // Fetch latest brainwave data for all members in the current cohort
            // Get data from a recent time window (e.g., last 2 minutes)
            const recentBrainwaves = await LifeBrainwave.findAll({
                where: {
                    lifeId: { [Op.in]: lifeAccounts.map(life => life.lifeId) },
                    timestamp: { [Op.gte]: new Date(Date.now() - 2 * 60 * 1000) } // Data from last 2 minutes
                },
                order: [['timestamp', 'DESC']], // Get most recent first
            });

            // Aggregate latest brainwave data by lifeId and channel
            const latestBrainwaveMap = new Map(); // Map: lifeId -> Map: channel -> LifeBrainwave
            for (const bw of recentBrainwaves) {
                if (!latestBrainwaveMap.has(bw.lifeId)) {
                    latestBrainwaveMap.set(bw.lifeId, new Map());
                }
                // Only store the latest entry for each channel within the time window
                if (!latestBrainwaveMap.get(bw.lifeId).has(bw.channel) || bw.timestamp > latestBrainwaveMap.get(bw.lifeId).get(bw.channel).timestamp) {
                    latestBrainwaveMap.get(bw.lifeId).set(bw.channel, bw);
                }
            }

            let totalGroupPhaseLockingValue = 0;
            let pairwiseCount = 0;
            let cohortConstructiveInterference = 0;
            let cohortDestructiveInterference = 0;

            // Loop through all unique pairs of life accounts
            for (let i = 0; i < lifeAccounts.length; i++) {
                for (let j = i + 1; j < lifeAccounts.length; j++) {
                    const lifeA = lifeAccounts[i];
                    const lifeB = lifeAccounts[j];

                    // --- Decide which channel and phase band to compare ---
                    // For truly hardware-agnostic PLV, you might compare all available channels
                    // and average their PLVs, or focus on a canonical set (if the client maps them).
                    // For simplicity, let's assume we pick a default channel (e.g., the first one available)
                    // and a specific phase band like 'alpha'.
                    // In a real scenario, you'd likely define which channels for a cohort to monitor.

                    const channelsA = latestBrainwaveMap.get(lifeA.lifeId);
                    const channelsB = latestBrainwaveMap.get(lifeB.lifeId);

                    if (!channelsA || !channelsB) {
                        // console.log(`Skipping PLV for pair [${lifeA.lifeId}, ${lifeB.lifeId}]: missing recent brainwave data.`);
                        continue;
                    }

                    // Iterate over available channels (e.g., all 4 from Muse)
                    for (const channelAId of channelsA.keys()) {
                        const brainwaveA_channel = channelsA.get(channelAId);
                        const brainwaveB_channel = channelsB.get(channelAId); // Compare homologous channel

                        if (brainwaveA_channel && brainwaveB_channel &&
                            brainwaveA_channel.phaseAlpha != null && brainwaveB_channel.phaseAlpha != null) { // Using phaseAlpha for example

                            const phaseA = brainwaveA_channel.phaseAlpha;
                            const phaseB = brainwaveB_channel.phaseAlpha;

                            const phaseLockingValue = calculatePLV(phaseA, phaseB); // In [0, 180]
                            const isConstructive = phaseLockingValue <= 90;
                            const adjustedPhaseLockingValue = isConstructive ? phaseLockingValue : 180 - phaseLockingValue; // Distance from 90

                            if (isConstructive) {
                                cohortConstructiveInterference += adjustedPhaseLockingValue;
                            } else {
                                cohortDestructiveInterference += adjustedPhaseLockingValue;
                            }

                            totalGroupPhaseLockingValue += phaseLockingValue;
                            pairwiseCount++;
                        }
                    }
                }
            }

            const groupPhaseLockingValue = pairwiseCount > 0 ? totalGroupPhaseLockingValue / pairwiseCount : 0;
            const netCohortInterference = cohortConstructiveInterference - cohortDestructiveInterference;

            // Update the cohort's overall PLV and interference metrics
            await cohort.update({
                phaseLockingValue: groupPhaseLockingValue,
                constructiveCohortInterference: cohortConstructiveInterference,
                destructiveCohortInterference: cohortDestructiveInterference,
                netCohortInterferenceBalance: netCohortInterference,
                lastCalculatedAt: new Date(),
            });
            console.log(`Updated cohort ${cohort.brainwaveAlignmentCohortId} PLV: ${groupPhaseLockingValue.toFixed(2)}, Net Interference: ${netCohortInterference.toFixed(2)}`);
        }
    } catch (err) {
        console.error('Error in scheduled PLV calculation:', err);
    }
}

/**
 * Calculates and stores brainwave-to-Schumann resonance alignment for active users.
 * This function is intended to be called by a scheduled cron job.
 */
async function calculateAndStoreSchumannAlignment() {
    try {
        const activeLives = await LifeAccount.findAll({
            where: { isSchumannActive: true } // Assuming you add an 'isSchumannActive' flag to LifeAccount
        });

        if (activeLives.length === 0) {
            // console.log('No active lives for Schumann alignment.');
            return;
        }

        // Fetch Schumann resonance data (e.g., from the last few hours or days)
        const schumannResonances = await SchumannResonance.findAll({
            order: [['timestamp', 'DESC']],
            limit: 100 // Fetch a reasonable number of recent entries
        });

        if (!schumannResonances.length) {
            console.warn('No Schumann resonance data found to compare with.');
            return;
        }

        for (const life of activeLives) {
            // Fetch the latest processed brainwave data for this life,
            // (e.g., from the last 2 minutes). We might need to aggregate across channels
            // if we want a single brainwave phase for comparison.
            const latestLifeBrainwaves = await LifeBrainwave.findAll({
                where: {
                    lifeId: life.lifeId,
                    timestamp: { [Op.gte]: new Date(Date.now() - 2 * 60 * 1000) } // Data from last 2 minutes
                },
                order: [['timestamp', 'DESC']],
                limit: 10 // Get latest for all channels, plus maybe a few seconds
            });

            if (latestLifeBrainwaves.length === 0) {
                // console.log(`No recent brainwave data found for life ${life.lifeId} for Schumann alignment.`);
                continue;
            }

            // To get a single "overall" brainwave phase for Schumann alignment,
            // you might average phases across all channels for the latest time point.
            // For simplicity, let's just take the most recent individual brainwave entry
            // and assume its 'frequencyWeightedPhase' (if implemented circularly) or 'phaseAlpha' is representative.
            // A more robust approach would be to average phases from all channels.
            const representativeBrainwave = latestLifeBrainwaves[0]; // Take the absolute latest entry for any channel

            if (!representativeBrainwave) {
                console.warn(`No representative brainwave data for life ${life.lifeId}.`);
                continue;
            }

            const closestSchumann = getClosestSchumannResonance(representativeBrainwave.timestamp, schumannResonances);

            if (!closestSchumann) {
                console.warn(`No close Schumann resonance data for timestamp ${representativeBrainwave.timestamp.toISOString()}`);
                continue;
            }

            let constructiveInterferenceSum = 0;
            let destructiveInterferenceSum = 0;
            let totalWeight = 0;

            const brainwaveBands = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma']; // Match Schumann fields

            brainwaveBands.forEach(band => {
                const lifePhase = representativeBrainwave[`phase${band}`];
                const schumannPhase = closestSchumann[`phase${band}`];

                if (lifePhase != null && schumannPhase != null) {
                    const phaseDifference = calculatePhaseDifference(lifePhase, schumannPhase);
                    const interferenceStrength = calculateInterferenceStrength(phaseDifference);

                    const bandPower = representativeBrainwave[`bandpower${band}`] || 1; // Use bandpower as weight
                    totalWeight += bandPower;

                    if (phaseDifference <= 90) { // Constructive
                        constructiveInterferenceSum += interferenceStrength * bandPower;
                    } else { // Destructive
                        destructiveInterferenceSum += interferenceStrength * bandPower;
                    }
                }
            });

            const normalizedConstructive = totalWeight > 0 ? constructiveInterferenceSum / totalWeight : 0;
            const normalizedDestructive = totalWeight > 0 ? destructiveInterferenceSum / totalWeight : 0;
            const netObjectiveInterference = normalizedConstructive - normalizedDestructive;

            // Update LifeBalance
            await LifeBalance.create({ // Or update if an entry for this timestamp/user already exists
                lifeId: life.lifeId,
                objectiveConstructiveInterference: normalizedConstructive,
                objectiveDestructiveInterference: normalizedDestructive,
                objectiveNetInterferenceBalance: netObjectiveInterference,
                timestamp: new Date(),
            });
            console.log(`Updated Schumann alignment for life ${life.lifeId}. Net Interference: ${netObjectiveInterference.toFixed(2)}`);
        }
    } catch (err) {
        console.error('Error in scheduled Schumann alignment calculation:', err);
    }
}

/**
 * Calculates and stores group frequency weighted bandpower for active cohorts.
 * This function is intended to be called by a scheduled cron job.
 * This assumes 'frequencyWeightedBandpower' is a direct field on the LifeAccount model.
 */
async function calculateAndStoreGroupBandpowerForCohorts() {
    try {
        const activeCohorts = await BrainwaveAlignmentCohort.findAll({
            where: { isActive: true }, // Filter for active cohorts
            include: [{
                model: LifeAccount,
                as: 'members', // Ensure this alias matches your association definition
                through: {
                    model: CohortMember, // The junction table
                    attributes: ['checkedIn'],
                    where: { checkedIn: true } // Only include checked-in members
                }
            }]
        });

        for (const cohort of activeCohorts) {
            const checkedInLives = cohort.members;

            if (checkedInLives.length < 2) {
                console.log(`Not enough checked-in lives (${checkedInLives.length}) for cohort ${cohort.brainwaveAlignmentCohortId} to calculate group bandpower.`);
                continue;
            }

            let sumFrequencyWeightedBandpower = 0;
            checkedInLives.forEach(life => {
                // Ensure life.frequencyWeightedBandpower exists and is a number
                sumFrequencyWeightedBandpower += life.frequencyWeightedBandpower || 0;
            });

            const numberOfLives = checkedInLives.length;
            const averageFrequencyWeightedBandpower = sumFrequencyWeightedBandpower / numberOfLives;

            // Update the cohort directly with the calculated average
            await cohort.update({
                groupFrequencyWeightedBandpower: averageFrequencyWeightedBandpower,
                lastGroupBandpowerCalculatedAt: new Date(), // New field to track last update
            });
            console.log(`Updated group bandpower for cohort ${cohort.brainwaveAlignmentCohortId}: ${averageFrequencyWeightedBandpower.toFixed(2)}`);
        }
    } catch (err) {
        console.error('Error in scheduled group bandpower calculation:', err);
    }
}


module.exports = {
    calculateAndStorePLVsForCohort,
    calculateAndStoreSchumannAlignment,
    calculateAndStoreGroupBandpowerForCohorts // Export the new function
};