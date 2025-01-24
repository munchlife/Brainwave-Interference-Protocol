const express = require('express');
const router = express.Router();
const LifeAccount = require('../dataModels/lifeAccount.js'); // Life
const LifeBrainwave = require('../dataModels/lifeBrainwave.js');
const LifeBalance = require('../dataModels/lifeBalance.js');
const SchumannResonance = require('../dataModels/schumannResonance.js'); // Life model// model
const fft = require('fft-js').fft;
const FFT = require('fft.js');
const multer = require('multer');
const upload = multer(); // Memory storage for simplicity
const authenticateToken = require('../middlewares/authenticateToken'); // Centralized middleware
const verifyLifeId = require('../middlewares/verifyLifeId'); // Centralized middleware

// GET: Get all Life records
router.get('/', authenticateToken, async (req, res) => {
    try {
        const lives = await LifeAccount.findAll();
        return res.json(lives);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// GET: Get a specific Life record by lifeId
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const life = await LifeAccount.findByPk(req.params.id);
        if (!life) {
            return res.status(404).json({ error: 'Life not found' });
        }
        return res.json(life);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// POST: Upload raw EEG data
router.post('/:lifeId/upload-raw-eeg', authenticateToken, verifyLifeId, upload.single('eegData'), async (req, res) => {
    try {
        const life = req.life; // Already validated by middleware

        // Validate file or data
        if (!req.file && !req.body.rawEEG) {
            return res.status(400).json({ error: 'No EEG data provided' });
        }

        // Raw EEG can be uploaded as a file (binary) or JSON array (string)
        const rawEEG = req.file ? req.file.buffer.toString() : req.body.rawEEG;

        // Validate raw EEG data (if JSON format is used)
        if (typeof rawEEG === 'string') {
            try {
                JSON.parse(rawEEG); // Ensure it is valid JSON if it's a string
            } catch (err) {
                return res.status(400).json({ error: 'Invalid JSON format for raw EEG data' });
            }
        }

        // Save raw EEG data in the database
        const newLifeBrainwave = await LifeBrainwave.create({
            lifeId: life.lifeId,
            rawEEG,
            timestamp: new Date(),
        });

        res.status(200).json({
            message: 'Raw EEG data uploaded successfully',
            lifeBrainwave: newLifeBrainwave,
        });
    } catch (err) {
        console.error('Error uploading raw EEG data:', err);
        res.status(500).json({ error: 'Failed to upload raw EEG data' });
    }
});

const radToDeg = (radians) => {
    return radians * (180 / Math.PI);
};

router.get('/:lifeId/update-brainwave-phase', authenticateToken, verifyLifeId, async (req, res) => {
    const { format } = req.query; // 'json' or 'binary' (query parameter)

    if (!format || !['json', 'binary'].includes(format)) {
        return res.status(400).json({ error: 'Invalid format. Must be "json" or "binary".' });
    }

    try {
        const life = req.life; // Validated by middleware

        // Fetch the latest raw EEG data based on the format (using .findAll() for fetching multiple records)
        const latestEEGData = await LifeBrainwave.findAll({
            where: { lifeId: life.lifeId },
            order: [['timestamp', 'DESC']], // Ensure the latest entry comes first
            limit: 1,  // Only retrieve the most recent EEG data
            attributes: ['rawEEGJSON', 'rawEEGBinary', 'timestamp']
        });

        if (!latestEEGData || latestEEGData.length === 0) {
            return res.status(404).json({ error: 'No EEG data found for this Life' });
        }

        const rawEEGData = format === 'json' ? latestEEGData[0].rawEEGJSON : latestEEGData[0].rawEEGBinary;

        if (!rawEEGData) {
            return res.status(404).json({ error: `No raw EEG data found for the requested format: ${format}` });
        }

        // Perform FFT on the raw EEG data (assuming rawEEGData is in the correct format)
        const phasors = fft(rawEEGData);  // Perform FFT to get frequency-domain representation

        // Calculate the phase from the FFT results (using atan2 on real and imaginary parts)
        const phases = phasors.map(phasor => {
            const real = phasor[0];   // Real part
            const imaginary = phasor[1]; // Imaginary part
            return Math.atan2(imaginary, real); // Phase in radians
        });

        // Convert phase values from radians to degrees
        const phaseDegrees = phases.map(radToDeg); // Convert all phase values to degrees

        // Define frequency ranges for each band
        const bandFrequencies = {
            delta: [0.5, 4],
            theta: [4, 8],
            alpha: [8, 12],
            beta: [12, 30],
            gamma: [30, 100]
        };

        const getBandPhase = (phaseDegrees, bandRange) => {
            const lowFreqIndex = Math.floor(bandRange[0] * phasors.length / 100); // Calculate index for low frequency
            const highFreqIndex = Math.floor(bandRange[1] * phasors.length / 100); // Calculate index for high frequency
            let bandPhase = 0;
            let count = 0;

            for (let i = lowFreqIndex; i <= highFreqIndex; i++) {
                bandPhase += phaseDegrees[i];
                count++;
            }

            return count > 0 ? bandPhase / count : 0;
        };

        // Calculate the phase for each band
        const phase = {
            delta: getBandPhase(phaseDegrees, bandFrequencies.delta),
            theta: getBandPhase(phaseDegrees, bandFrequencies.theta),
            alpha: getBandPhase(phaseDegrees, bandFrequencies.alpha),
            beta: getBandPhase(phaseDegrees, bandFrequencies.beta),
            gamma: getBandPhase(phaseDegrees, bandFrequencies.gamma)
        };

        // Frequency-weighted phase calculation
        const weights = {
            delta: 1,
            theta: 1,
            alpha: 1,
            beta: 1,
            gamma: 1
        };

        const calculateFrequencyWeightedPhase = (phase, weights) => {
            const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
            const weightedSum = Object.keys(phase).reduce(
                (sum, band) => sum + phase[band] * weights[band],
                0
            );
            return weightedSum / totalWeight;
        };

        const frequencyWeightedPhase = calculateFrequencyWeightedPhase(phase, weights);

        // Log the phase and frequency-weighted phase in the database
        const newLifeBrainwavePhase = await LifeBrainwave.create({
            lifeId: life.lifeId,
            phaseDelta: phase.delta,
            phaseTheta: phase.theta,
            phaseAlpha: phase.alpha,
            phaseBeta: phase.beta,
            phaseGamma: phase.gamma,
            frequencyWeightedPhase,
            timestamp: new Date()
        });

        res.status(200).json({
            message: 'Brainwave phase calculated and logged successfully',
            phase,
            frequencyWeightedPhase,
            lifeBrainwave: newLifeBrainwavePhase
        });
    } catch (err) {
        console.error('Error updating brainwave phase:', err);
        res.status(500).json({ error: 'Failed to update brainwave phase' });
    }
});

// Helper function to decode the binary data
function decodeBinaryData(binaryBuffer) {
    const numSamples = binaryBuffer.length / 2; // 2 bytes per 16-bit sample
    const rawEEGArray = [];

    // Iterate through the buffer, converting every 2 bytes into a 16-bit integer
    for (let i = 0; i < numSamples; i++) {
        const sample = binaryBuffer.readInt16LE(i * 2); // Read 16-bit integer in little-endian format
        rawEEGArray.push(sample);
    }

    return rawEEGArray;
}

// GET: Calculate and return the brainwave bandpower for a Life (calculates from raw EEG data)
router.get('/:lifeId/calculate-brainwave-bandpower', authenticateToken, verifyLifeId, async (req, res) => {
    const { lifeId } = req.params;

    try {
        // Fetch the latest raw EEG data for the lifeId (raw EEG JSON or binary)
        const lifeBrainwaveEntries = await LifeBrainwave.findAll({
            where: { lifeId },
            order: [['timestamp', 'DESC']], // Sort by timestamp in descending order (most recent first)
            limit: 1 // Only get the most recent entry
        });

        if (lifeBrainwaveEntries.length === 0) {
            return res.status(404).json({ error: 'No raw EEG data found for the given lifeId' });
        }

        // Get the most recent entry
        const lifeBrainwave = lifeBrainwaveEntries[0];

        const rawEEGData = lifeBrainwave.rawEEGJSON || lifeBrainwave.rawEEGBinary;
        if (!rawEEGData) {
            return res.status(400).json({ error: 'Raw EEG data is missing or invalid' });
        }

        // Check if the data is JSON or Binary, and parse accordingly
        let rawEEGArray;

        // If rawEEGJSON, parse it as JSON
        if (lifeBrainwave.rawEEGJSON) {
            try {
                rawEEGArray = JSON.parse(lifeBrainwave.rawEEGJSON);
            } catch (error) {
                return res.status(400).json({ error: 'Invalid JSON format in rawEEGJSON field' });
            }
        }
        // If rawEEGBinary, decode as binary (assuming it's stored in a base64 format for example)
        else if (lifeBrainwave.rawEEGBinary) {
            try {
                const decodedData = Buffer.from(lifeBrainwave.rawEEGBinary, 'base64');
                // Decode the binary data into raw EEG array
                rawEEGArray = decodeBinaryData(decodedData); // Directly use the decodeBinaryData function
            } catch (error) {
                return res.status(400).json({ error: 'Invalid binary data format in rawEEGBinary field' });
            }
        }

        // FFT Calculation using fft-js
        const fft = new FFT(1024); // Adjust FFT size as needed
        const fftResults = fft.createComplexArray();
        fft.realTransform(fftResults, rawEEGArray);  // Perform FFT on the raw EEG array

        // Calculate magnitudes from FFT results
        const magnitudes = fftResults.map(c => Math.sqrt(c[0] * c[0] + c[1] * c[1])); // Magnitude = sqrt(real^2 + imaginary^2)

        // Define the sampling rate (in Hz), which should be provided or inferred from your EEG setup
        const samplingRate = 250;  // Example: 250 Hz, adjust according to your actual sampling rate

        // Calculate the frequencies corresponding to the FFT results
        const frequencies = Array.from({ length: fftResults.length / 2 }, (_, index) => index * samplingRate / fftResults.length);

        // Define frequency bands (in Hz)
        const bands = {
            delta: { min: 0, max: 4 },
            theta: { min: 4, max: 8 },
            alpha: { min: 8, max: 13 },
            beta: { min: 13, max: 30 },
            gamma: { min: 30, max: 100 }
        };

        // Calculate bandpower for each band
        const bandpowers = {};
        let frequencyWeightedBandpower = 0;
        let totalWeight = 0;

        Object.keys(bands).forEach(band => {
            const { min, max } = bands[band];
            let bandPower = 0;

            // Sum the power (squared magnitudes) within the frequency range
            for (let i = 0; i < frequencies.length; i++) {
                if (frequencies[i] >= min && frequencies[i] <= max) {
                    bandPower += magnitudes[i] ** 2;
                }
            }

            // Save bandpower for each band
            bandpowers[band] = bandPower;

            // Frequency weighted bandpower (weight by the bandwidth)
            const weight = max - min;  // Use bandwidth as weight
            frequencyWeightedBandpower += bandPower * weight;
            totalWeight += weight;
        });

        // Normalize the frequency weighted bandpower
        frequencyWeightedBandpower /= totalWeight;

        // Save the calculated bandpower values into the database
        const updatedLifeBrainwave = await LifeBrainwave.create({
            lifeId: lifeId,
            bandpowerDelta: bandpowers.delta,
            bandpowerTheta: bandpowers.theta,
            bandpowerAlpha: bandpowers.alpha,
            bandpowerBeta: bandpowers.beta,
            bandpowerGamma: bandpowers.gamma,
            frequencyWeightedBandpower: frequencyWeightedBandpower,
            timestamp: new Date()
        });

        // Return the calculated bandpower data
        res.status(200).json({
            message: 'Brainwave bandpower calculated and saved successfully',
            lifeBrainwave: updatedLifeBrainwave
        });

    } catch (err) {
        console.error('Error calculating brainwave bandpower:', err);
        res.status(500).json({ error: 'Failed to calculate brainwave bandpower' });
    }
});

// Helper functions for synchronizing timestamps and getting phase differences
function getClosestSchumannResonance(lifeTimestamp, schumannResonances) {
    let closestResonance = null;
    let smallestTimeDiff = Infinity;

    schumannResonances.forEach(resonance => {
        const timeDiff = Math.abs(resonance.timestamp - lifeTimestamp);
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

function calculateInterference(phaseDifference) {
    if (phaseDifference <= 90) {
        return (90 - phaseDifference) / 90; // Constructive interference (0-1 range)
    } else if (phaseDifference <= 180) {
        return (phaseDifference - 90) / 90; // Destructive interference (0-1 range)
    }
    return 0;
}

router.get('/:lifeId/schumann-alignment', authenticateToken, verifyLifeId, async (req, res) => {
    const { lifeId } = req.params;

    try {
        const latestlifeBrainwave = await LifeBrainwave.findOne({
            include: [{
                model: LifeAccount,
                where: { lifeId }
            }],
            order: [['timestamp', 'DESC']]
        });

        if (!latestlifeBrainwave) {
            return res.status(404).json({ error: 'No phase data found for this lifeId' });
        }

        // Filter the phases that are non-null
        const brainwaveBands = ['Alpha', 'Beta', 'Theta', 'Delta', 'Gamma'];
        const validPhases = brainwaveBands.filter(band => latestlifeBrainwave[`phase${band}`] !== null);

        if (validPhases.length === 0) {
            return res.status(404).json({ error: 'No valid phase data found for this lifeId' });
        }

        // Fetch Schumann resonance data
        const schumannResonances = await SchumannResonance.findAll();
        if (!schumannResonances.length) {
            return res.status(404).json({ error: 'No Schumann resonance data found' });
        }

        // Find the closest Schumann resonance timestamp to the life’s timestamp
        const closestSchumann = getClosestSchumannResonance(latestlifeBrainwave.timestamp, schumannResonances);

        // Calculate phase differences and interference for each band
        const interferenceResults = {};

        validPhases.forEach(band => {
            const bandPhase = latestlifeBrainwave[`phase${band}`];
            if (bandPhase !== null) {
                const phaseDifference = calculatePhaseDifference(bandPhase, closestSchumann[`phase${band}`]);
                interferenceResults[band] = {
                    phaseDifference,
                    interference: calculateInterference(phaseDifference),
                };
            }
        });

        // Determine the interference type (constructive or destructive)
        const constructiveInterference = Object.values(interferenceResults)
            .filter(result => result.phaseDifference <= 90)
            .reduce((sum, result) => sum + result.interference, 0);

        const destructiveInterference = Object.values(interferenceResults)
            .filter(result => result.phaseDifference > 90)
            .reduce((sum, result) => sum + result.interference, 0);

        // Log the interference in the LifeBalance table
        const lifeBalanceEntry = await LifeBalance.create({
            lifeId,
            interferenceType: constructiveInterference > destructiveInterference
                ? 'objectiveConstructiveInterference'
                : 'objectiveDestructiveInterference',
            interferenceValue: constructiveInterference > destructiveInterference
                ? constructiveInterference
                : destructiveInterference,
            timestamp: new Date(),
        });

        res.status(200).json({
            message: 'Schumann alignment calculated',
            interferenceResults,
            lifeBalanceEntry,
        });
    } catch (err) {
        console.error('Error in Schumann alignment:', err);
        res.status(500).json({ error: 'Failed to calculate Schumann alignment' });
    }
});

module.exports = router;