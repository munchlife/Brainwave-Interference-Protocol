const express = require('express');
const router = express.Router();
const LifeAccount = require('../dataModels/lifeAccount.js'); // Life
const LifeBrainwave = require('../dataModels/lifeBrainwave.js');
const LifeBalance = require('../dataModels/lifeBalance.js');
const SchumannResonance = require('../dataModels/schumannResonance.js'); // Life model// model
const fft = require('fft-js').fft;
const FFT = require('fft.js');
const multer = require('multer');
const tf = require('@tensorflow/tfjs-node');
const natural = require('natural');
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
        const life = await LifeAccount.findOne({
            where: { id: req.params.id }
        });

        if (!life) {
            return res.status(404).json({ error: 'Life not found' });
        }

        return res.json(life);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Endpoint to get the latest interference balance for a specific life
router.get('/interference-balance', async (req, res) => {
    try {
        const { lifeId } = req.query; // Expect lifeId in query parameters

        if (!lifeId) {
            return res.status(400).json({ error: 'lifeId is required' });
        }

        // Fetch the latest (most recent) entry for the specified lifeId
        const latestLifeBalanceEntries = await LifeBalance.findAll({
            where: { lifeId },
            order: [['timestamp', 'DESC']], // Order by most recent first
            limit: 1
        });

        // Check if we have a valid entry
        if (latestLifeBalanceEntries.length === 0) {
            return res.status(404).json({ error: 'No data found for the given lifeId' });
        }

        // Extract the latest entry
        const latestEntry = latestLifeBalanceEntries[0];

        // Calculate totals for **Objective** interference
        const totalObjectiveConstructiveInterference = latestEntry.objectiveConstructiveInterference;
        const totalObjectiveDestructiveInterference = latestEntry.objectiveDestructiveInterference;

        // Calculate **net interference balance** for Objective interference
        const netObjectiveInterferenceBalance = totalObjectiveConstructiveInterference - totalObjectiveDestructiveInterference;

        // Calculate totals for **Subjective** interference
        const totalSubjectiveConstructiveInterference = latestEntry.subjectiveConstructiveInterference;
        const totalSubjectiveDestructiveInterference = latestEntry.subjectiveDestructiveInterference;

        // Calculate **net interference balance** for Subjective interference
        const netSubjectiveInterferenceBalance = totalSubjectiveConstructiveInterference - totalSubjectiveDestructiveInterference;

        // Return the calculated totals and net interference balance
        res.status(200).json({
            lifeId,
            totalObjectiveConstructiveInterference,
            totalObjectiveDestructiveInterference,
            netObjectiveInterferenceBalance,
            totalSubjectiveConstructiveInterference,
            totalSubjectiveDestructiveInterference,
            netSubjectiveInterferenceBalance,
            timestamp: latestEntry.timestamp
        });
    } catch (error) {
        console.error('Error in /interference-balance:', error);
        res.status(500).json({ error: 'Server error' });
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
    try {
        const life = req.life; // Validated by middleware

        // Fetch the latest raw EEG data (using .findAll() for fetching multiple records)
        const latestEEGData = await LifeBrainwave.findAll({
            where: { lifeId: life.lifeId },
            order: [['timestamp', 'DESC']], // Ensure the latest entry comes first
            limit: 1,  // Only retrieve the most recent EEG data
            attributes: ['rawEEGJSON', 'timestamp']
        });

        if (!latestEEGData || latestEEGData.length === 0) {
            return res.status(404).json({ error: 'No EEG data found for this Life' });
        }

        // Extract the raw EEG JSON data (since we're only dealing with rawEEGJSON)
        const rawEEGData = latestEEGData[0].rawEEGJSON;

        if (!rawEEGData) {
            return res.status(404).json({ error: 'No raw EEG JSON data found for the requested Life' });
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

// GET: Calculate and return the brainwave bandpower for a Life (calculates from raw EEG data)
router.get('/:lifeId/calculate-brainwave-bandpower', authenticateToken, verifyLifeId, async (req, res) => {
    const { lifeId } = req.params;

    try {
        // Fetch the latest raw EEG data for the lifeId (only rawEEGJSON is considered)
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

        // Directly use rawEEGJSON
        const rawEEGData = lifeBrainwave.rawEEGJSON;
        if (!rawEEGData) {
            return res.status(400).json({ error: 'Raw EEG data (rawEEGJSON) is missing or invalid' });
        }

        let rawEEGArray;

        // Parse the rawEEGJSON into an array
        try {
            rawEEGArray = JSON.parse(rawEEGData);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid JSON format in rawEEGJSON field' });
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

router.get('/:lifeId/schumann-alignment-currency', authenticateToken, verifyLifeId, async (req, res) => {
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
        let frequencyWeightedPhase = 0;
        let totalWeight = 0;

        validPhases.forEach(band => {
            const bandPhase = latestlifeBrainwave[`phase${band}`];
            if (bandPhase !== null) {
                const phaseDifference = calculatePhaseDifference(bandPhase, closestSchumann[`phase${band}`]);
                interferenceResults[band] = {
                    phaseDifference,
                    interference: calculateInterference(phaseDifference),
                };

                // Calculate frequency-weighted phase
                const bandPower = latestlifeBrainwave[`bandpower${band}`]; // Assuming bandpower is available
                const weight = bandPower || 1; // Default to 1 if no bandpower available
                frequencyWeightedPhase += phaseDifference * weight;
                totalWeight += weight;
            }
        });

        // Normalize the frequency weighted phase
        if (totalWeight > 0) {
            frequencyWeightedPhase /= totalWeight;
        }

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
            frequencyWeightedPhase,
            lifeBalanceEntry,
        });
    } catch (err) {
        console.error('Error in Schumann alignment:', err);
        res.status(500).json({ error: 'Failed to calculate Schumann alignment' });
    }
});

const wordnet = new natural.WordNet();

// Route to decode thoughts from latest brainwave data
router.post('/thought-decoder', async (req, res) => {
    try {
        const { lifeId } = req.body; // Expect lifeId in request body

        if (!lifeId) {
            return res.status(400).json({ error: 'lifeId is required' });
        }

        const latestBrainwaveEntries = await LifeBrainwave.findAll({
            where: { lifeId },
            order: [['timestamp', 'DESC']], // Order by most recent first
            limit: 1 // Fetch only the latest entry
        });

        // Extract the latest entry
        const latestBrainwave = latestBrainwaveEntries.length > 0 ? latestBrainwaveEntries[0] : null;

        if (!latestBrainwave || !latestBrainwave.rawEEGJSON) {
            return res.status(404).json({ error: 'No brainwave data found for this lifeId' });
        }

        // Parse rawEEGJSON into amplitude data
        const rawData = JSON.parse(latestBrainwave.rawEEGJSON);

        // Define CNN for spatial-temporal feature extraction
        const cnn = tf.sequential();
        cnn.add(tf.layers.conv2d({
            inputShape: [null, null, 1], // Dynamic shape: [time, channels, depth]
            filters: 32,
            kernelSize: [5, 3],
            activation: 'relu'
        }));
        cnn.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
        cnn.add(tf.layers.conv2d({ filters: 64, kernelSize: [5, 3], activation: 'relu' }));
        cnn.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
        cnn.add(tf.layers.flatten());

        // Define transformer-like layer for sequencing
        const transformer = tf.sequential();
        transformer.add(tf.layers.dense({
            units: 128,
            activation: 'relu',
            inputShape: [null] // Dynamic, inferred from CNN output
        }));
        transformer.add(tf.layers.dense({ units: 64, activation: 'relu' }));

        // Word mapping
        let wordMapping = {};

        // Preprocess data function
        const preprocessData = (rawData) => {
            // rawData: [nChannels][samples] from rawEEGJSON
            return tf.tensor4d([rawData.map(channel =>
                channel.map(sample => [sample])
            )]); // Shape: [1, time, channels, 1]
        };

        // Training function
        const train = async (rawDataSamples, labels) => {
            const uniqueWords = [...new Set(labels)];
            wordMapping = Object.fromEntries(uniqueWords.map((word, i) => [word, i]));
            const yEncoded = labels.map(label => wordMapping[label]);
            const yTensor = tf.oneHot(yEncoded, uniqueWords.length);

            const xTensor = tf.concat(rawDataSamples.map(sample => preprocessData(sample)));

            // Define output layer based on unique labels
            const outputLayer = tf.layers.dense({
                units: uniqueWords.length,
                activation: 'softmax'
            });

            // Build and compile model
            const model = tf.sequential();
            model.add(cnn);
            model.add(transformer);
            model.add(outputLayer);
            model.compile({
                optimizer: 'adam',
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });

            // Train the model
            await model.fit(xTensor, yTensor, {
                epochs: 10,
                batchSize: 32,
                callbacks: {
                    onEpochEnd: (epoch, logs) => console.log(`Epoch ${epoch}: Loss = ${logs.loss}, Acc = ${logs.acc}`)
                }
            });

            return model;
        };

        // Predict function
        const predict = (rawData, model) => {
            const xTensor = preprocessData(rawData);
            const preds = model.predict(xTensor);
            const predIndices = preds.argMax(-1).dataSync();

            const inverseMapping = Object.fromEntries(
                Object.entries(wordMapping).map(([k, v]) => [v, k])
            );

            return inverseMapping[predIndices[0]];
        };

        // Check word in WordNet (without redundant variable)
        const getWordFromWordNet = async (word) => {
            return new Promise((resolve, reject) => {
                wordnet.lookup(word, function(results) {
                    if (results && results.length > 0) {
                        resolve(word);  // Return word if found
                    } else {
                        reject('Word not found in WordNet');
                    }
                });
            });
        };

        // Process and predict function
        const processAndPredict = async (rawData, model) => {
            const predictedWord = predict(rawData, model);
            try {
                await getWordFromWordNet(predictedWord); // Directly handle word lookup
                return { predictedWord }; // If found, return the predicted word
            } catch (error) {
                return { predictedWord: 'unknown' }; // If not found, return default value
            }
        };

        // Minimal training with current data (placeholder)
        const rawDataSamples = [rawData];
        const labels = ["unknown"]; // Replace with real training data in production
        const model = await train(rawDataSamples, labels);

        // Decode the thought
        const { predictedWord } = await processAndPredict(rawData, model);

        // Update LifeBrainwave with decoded thought
        await latestBrainwave.update({ thoughtWord: predictedWord });

        res.status(200).json({
            lifeId,
            thoughtWord: predictedWord,
            timestamp: latestBrainwave.timestamp
        });
    } catch (error) {
        console.error('Error in /thought-decoder:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;