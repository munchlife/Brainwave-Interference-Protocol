// const express = require('express');
// const crypto = require('crypto');
// const nodemailer = require('nodemailer');
// const jwt = require('jsonwebtoken');
// const bcrypt = require('bcrypt');
// const { LifeAccount } = require('../dataModels/lifeAccount.js');
// const router = express.Router();

const express = require('express');
const jwt = require('jsonwebtoken');
const tf = require('@tensorflow/tfjs-node');
const { LifeAccount } = require('../dataModels/lifeAccount.js');
const LifeBrainwave = require('../dataModels/lifeBrainwave.js');
const router = express.Router();

// Constants
const SPEED_OF_LIGHT = 299792458; // m/s
const SAMPLING_RATE = 256; // Hz
const EARTH_RADIUS = 6371000; // meters
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'your-secret-key';

// ELF Receiver class
class ELFReceiver {
    constructor(id, lat, lon) {
        this.id = id;
        this.position = { lat, lon }; // Degrees
    }

    receiveBrainwave(brainwave, timeDelay) {
        return { receiverId: this.id, brainwave, timeDelay };
    }
}

// Real receiver network (example coordinates)
const receivers = [
    new ELFReceiver('R1', 40.7128, -74.0060), // New York
    new ELFReceiver('R2', 34.0522, -118.2437), // Los Angeles
    new ELFReceiver('R3', 51.5074, -0.1278), // London
];

// Convert degrees to radians
const toRadians = degrees => (degrees * Math.PI) / 180;

// Haversine formula for distance calculation
const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS * c;
};

// TDOA-based location estimation
const calculateTDOALocation = receivedBrainwaves => {
    if (receivedBrainwaves.length < 3) throw new Error('Need at least 3 receivers');

    const ref = receivedBrainwaves[0];
    const refPos = receivers.find(r => r.id === ref.receiverId).position;

    let weightedLatSum = refPos.lat;
    let weightedLonSum = refPos.lon;
    let weightSum = 1;

    receivedBrainwaves.slice(1).forEach(brainwave => {
        const pos = receivers.find(r => r.id === brainwave.receiverId).position;
        const distance = haversineDistance(refPos.lat, refPos.lon, pos.lat, pos.lon);
        const deltaDist = brainwave.timeDelay * SPEED_OF_LIGHT;
        const weight = 1 / Math.max(Math.abs(deltaDist), 1);

        console.log(`Receiver: ${brainwave.receiverId}, Distance: ${distance}m, Time Delay: ${brainwave.timeDelay}s`);

        weightedLatSum += pos.lat * weight;
        weightedLonSum += pos.lon * weight;
        weightSum += weight;
    });

    return {
        lat: weightedLatSum / weightSum,
        lon: weightedLonSum / weightSum,
    };
};

// Compute FFT and extract magnitude
const computeFFT = eegData => {
    const brainwave = tf.tensor1d(eegData);
    const fftResult = tf.spectral.fft(brainwave);  // Perform FFT
    const magnitude = fftResult.abs();  // Get the magnitude (real + imaginary)

    // Return the magnitude as a regular JavaScript array
    return magnitude.arraySync();  // Convert to array
};

// Extracting peak amplitude data
const extractAmplitudePeaks = eegData => {
    const fftData = computeFFT(eegData); // Compute FFT

    // Check if fftData is an array, and then proceed with map
    if (Array.isArray(fftData)) {
        const threshold = Math.max(...fftData) * 0.6;

        return fftData.map((amp, idx) => (amp > threshold ? { frequency: idx, amplitude: amp } : null))
            .filter(point => point);  // Filter out null values
    } else {
        console.error('Error: FFT data is not an array!');
        return [];
    }
};

// Normalize EEG data for DNN
const prepareDNNInput = peaks => {
    const amplitudes = peaks.map(p => p.amplitude);
    const maxAmp = Math.max(...amplitudes, 1);
    const normalized = amplitudes.map(a => a / maxAmp).slice(0, 100);

    while (normalized.length < 100) {
        normalized.push(0);
    }

    return tf.tensor2d([normalized]);
};

// Initialize/update DNN model
let dnnModel;
const initializeOrUpdateDNN = async () => {
    const users = await LifeAccount.findAll({ attributes: ['lifeId'] });
    const numClasses = users.length || 1;

    if (!dnnModel || dnnModel.layers[dnnModel.layers.length - 1].getConfig().units !== numClasses) {
        dnnModel = tf.sequential();
        dnnModel.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [100] }));
        dnnModel.add(tf.layers.dropout({ rate: 0.2 }));
        dnnModel.add(tf.layers.dense({ units: 32, activation: 'relu' }));
        dnnModel.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));
        dnnModel.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

        try {
            const loadedModel = await tf.loadLayersModel('file://./brainwave_model/model.json');
            const lastLayer = loadedModel.layers[loadedModel.layers.length - 1];
            const units = lastLayer.getConfig().units;  // Access the 'units' config
            if (units === numClasses) {
                dnnModel = loadedModel;
            }
        } catch {
            console.log('No pre-trained model found. Starting fresh.');
        }
    }
};

const trainDNNWithNewUser = async (lifeId, eegData) => {
    if (!lifeId) {
        throw new Error('Missing lifeId');
    }

    await initializeOrUpdateDNN();
    const peaks = extractAmplitudePeaks(eegData);
    const input = prepareDNNInput(peaks);

    const users = await LifeAccount.findAll({ attributes: ['lifeId'] });

    if (!users.length) {
        throw new Error('No users found in the database');
    }

    const userIndex = users.findIndex(user => user.lifeId === lifeId);

    if (userIndex === -1) {
        throw new Error(`lifeId "${lifeId}" not found`);
    }

    const oneHot = new Array(users.length).fill(0);
    oneHot[userIndex] = 1;

    await dnnModel.fit(input, tf.tensor2d([oneHot]), { epochs: 10, batchSize: 1 });
    await dnnModel.save('file://./brainwave_model');
};

// Function to extract amplitude values along with timestamps
function extractAmplitudeWithTimestamps(eegBrainwave) {
    const samplingRate = 256; // Example EEG sampling rate (Hz)
    const startTime = Date.now();

    return eegBrainwave.map((amplitude, index) => ({
        timestamp: startTime + (index * (1000 / samplingRate)), // Convert index to milliseconds
        amplitude: amplitude
    }));
}

// Route to authenticate a Life account
router.post('/authenticate', async (req, res) => {
    try {
        // Generate received brainwaves using receiveBrainwave()
        const receivedBrainwaves = receivers.map(receiver =>
            receiver.receiveBrainwave('brainwave-brainwave', Math.random() * 0.002)
        );

        if (receivedBrainwaves.length < 3) {
            return res.status(400).json({ error: 'Insufficient ELF receiver data' });
        }

        // Estimate location
        const location = calculateTDOALocation(receivedBrainwaves);

        // Determine strongest brainwave (lowest time delay)
        const strongestBrainwave = receivedBrainwaves.reduce((prev, curr) =>
            prev.timeDelay < curr.timeDelay ? prev : curr
        ).brainwave;

        // Generate a unique lifeId
        const lifeId = `life_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

        // Create new LifeAccount entry
        await LifeAccount.create({ lifeId, registered: true });

        // Extract amplitude peaks along with timestamps
        const amplitudeData = extractAmplitudeWithTimestamps(strongestBrainwave);

        // Convert to JSON format
        const amplitudeJSON = JSON.stringify(amplitudeData);

        // Save amplitude data to LifeBrainwave table
        await LifeBrainwave.create({
            lifeId,
            rawEEGJSON: amplitudeJSON,
            timestamp: new Date(),
        });

        // Train DNN model with the new user data
        await trainDNNWithNewUser(lifeId, strongestBrainwave);

        // Generate JWT token
        const token = jwt.sign({ lifeId }, JWT_SECRET_KEY, { expiresIn: '7d' });

        res.status(201).json({ lifeId, token, location, rawEEGJSON: amplitudeJSON });
    } catch (error) {
        console.error('Error in /authenticate:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;


// // POST: Create a new Life account
// router.post('/create', async (req, res) => {
//     const { email, firstName, lastName, registered } = req.body;
//
//     try {
//         // Create the life account in the LifeAccount table
//         const newLifeAccount = await LifeAccount.create({
//             email,
//             firstName,
//             lastName,
//             registered: registered || false,
//         });
//
//         // Respond with the created LifeAccount
//         return res.status(201).json(newLifeAccount);
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ error: 'Server error' });
//     }
// });
//
// // Email setup (configure your email provider and credentials)
// const transporter = nodemailer.createTransport({
//     service: 'gmail', // Example: 'gmail', change according to your provider
//     auth: {
//         user: process.env.EMAIL_USER,  // Email account username
//         pass: process.env.EMAIL_PASS   // Email account password (or app-specific password)
//     }
// });
//
// // JWT Secret Key for signing (store securely in environment variables)
// const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'your-secret-key';
//
// router.post('/login', async (req, res) => {
//     const { email, passcode, firstName, lastName } = req.body;
//
//     if (!email || !passcode) {
//         return res.status(400).json({ error: 'Email and passcode are required.' });
//     }
//
//     try {
//         // Ensure email matches the column in the LifeAccount model
//         const user = await LifeAccount.findOne({
//             where: { email } // This assumes 'email' is the correct column name
//         });
//
//         if (!user) {
//             return res.status(404).json({ error: 'User not found' });
//         }
//
//         // Check if passcode is generated and not expired
//         if (!user.passcode || !user.passcodeExpiration) {
//             return res.status(401).json({ error: 'Passcode not generated or expired.' });
//         }
//
//         // Compare the provided passcode with the stored hashed passcode
//         const isMatch = await bcrypt.compare(passcode, user.passcode);
//         if (!isMatch) {
//             return res.status(401).json({ error: 'Invalid passcode' });
//         }
//
//         // Check if passcode is expired
//         const currentTime = new Date();
//         if (currentTime > new Date(user.passcodeExpiration)) {
//             return res.status(401).json({ error: 'Passcode has expired' });
//         }
//
//         // If the account is not registered, allow claiming
//         if (!user.registered) {
//             if (!firstName || !lastName) {
//                 return res.status(400).json({
//                     error: 'First name and last name are required to claim this account.',
//                 });
//             }
//
//             // Update the user's information
//             user.firstName = firstName;
//             user.lastName = lastName;
//             user.registered = true; // Mark the account as registered
//             user.passcode = null; // Clear passcode after claiming
//             user.passcodeExpiration = null;
//             await user.save();
//
//             return res.status(200).json({
//                 message: 'Account claimed successfully. You can now log in.',
//                 lifeId: user.lifeId,
//             });
//         }
//
//         // For registered users, proceed with login
//         const token = jwt.sign(
//             { lifeId: user.lifeId, email: user.email }, // Payload
//             JWT_SECRET_KEY, // Secret key for signing
//             { expiresIn: '1y' } // Token expiry
//         );
//
//         // Clear passcode after successful login for security
//         user.passcode = null;
//         user.passcodeExpiration = null;
//         await user.save();
//
//         res.status(200).json({
//             message: 'Login successful',
//             token,
//         });
//
//     } catch (err) {
//         console.error('Login error:', err);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// });
//
// module.exports = router;