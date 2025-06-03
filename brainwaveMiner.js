// brainwaveMiner.js

const { Op } = require('sequelize');
const {
    BrainwaveAlignmentCohort,
    LifeAccount,
    LifeBalance,
    LifeBrainwave,
    SchumannResonance,
    CohortMember
} = require('./dataModels/associations.js'); // Adjust path to your associations file

// --- Helper Functions ---

// PLV Helper
// Note: PLV is typically a value between 0 and 1, or 0 and 360 degrees.
// Your current calculatePLV returns a phase difference in [0, 180] degrees.
// For true PLV, you'd typically work with complex phase vectors or cosines of differences.
// For this implementation, we'll maintain the [0, 180] difference.
function calculatePLV(phaseA, phaseB) {
    // Assuming phaseA and phaseB are in degrees
    const phaseDifference = Math.abs(phaseA - phaseB);
    // Normalize phase difference to [0, 180]
    return phaseDifference > 180 ? 360 - phaseDifference : phaseDifference;
}

// Schumann Alignment Helpers
function getClosestSchumannResonance(targetTimestamp, schumannResonances) {
    let closestResonance = null;
    let smallestTimeDiff = Infinity;

    schumannResonances.forEach(resonance => {
        const timeDiff = Math.abs(resonance.timestamp.getTime() - targetTimestamp.getTime());
        if (timeDiff < smallestTimeDiff) {
            smallestTimeDiff = timeDiff;
            closestResonance = resonance;
        }
    });
    return closestResonance;
}

function calculatePhaseDifference(lifePhase, schumannPhase) {
    // Both phases should be in degrees for consistency with other helpers
    if (lifePhase === null || schumannPhase === null) return null; // Handle nulls gracefully

    let phaseDiff = Math.abs(lifePhase - schumannPhase);
    // Ensure the phase difference is between 0-180 degrees
    return phaseDiff > 180 ? 360 - phaseDiff : phaseDiff;
}

function calculateInterferenceStrength(phaseDifference) {
    if (phaseDifference === null) return 0; // Handle null input

    if (phaseDifference <= 90) {
        return (90 - phaseDifference) / 90; // Constructive interference (1 to 0 range)
    } else if (phaseDifference <= 180) {
        return (phaseDifference - 90) / 90; // Destructive interference (0 to 1 range)
    }
    return 0; // Should not happen with 0-180 input
}

// --- Main Miner Functions ---

/**
 * Calculates and stores group and pairwise PLVs for active cohorts within a specific global epoch.
 * @param {Date} epochStartTime - The start timestamp of the global epoch (UTC).
 * @param {Date} epochEndTime - The end timestamp of the global epoch (UTC).
 */
async function calculateAndStorePLVsForCohort(epochStartTime, epochEndTime) {
    try {
        console.log(`[PLV Miner] Processing epoch: ${epochStartTime.toISOString()} to ${epochEndTime.toISOString()}`);

        const activeCohorts = await BrainwaveAlignmentCohort.findAll({
            where: { isActive: true },
            include: [{
                model: LifeAccount,
                as: 'members',
                through: {
                    model: CohortMember,
                    attributes: ['checkedIn'],
                    where: { checkedIn: true }
                }
            }]
        });

        for (const cohort of activeCohorts) {
            const lifeAccounts = cohort.members;

            if (lifeAccounts.length < 2) {
                console.log(`[PLV Miner] Not enough lives checked in (${lifeAccounts.length}) for cohort ${cohort.brainwaveAlignmentCohortId}.`);
                continue;
            }

            // Fetch ALL brainwave data for this cohort within the current epoch
            const epochBrainwaves = await LifeBrainwave.findAll({
                where: {
                    lifeId: { [Op.in]: lifeAccounts.map(life => life.lifeId) },
                    timestamp: { // Ensure timestamp is within the defined epoch
                        [Op.gte]: epochStartTime,
                        [Op.lt]: epochEndTime
                    }
                },
                order: [['timestamp', 'ASC']], // Order for consistency if aggregating
            });

            // Aggregate phases by lifeId, channel, and band within the epoch
            // Map: lifeId -> Map: channel -> Map: band -> Array<phaseValues>
            const aggregatedPhasesForEpoch = new Map();
            for (const bw of epochBrainwaves) {
                if (!aggregatedPhasesForEpoch.has(bw.lifeId)) {
                    aggregatedPhasesForEpoch.set(bw.lifeId, new Map());
                }
                const lifeMap = aggregatedPhasesForEpoch.get(bw.lifeId);

                if (!lifeMap.has(bw.channel)) {
                    lifeMap.set(bw.channel, new Map());
                }
                const channelMap = lifeMap.get(bw.channel);

                // Add phases for each band (ensure they are not null)
                ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'].forEach(band => {
                    const phaseKey = `phase${band}`;
                    const phaseValue = bw[phaseKey];
                    if (phaseValue != null) {
                        if (!channelMap.has(band)) channelMap.set(band, []);
                        channelMap.get(band).push(phaseValue);
                    }
                });
            }

            // Now, compute the single representative phase for each lifeId/channel/band for this epoch
            // Map: lifeId -> Map: channel -> Map: band -> circularMeanPhase
            const representativePhases = new Map();
            for (const [lifeId, lifeData] of aggregatedPhasesForEpoch.entries()) {
                const currentLifeRepPhases = new Map();
                for (const [channel, channelData] of lifeData.entries()) {
                    const currentChannelRepPhases = new Map();
                    for (const [band, phasesArray] of channelData.entries()) {
                        const circularMean = getCircularMeanAngle(phasesArray);
                        if (circularMean !== null) { // Only store if a valid mean was calculated
                            currentChannelRepPhases.set(band, circularMean);
                        }
                    }
                    if (currentChannelRepPhases.size > 0) {
                        currentLifeRepPhases.set(channel, currentChannelRepPhases);
                    }
                }
                if (currentLifeRepPhases.size > 0) {
                    representativePhases.set(lifeId, currentLifeRepPhases);
                }
            }

            let totalGroupPhaseLockingValue = 0; // Sum of pairwise PLVs
            let pairwiseCount = 0;
            let cohortConstructiveInterference = 0;
            let cohortDestructiveInterference = 0;

            // Loop through all unique pairs of life accounts (using the original cohort members)
            for (let i = 0; i < lifeAccounts.length; i++) {
                for (let j = i + 1; j < lifeAccounts.length; j++) {
                    const lifeA = lifeAccounts[i];
                    const lifeB = lifeAccounts[j];

                    const channelsA = representativePhases.get(lifeA.lifeId);
                    const channelsB = representativePhases.get(lifeB.lifeId);

                    if (!channelsA || !channelsB) {
                        // console.log(`[PLV Miner] Skipping pair [${lifeA.lifeId}, ${lifeB.lifeId}]: missing representative phase data for epoch.`);
                        continue;
                    }

                    // Iterate over available channels (e.g., 'AF7', 'AF8')
                    // For PLV, typically you pick a specific channel or average across relevant ones.
                    // Let's iterate through common channels.
                    const commonChannels = Array.from(channelsA.keys()).filter(key => channelsB.has(key));

                    for (const channelId of commonChannels) {
                        const bandNames = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma']; // Iterate all bands
                        for (const band of bandNames) {
                            const phaseA = channelsA.get(channelId).get(band);
                            const phaseB = channelsB.get(channelId).get(band);

                            if (phaseA != null && phaseB != null) {
                                const phaseLockingValue = calculatePLV(phaseA, phaseB); // In [0, 180]
                                const isConstructive = phaseLockingValue <= 90;
                                // Interference strength ranges from 0 (at 90 deg diff) to 1 (at 0 or 180 deg diff)
                                const interferenceStrength = calculateInterferenceStrength(phaseLockingValue);

                                if (isConstructive) {
                                    cohortConstructiveInterference += interferenceStrength;
                                } else {
                                    cohortDestructiveInterference += interferenceStrength;
                                }

                                totalGroupPhaseLockingValue += phaseLockingValue; // Summing the 0-180 deg differences
                                pairwiseCount++;
                            }
                        }
                    }
                }
            }

            // Average the total phase locking value (average difference in degrees)
            const groupPhaseLockingValue = pairwiseCount > 0 ? totalGroupPhaseLockingValue / pairwiseCount : 0;
            // Net interference is the sum of constructive strengths minus destructive strengths
            const netCohortInterference = cohortConstructiveInterference - cohortDestructiveInterference;


            // Update the cohort's overall PLV and interference metrics
            await cohort.update({
                phaseLockingValue: groupPhaseLockingValue, // Average pairwise phase difference (0-180 deg)
                constructiveCohortInterference: cohortConstructiveInterference,
                destructiveCohortInterference: cohortDestructiveInterference,
                netCohortInterferenceBalance: netCohortInterference,
                lastCalculatedAt: new Date(), // Update timestamp
            });
            console.log(`[PLV Miner] Updated cohort ${cohort.brainwaveAlignmentCohortId}. Avg PLV (diff): ${groupPhaseLockingValue.toFixed(2)} deg, Net Interference: ${netCohortInterference.toFixed(2)}`);
        }
    } catch (err) {
        console.error('[PLV Miner] Error in scheduled PLV calculation:', err);
    }
}

/**
 * Calculates and stores brainwave-to-Schumann resonance alignment for active users within a specific global epoch.
 * @param {Date} epochStartTime - The start timestamp of the global epoch (UTC).
 * @param {Date} epochEndTime - The end timestamp of the global epoch (UTC).
 */
async function calculateAndStoreSchumannAlignment(epochStartTime, epochEndTime) {
    try {
        console.log(`[Schumann Miner] Processing epoch: ${epochStartTime.toISOString()} to ${epochEndTime.toISOString()}`);

        const activeLives = await LifeAccount.findAll({
            where: { isSchumannActive: true }
        });

        if (activeLives.length === 0) {
            console.log('[Schumann Miner] No active lives for Schumann alignment.');
            return;
        }

        // Fetch Schumann resonance data that falls within or is very close to the current epoch
        const schumannResonances = await SchumannResonance.findAll({
            where: {
                timestamp: {
                    [Op.gte]: new Date(epochStartTime.getTime() - 5000), // Look 5s before epoch for closest match
                    [Op.lt]: new Date(epochEndTime.getTime() + 5000)    // Look 5s after epoch for closest match
                }
            },
            order: [['timestamp', 'DESC']],
            limit: 20 // Fetch a reasonable number of recent entries around the epoch
        });

        if (!schumannResonances.length) {
            console.warn('[Schumann Miner] No Schumann resonance data found around the epoch to compare with.');
            return;
        }

        // Fetch all relevant brainwave data for active lives within the current epoch
        const epochBrainwaves = await LifeBrainwave.findAll({
            where: {
                lifeId: { [Op.in]: activeLives.map(life => life.lifeId) },
                timestamp: {
                    [Op.gte]: epochStartTime,
                    [Op.lt]: epochEndTime
                }
            },
            order: [['timestamp', 'ASC']],
        });

        // Aggregate phases by lifeId, channel, and band within the epoch
        // Map: lifeId -> Map: channel -> Map: band -> Array<phaseValues>
        const aggregatedLifePhases = new Map();
        for (const bw of epochBrainwaves) {
            if (!aggregatedLifePhases.has(bw.lifeId)) {
                aggregatedLifePhases.set(bw.lifeId, new Map());
            }
            const lifeMap = aggregatedLifePhases.get(bw.lifeId);

            if (!lifeMap.has(bw.channel)) {
                lifeMap.set(bw.channel, new Map());
            }
            const channelMap = lifeMap.get(bw.channel);

            ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'].forEach(band => {
                const phaseKey = `phase${band}`;
                const phaseValue = bw[phaseKey];
                if (phaseValue != null) {
                    if (!channelMap.has(band)) channelMap.set(band, []);
                    channelMap.get(band).push(phaseValue);
                }
            });
        }

        for (const life of activeLives) {
            const lifePhases = aggregatedLifePhases.get(life.lifeId);

            if (!lifePhases || lifePhases.size === 0) {
                console.log(`[Schumann Miner] No recent brainwave data found for life ${life.lifeId} for Schumann alignment in this epoch.`);
                continue;
            }

            // For Schumann alignment, we need an *overall* brainwave phase for each band.
            // A simple approach is to average phases across all available channels for each band.
            const representativeBrainwavePhases = new Map(); // Map<band, circularMeanPhase>
            ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'].forEach(band => {
                const allChannelPhasesForBand = [];
                for (const channelData of lifePhases.values()) { // Iterate through Map<channel, Map<band, phases>>
                    const phases = channelData.get(band);
                    if (phases && phases.length > 0) {
                        allChannelPhasesForBand.push(...phases);
                    }
                }
                const overallCircularMean = getCircularMeanAngle(allChannelPhasesForBand);
                if (overallCircularMean !== null) {
                    representativeBrainwavePhases.set(band, overallCircularMean);
                }
            });

            if (representativeBrainwavePhases.size === 0) {
                console.log(`[Schumann Miner] No valid representative brainwave phases for life ${life.lifeId} in this epoch.`);
                continue;
            }

            // Use the *center* of the epoch to find the closest Schumann resonance reading
            const epochCenterTime = new Date(epochStartTime.getTime() + (epochEndTime.getTime() - epochStartTime.getTime()) / 2);
            const closestSchumann = getClosestSchumannResonance(epochCenterTime, schumannResonances);

            if (!closestSchumann) {
                console.warn(`[Schumann Miner] No close Schumann resonance data found for epoch center ${epochCenterTime.toISOString()}`);
                continue;
            }

            let constructiveInterferenceSum = 0;
            let destructiveInterferenceSum = 0;
            let totalWeight = 0;

            const brainwaveBands = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];

            brainwaveBands.forEach(band => {
                const lifePhase = representativeBrainwavePhases.get(band);
                const schumannPhase = closestSchumann[`phase${band}`]; // Schumann has direct fields

                if (lifePhase != null && schumannPhase != null) {
                    const phaseDifference = calculatePhaseDifference(lifePhase, schumannPhase);
                    const interferenceStrength = calculateInterferenceStrength(phaseDifference);

                    // For weighting, we'll try to use the *aggregated* bandpower for this life and epoch
                    // This requires a bit more aggregation logic, or we can use a simpler default weight.
                    // For simplicity here, let's just use 1 as a weight, or you could query for an aggregated
                    // bandpower for this life from LifeBrainwave records in this epoch.
                    // A proper weighting would be to sum bandpowers across channels for this band for this life in this epoch.
                    // For now, let's just count.
                    const bandWeight = 1; // Or implement aggregated bandpower weighting if desired.
                    totalWeight += bandWeight;

                    if (phaseDifference <= 90) { // Constructive (phaseDiff 0-90 degrees)
                        constructiveInterferenceSum += interferenceStrength * bandWeight;
                    } else { // Destructive (phaseDiff 90-180 degrees)
                        destructiveInterferenceSum += interferenceStrength * bandWeight;
                    }
                }
            });

            const normalizedConstructive = totalWeight > 0 ? constructiveInterferenceSum / totalWeight : 0;
            const normalizedDestructive = totalWeight > 0 ? destructiveInterferenceSum / totalWeight : 0;
            const netObjectiveInterference = normalizedConstructive - normalizedDestructive;

            // Update LifeBalance. It's often better to create a new entry for each epoch calculation
            // to maintain a historical record of alignment scores.
            await LifeBalance.create({
                lifeId: life.lifeId,
                objectiveConstructiveInterference: normalizedConstructive,
                objectiveDestructiveInterference: normalizedDestructive,
                objectiveNetInterferenceBalance: netObjectiveInterference,
                timestamp: epochEndTime, // Use the epoch end time as the timestamp for this calculation
            });
            console.log(`[Schumann Miner] Updated Schumann alignment for life ${life.lifeId}. Net Interference: ${netObjectiveInterference.toFixed(2)}`);
        }
    } catch (err) {
        console.error('[Schumann Miner] Error in scheduled Schumann alignment calculation:', err);
    }
}

/**
 * Calculates and stores group frequency weighted bandpower for active cohorts.
 * This function currently aggregates over a 2-minute window.
 * If you want this to also be epoch-aligned, you would modify it similarly to the PLV function.
 */
async function calculateAndStoreGroupBandpowerForCohorts() {
    try {
        const activeCohorts = await BrainwaveAlignmentCohort.findAll({
            where: { isActive: true },
            include: [{
                model: LifeAccount,
                as: 'members',
                through: {
                    model: CohortMember,
                    attributes: ['checkedIn'],
                    where: { checkedIn: true }
                }
            }]
        });

        for (const cohort of activeCohorts) {
            const checkedInLives = cohort.members;

            if (checkedInLives.length < 2) {
                console.log(`[Group Bandpower Miner] Not enough checked-in lives (${checkedInLives.length}) for cohort ${cohort.brainwaveAlignmentCohortId}.`);
                continue;
            }

            // Fetch latest brainwave data for all members in the current cohort
            // This part still uses a relative window. If you want it epoch-aligned, pass epochStart/End
            const recentBrainwaves = await LifeBrainwave.findAll({
                where: {
                    lifeId: { [Op.in]: checkedInLives.map(life => life.lifeId) },
                    timestamp: { [Op.gte]: new Date(Date.now() - 2 * 60 * 1000) } // Data from last 2 minutes
                },
                order: [['timestamp', 'DESC']],
            });

            // Aggregate frequencyWeightedBandpower by lifeId
            const aggregatedFwbp = new Map(); // Map: lifeId -> Array<fwbpValues>
            for (const bw of recentBrainwaves) {
                if (bw.frequencyWeightedBandpower != null) {
                    if (!aggregatedFwbp.has(bw.lifeId)) {
                        aggregatedFwbp.set(bw.lifeId, []);
                    }
                    aggregatedFwbp.get(bw.lifeId).push(bw.frequencyWeightedBandpower);
                }
            }

            let sumAggregatedFwbp = 0;
            let countAggregatedFwbp = 0;
            for (const [lifeId, fwbpArray] of aggregatedFwbp.entries()) {
                if (fwbpArray.length > 0) {
                    // Average the FWBP for this life over the window if multiple entries
                    const lifeAverageFwbp = fwbpArray.reduce((sum, val) => sum + val, 0) / fwbpArray.length;
                    sumAggregatedFwbp += lifeAverageFwbp;
                    countAggregatedFwbp++;
                }
            }


            const averageGroupFrequencyWeightedBandpower = countAggregatedFwbp > 0 ? sumAggregatedFwbp / countAggregatedFwbp : 0;

            await cohort.update({
                groupFrequencyWeightedBandpower: averageGroupFrequencyWeightedBandpower,
                lastGroupBandpowerCalculatedAt: new Date(),
            });
            console.log(`[Group Bandpower Miner] Updated group bandpower for cohort ${cohort.brainwaveAlignmentCohortId}: ${averageGroupFrequencyWeightedBandpower.toFixed(2)}`);
        }
    } catch (err) {
        console.error('[Group Bandpower Miner] Error in scheduled group bandpower calculation:', err);
    }
}

/**
 * Main wrapper function to run all miner tasks for the most recently completed global epoch.
 * This function should be scheduled by your cron job.
 * @param {number} epochDurationMs - The duration of each global epoch in milliseconds (e.g., 1000 for 1 second).
 */
async function runMinerTasksForLastEpoch(epochDurationMs = 1000) {
    const now = Date.now();
    // Calculate the start of the *last completed* epoch
    const epochStartTimeMs = Math.floor((now - 1) / epochDurationMs) * epochDurationMs; // -1 to ensure we pick a *completed* epoch
    const epochStartTime = new Date(epochStartTimeMs);
    const epochEndTime = new Date(epochStartTimeMs + epochDurationMs);

    console.log(`--- Running miner tasks for epoch: ${epochStartTime.toISOString()} to ${epochEndTime.toISOString()} ---`);

    // Ensure database connection is ready if not handled globally by your app start
    // For example: require('./dataModels/database').sequelize.sync();

    await calculateAndStorePLVsForCohort(epochStartTime, epochEndTime);
    await calculateAndStoreSchumannAlignment(epochStartTime, epochEndTime);
    // The group bandpower calculation still uses a relative time window
    // If you need it epoch-aligned too, modify it to accept epochStartTime/EndTime
    await calculateAndStoreGroupBandpowerForCohorts();

    console.log(`--- Miner tasks completed for epoch: ${epochStartTime.toISOString()} ---`);
}

module.exports = {
    calculateAndStorePLVsForCohort,
    calculateAndStoreSchumannAlignment,
    calculateAndStoreGroupBandpowerForCohorts,
    runMinerTasksForLastEpoch // Export the new main entry point
};