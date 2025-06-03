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