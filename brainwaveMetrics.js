// brainwaveMetrics.js

const FFT = require('fft.js');
const { LifeBrainwave } = require('./dataModels/associations'); // Ensure this path is correct
const { getCircularMeanAngle } = require('./circularStats'); // Assuming this is correct

// Define standard frequency bands
const BAND_FREQUENCIES = {
    delta: [0.5, 4],
    theta: [4, 8],
    alpha: [8, 13],
    beta: [13, 30],
    gamma: [30, 45]
};

/**
 * Applies a Hamming window to an array of data.
 * Hamming window reduces spectral leakage in FFT.
 * @param {number[]} data - The input array of samples.
 * @returns {number[]} The windowed data array.
 */
function applyHammingWindow(data) {
    const N = data.length;
    const windowedData = new Array(N);
    for (let i = 0; i < N; i++) {
        const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
        windowedData[i] = data[i] * hamming;
    }
    return windowedData;
}

/**
 * Pads an array with zeros to the next power of 2.
 * @param {number[]} arr - The input array.
 * @returns {number[]} The padded array.
 */
function padToNextPowerOf2(arr) {
    const len = arr.length;
    if ((len & (len - 1)) === 0) {
        return [...arr];
    }
    const nextPower = Math.pow(2, Math.ceil(Math.log2(len)));
    console.log(`[Backend Debug] Padding array from ${len} to ${nextPower}`);
    return arr.concat(new Array(nextPower - len).fill(0));
}

/**
 * Calculates raw (non-dB) total power within a given frequency band.
 * This is the sum of power spectral density (PSD) values within the band.
 * @param {number[]} psdArray - Array of power spectral density (PSD) values for each frequency bin.
 * @param {number} fLow - Lower bound of the frequency band (Hz).
 * @param {number} fHigh - Upper bound of the frequency band (Hz).
 * @param {number} sampleRate - The sampling rate (Hz).
 * @param {number} fftSize - The total size of the FFT.
 * @returns {number} The raw total power for the band (e.g., in uV^2/Hz).
 */
function getBandPowerRaw(psdArray, fLow, fHigh, sampleRate, fftSize) {
    const binSize = sampleRate / fftSize; // Frequency resolution of each bin

    const iLow = Math.floor(fLow / binSize);
    const iHigh = Math.floor(fHigh / binSize);
    let totalPower = 0;

    for (let i = iLow; i <= iHigh; i++) {
        if (i >= 0 && i < psdArray.length) {
            const psd = psdArray[i]; // psdArray already contains power spectral density
            if (psd !== undefined && psd !== null && !isNaN(psd)) {
                totalPower += psd; // Summing PSDs within the band
            }
        }
    }
    return totalPower;
}

/**
 * Calculates the centroid frequency (frequency-weighted average) of power within a given band.
 * This is NOT total bandpower, but a measure of the "center of mass" of the power spectrum in the band.
 * @param {number[]} psdArray - Array of power spectral density (PSD) values for each frequency bin.
 * @param {number} fLow - Lower bound of the frequency band (Hz).
 * @param {number} fHigh - Upper bound of the frequency band (Hz).
 * @param {number} sampleRate - The sampling rate (Hz).
 * @param {number} fftSize - The total size of the FFT.
 * @returns {number} The frequency-weighted average frequency for the band (e.g., in Hz).
 */
function getBandCentroidFrequency(psdArray, fLow, fHigh, sampleRate, fftSize) {
    const binSize = sampleRate / fftSize;

    const iLow = Math.floor(fLow / binSize);
    const iHigh = Math.floor(fHigh / binSize);
    let totalPsd = 0;
    let weightedSum = 0;

    for (let i = iLow; i <= iHigh; i++) {
        if (i >= 0 && i < psdArray.length) {
            const freq = i * binSize; // Frequency of this bin
            const psd = psdArray[i];

            if (psd !== undefined && psd !== null && !isNaN(psd)) {
                totalPsd += psd;
                weightedSum += freq * psd;
            }
        }
    }
    const result = totalPsd > 0 ? weightedSum / totalPsd : 0;
    return result;
}


/**
 * Calculates EEG metrics (bandpower, phase) for a given window of raw data and stores them.
 * @param {number} lifeId - The ID of the life account (now an integer).
 * @param {string} channelIdentifier - The client-defined identifier for the EEG channel.
 * @param {number[]} rawEEGArray - An array of raw amplitude values for the window.
 * @param {number} sampleRate - The actual sampling rate of the data in Hz.
 * @param {Date} windowStartTime - The estimated start timestamp of this data window.
 * @returns {object} An object containing calculated bandpowers, phases, frequency-weighted bandpower,
 * and a boolean indicating if the data was successfully saved to the database.
 */
async function calculateEEGMetricsAndStore(lifeId, channelIdentifier, rawEEGArray, sampleRate, windowStartTime) {
    console.log(`[Backend Debug] - calculateEEGMetricsAndStore called for ${lifeId}-${channelIdentifier}`);
    console.log(`[Backend Debug] - Received for ${channelIdentifier}: rawEEGArray.length=${rawEEGArray.length}`);
    if (rawEEGArray.length === 0) {
        console.warn('Received empty EEG array for calculation.');
        return {
            metrics: { // Default metrics if no calculation performed
                bandpowers: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
                phases: { delta: null, theta: null, alpha: null, beta: null, gamma: null },
                frequencyWeightedBandpower: 0
            },
            dbSaveSuccess: false // No data, so no save
        };
    }

    const maxVal = rawEEGArray.reduce((max, val) => (val > max ? val : max), -Infinity);
    const minVal = rawEEGArray.reduce((min, val) => (val < min ? val : min), Infinity);
    console.log(`[Backend Debug] - First 5 raw samples (after filtering): ${rawEEGArray.slice(0, 5).map(s => s.toFixed(2))}`);
    console.log(`[Backend Debug] - Max raw sample (after filtering): ${maxVal.toFixed(2)} uV`);
    console.log(`[Backend Debug] - Min raw sample (after filtering): ${minVal.toFixed(2)} uV`);

    // 1. Apply Hamming Window
    const windowedData = applyHammingWindow(rawEEGArray);

    // 2. Pad to next power of 2 for FFT
    const paddedEEGArray = padToNextPowerOf2(windowedData);
    const fftSize = paddedEEGArray.length;

    // 3. Perform FFT
    const fftInstance = new FFT(fftSize);
    const phasors = fftInstance.createComplexArray();
    fftInstance.realTransform(phasors, paddedEEGArray);

    console.log(`[Backend Debug] - FFT Size: ${fftSize}, SampleRate: ${sampleRate}`);

    // 4. Calculate Power Spectral Density (PSD)
    const psd = [];
    const normalizationFactor = 2 / (fftSize * sampleRate);
    for (let i = 0; i < (fftSize / 2) + 1; i++) {
        const real = phasors[i * 2];
        const imag = phasors[i * 2 + 1];
        const magnitudeSquared = (real * real + imag * imag);
        psd.push(magnitudeSquared * normalizationFactor);
    }

    console.log(`[Backend Debug] - PSD Array Length: ${psd.length}`);
    console.log(`[Backend Debug] - PSD Array (first 5 bins):`, psd.slice(0, 5).map(p => p.toFixed(8)));
    console.log(`[Backend Debug] - Max PSD Value in Array: ${Math.max(...psd).toFixed(8)}`);


    // --- Calculate Phases for each band (using circular mean) ---
    const calculatedPhases = {};
    const binSize = sampleRate / fftSize;
    for (const bandName in BAND_FREQUENCIES) {
        const [minFreq, maxFreq] = BAND_FREQUENCIES[bandName];
        const relevantPhasesInRadians = [];

        for (let i = 0; i < (fftSize / 2) + 1; i++) {
            const freq = i * binSize;
            if (freq >= minFreq && freq <= maxFreq) {
                const real = phasors[i * 2];
                const imag = phasors[i * 2 + 1];

                if (real !== 0 || imag !== 0) {
                    relevantPhasesInRadians.push(Math.atan2(imag, real));
                }
            }
        }
        calculatedPhases[bandName] = getCircularMeanAngle(relevantPhasesInRadians);
        console.log(`[Backend Debug] ${bandName} Phase: ${calculatedPhases[bandName] !== null ? calculatedPhases[bandName].toFixed(2) : 'null'} (from ${relevantPhasesInRadians.length} relevant bins)`);
    }

    // --- Calculate Total Bandpowers (in uV^2/Hz) and Centroid Frequency ---
    const bandpowersLinear = {};
    let totalFrequencyWeightedBandpowerSum = 0;
    let totalBandwidthSum = 0;

    for (const bandName in BAND_FREQUENCIES) {
        const [minFreq, maxFreq] = BAND_FREQUENCIES[bandName];

        const rawTotalBandpower = getBandPowerRaw(psd, minFreq, maxFreq, sampleRate, fftSize);
        bandpowersLinear[bandName] = rawTotalBandpower;

        totalFrequencyWeightedBandpowerSum += getBandCentroidFrequency(psd, minFreq, maxFreq, sampleRate, fftSize) * (maxFreq - minFreq);
        totalBandwidthSum += (maxFreq - minFreq);

        console.log(`[Backend Debug] ${bandName} Linear Bandpower: ${bandpowersLinear[bandName].toFixed(8)} uV^2/Hz`);
    }

    const frequencyWeightedBandpower = totalBandwidthSum > 0 ?
        totalFrequencyWeightedBandpowerSum / totalBandwidthSum : 0;
    console.log(`[Backend Debug] Overall Freq-Weighted Bandpower: ${frequencyWeightedBandpower.toFixed(4)} Hz (centroid)`);


    // --- Prepare data for database storage ---
    const brainwaveData = {
        lifeId: lifeId,
        timestamp: windowStartTime,
        channel: channelIdentifier,
        bandpowerDelta: bandpowersLinear.delta,
        bandpowerTheta: bandpowersLinear.theta,
        bandpowerAlpha: bandpowersLinear.alpha,
        bandpowerBeta: bandpowersLinear.beta,
        bandpowerGamma: bandpowersLinear.gamma,
        phaseDelta: calculatedPhases.delta,
        phaseTheta: calculatedPhases.theta,
        phaseAlpha: calculatedPhases.alpha,
        phaseBeta: calculatedPhases.beta,
        phaseGamma: calculatedPhases.gamma,
        frequencyWeightedBandpower: frequencyWeightedBandpower,
    };

    let dbSaveSuccess = false; // Flag to indicate if DB save was successful
    try {
        await LifeBrainwave.create(brainwaveData);
        console.log(`Stored processed EEG metrics for ${lifeId}-${channelIdentifier} at ${windowStartTime.toISOString()}`);
        dbSaveSuccess = true; // Set to true on successful save
    } catch (error) {
        console.error(`Error saving EEG metrics for ${lifeId}-${channelIdentifier}:`, error);
        dbSaveSuccess = false; // Ensure this is false on error
    }

    // --- RETURN ALL CALCULATED METRICS AND DB SAVE STATUS ---
    return {
        metrics: {
            bandpowers: { // Return bandpowers in linear uV^2/Hz
                delta: bandpowersLinear.delta,
                theta: bandpowersLinear.theta,
                alpha: bandpowersLinear.alpha,
                beta: bandpowersLinear.beta,
                gamma: bandpowersLinear.gamma
            },
            phases: {
                delta: calculatedPhases.delta,
                theta: calculatedPhases.theta,
                alpha: calculatedPhases.alpha,
                beta: calculatedPhases.beta,
                gamma: calculatedPhases.gamma
            },
            frequencyWeightedBandpower: frequencyWeightedBandpower // Return as Hz
        },
        dbSaveSuccess: dbSaveSuccess // <-- NEW: Add the database save status here
    };
}

module.exports = { calculateEEGMetricsAndStore };