// src/signalProcessing.js

/**
 * Applies a first-order high-pass filter to an array of data.
 * This is effective for removing DC offset and slow drifts.
 *
 * @param {number[]} data - The input array of raw EEG samples.
 * @param {number} cutoffFreq - The cutoff frequency in Hz (e.g., 0.5 Hz for typical EEG).
 * @param {number} sampleRate - The sampling rate of the data in Hz.
 * @returns {number[]} The filtered data array.
 */
function highPassFilter(data, cutoffFreq, sampleRate) {
    if (!data || data.length === 0) {
        return [];
    }

    const rc = 1.0 / (cutoffFreq * 2 * Math.PI); // RC time constant
    const dt = 1.0 / sampleRate;                 // Time step
    const alpha = rc / (rc + dt);               // Filter coefficient

    const filteredData = new Array(data.length);
    let y = 0; // Previous filtered output
    let x = 0; // Previous raw input

    for (let i = 0; i < data.length; i++) {
        // High-pass filter equation: y[i] = alpha * y[i-1] + alpha * (x[i] - x[i-1])
        y = alpha * y + alpha * (data[i] - x);
        filteredData[i] = y;
        x = data[i]; // Store current input for next iteration
    }
    return filteredData;
}

module.exports = { highPassFilter };