// src/main.js
import { MuseClient } from 'muse-js';
import { FFT } from 'jsfft'; // Corrected: Removed the '=' sign here

// Expose MuseClient and FFT globally for potential debugging or browser console access.
window.Muse = {
    MuseClient: MuseClient,
    FFT: FFT // Exposing the jsfft FFT function
};

console.log("Muse.js client and FFT (jsfft) exposed globally via Parcel bundle. All app logic runs from here.");

// Ensure the DOM is fully loaded before accessing HTML elements
document.addEventListener('DOMContentLoaded', () => {
    const client = new MuseClient();
    const output = document.getElementById('output');
    // Ensure the phaseOutput element exists in your HTML for this to work
    const phaseOutput = document.getElementById('phaseOutput');
    const SAMPLE_RATE = 256; // Standard EEG sample rate

    // Buffer to store EEG samples for each channel
    let buffer = {
        TP9: [], AF7: [], AF8: [], TP10: []
    };

    // Main function to connect to Muse and start data streaming
    async function start() {
        output.textContent = "Attempting to connect to Muse S...";
        if (phaseOutput) { // Safely initialize if phaseOutput exists
            phaseOutput.textContent = "Waiting for phase data...";
        }
        console.log("start() function called. Attempting client.connect()...");
        try {
            await client.connect(); // Triggers browser's Bluetooth pairing dialog
            console.log("client.connect() successful! Attempting client.start()...");
            await client.start(); // Starts streaming data from Muse
            console.log("client.start() successful. Subscribing to EEG readings...");

            output.textContent = "Connected to Muse S. Gathering EEG data...";
            if (phaseOutput) { // Safely update if phaseOutput exists
                phaseOutput.textContent = "Gathering phase data...";
            }

            // Subscribe to EEG readings from the Muse
            client.eegReadings.subscribe(reading => {
                const channel = reading.electrode; // Electrode index (0-3)
                const electrodeNames = ['TP9', 'AF7', 'AF8', 'TP10'];
                const channelName = electrodeNames[channel] || `Unknown Channel ${channel}`;

                // Initialize buffer for channel if it doesn't exist
                if (!buffer[channelName]) buffer[channelName] = [];

                // Add new samples to the buffer for the respective channel
                buffer[channelName].push(...reading.samples);

                // Keep buffer size limited to SAMPLE_RATE for FFT window
                if (buffer[channelName].length > SAMPLE_RATE) {
                    buffer[channelName] = buffer[channelName].slice(-SAMPLE_RATE);
                }
            });
            console.log("EEG readings subscription initiated.");

            // Set up an interval to process bandpower and phase every second
            setInterval(() => {
                console.log("Interval triggered. Processing bandpower and phase...");
                // Changed text to accurately reflect the frequency-weighted average being displayed
                let outputText = 'Bandpower (Frequency-Weighted Average Hz):\n';
                // Changed text to reflect degrees
                let phaseText = 'Phase Data (Degrees, First 10 Bins):\n';

                const channelNames = ['TP9', 'AF7', 'AF8', 'TP10'];

                // Process each EEG channel
                for (let ch of channelNames) {
                    const samples = buffer[ch];

                    console.log(`Checking Channel ${ch}: has ${samples ? samples.length : 0} samples.`);

                    // Skip calculation if not enough samples are buffered
                    if (!samples || samples.length < SAMPLE_RATE) {
                        console.log(`Skipping calculations for ${ch}: Not enough samples (${samples ? samples.length : 0}/${SAMPLE_RATE})`);
                        continue;
                    }

                    // --- Debugging Samples ---
                    console.log(`--- Debugging Channel ${ch} ---`);
                    console.log(`Samples for ${ch} (first 5):`, samples.slice(0, 5));
                    console.log(`Samples for ${ch} (last 5):`, samples.slice(-5));
                    // Calculate basic stats for the samples array
                    const sampleStats = samples.reduce((acc, val) => {
                        acc.sum += val;
                        acc.min = Math.min(acc.min, val);
                        acc.max = Math.max(acc.max, val);
                        return acc;
                    }, { sum: 0, min: Infinity, max: -Infinity });
                    console.log(`Samples Stats: Min=${sampleStats.min.toFixed(2)}, Max=${sampleStats.max.toFixed(2)}, Sum=${sampleStats.sum.toFixed(2)}`);
                    if (sampleStats.min === sampleStats.max) {
                        console.warn(`WARNING: Samples for ${ch} are all identical! FFT will be flat.`);
                    }

                    // Perform FFT on the samples using jsfft
                    // This will return a ComplexArray object with .real and .imag properties
                    const fftResultComplexArray = FFT(samples);

                    // Convert the ComplexArray's real and imag parts into an interleaved array
                    // as expected by your magnitude calculation logic.
                    const fftResult = [];
                    for (let i = 0; i < fftResultComplexArray.length; i++) {
                        fftResult.push(fftResultComplexArray.real[i]);
                        fftResult.push(fftResultComplexArray.imag[i]);
                    }

                    // --- Debugging FFT Result ---
                    console.log(`FFT Result from jsfft for ${ch} (first 10 interleaved elements):`, fftResult.slice(0, 10));

                    const magnitudes = [];
                    // Iterate through the interleaved real/imaginary parts
                    for (let i = 0; i < fftResult.length; i += 2) { // Iterate by 2
                        const real = fftResult[i];
                        const imag = fftResult[i + 1];
                        magnitudes.push(Math.sqrt(real * real + imag * imag)); // Calculate magnitude
                    }

                    // For real-valued input signals, the FFT spectrum is symmetric.
                    // We only need the first half of the magnitudes (up to the Nyquist frequency).
                    const relevantMagnitudes = magnitudes.slice(0, magnitudes.length / 2);

                    // Power is typically defined as magnitude squared
                    const power = relevantMagnitudes.map(m => m * m);

                    // --- Debugging Power Array ---
                    console.log(`Power Array for ${ch} (first 5):`, power.slice(0, 5).map(v => v.toFixed(2)));
                    console.log(`Power Array Length:`, power.length);
                    // Calculate basic stats for the power array
                    const powerStats = power.reduce((acc, val) => {
                        acc.sum += val;
                        acc.min = Math.min(acc.min, val);
                        acc.max = Math.max(acc.max, val);
                        return acc;
                    }, { sum: 0, min: Infinity, max: -Infinity });
                    console.log(`Power Stats: Min=${powerStats.min.toFixed(2)}, Max=${powerStats.max.toFixed(2)}, Sum=${powerStats.sum.toFixed(2)}`);
                    if (powerStats.sum === 0) {
                        console.warn(`WARNING: Total power for ${ch} is zero!`);
                    }

                    const uniqueFreqBins = power.length; // Number of unique frequency bins

                    // Calculate bandpower for different EEG bands
                    const bandPower = {
                        delta: bandPowerInRange(power, 0.5, 4, uniqueFreqBins),
                        theta: bandPowerInRange(power, 4, 8, uniqueFreqBins),
                        alpha: bandPowerInRange(power, 8, 13, uniqueFreqBins),
                        beta:  bandPowerInRange(power, 13, 30, uniqueFreqBins),
                        gamma: bandPowerInRange(power, 30, 45, uniqueFreqBins)
                    };

                    console.log(`Calculated Bandpower for ${ch}:`, bandPower);

                    // Append bandpower data to output text
                    outputText += `${ch}:\n`;
                    for (let band in bandPower) {
                        outputText += `  ${band}: ${bandPower[band].toFixed(2)}\n`;
                    }

                    // --- Phase Calculation and Display ---
                    if (phaseOutput) { // Only calculate and display phase if phaseOutput element exists
                        phaseText += `${ch}:\n`;
                        // Loop through the first 10 (or desired number) of relevant frequency bins for phase
                        const numPhaseBinsToDisplay = Math.min(10, fftResultComplexArray.length / 2); // Display up to 10 bins or half array length

                        for (let i = 0; i < numPhaseBinsToDisplay; i++) {
                            const real = fftResultComplexArray.real[i];
                            const imag = fftResultComplexArray.imag[i];
                            let phase = Math.atan2(imag, real); // Calculate phase in radians
                            phase = phase * (180 / Math.PI); // Convert radians to degrees

                            const freqBinHz = (i + 0.5) * ((SAMPLE_RATE / 2) / (fftResultComplexArray.length / 2)); // Calculate actual frequency for this bin
                            phaseText += `  Bin ${i} (${freqBinHz.toFixed(1)} Hz): ${phase.toFixed(3)} deg\n`;
                        }
                    }
                }

                // Update the output display on the webpage
                output.textContent = outputText;
                if (phaseOutput) { // Only update if phaseOutput exists
                    phaseOutput.textContent = phaseText;
                }
            }, 1000); // Update every second
        } catch (e) {
            console.error("Error during Muse connection or start:", e);
            output.textContent = 'Connection failed: ' + (e.message || e);
        }
    }

    // Helper function to calculate frequency-weighted average (centroid frequency) within a given range
    function bandPowerInRange(powerArray, fLow, fHigh, bins) {
        // binSize: The width of each frequency bin in Hz
        const binSize = (SAMPLE_RATE / 2) / bins;

        const iLow = Math.floor(fLow / binSize);
        const iHigh = Math.floor(fHigh / binSize);
        let totalPower = 0;
        let weightedSum = 0; // For frequency-weighted average

        for (let i = iLow; i <= iHigh; i++) {
            if (i >= 0 && i < powerArray.length) { // Ensure index is within bounds
                const freq = (i + 0.5) * binSize; // Use center of bin for frequency weighting
                const pwr = powerArray[i];

                if (pwr !== undefined && pwr !== null && !isNaN(pwr)) {
                    totalPower += pwr;
                    weightedSum += freq * pwr;
                }
            }
        }
        // Return frequency-weighted average, or 0 if totalPower is 0 to avoid division by zero.
        // This calculates the "centroid frequency" of the power within the band.
        return totalPower > 0 ? weightedSum / totalPower : 0;
    }

    // Attach event listener to the "Connect to Muse S" button
    document.getElementById('connect').onclick = () => {
        console.log("Connect button clicked.");
        start();
    };
});