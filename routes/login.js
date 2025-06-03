const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const validator = require('validator');
const { LifeAccount } = require('../dataModels/associations.js');
const router = express.Router();

// --- START MAILGUN IMPORTS ---
// Use dynamic import for mailgun.js and form-data since this is a CommonJS file
// This avoids issues with mixing CommonJS and ES modules directly at the top.
// We'll call these imports inside the async function.
let FormData;
let Mailgun;
// --- END MAILGUN IMPORTS ---

console.log('Login routes loaded, LifeAccount:', !!LifeAccount);

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY; // Your Mailgun Private API Key (starts with 'key-')
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN; // Your Mailgun domain (e.g., 'yourdomain.com' or 'sandbox.mailgun.org')
const MAILGUN_SENDER_EMAIL = process.env.MAILGUN_SENDER_EMAIL; // The email address you want to send from (e.g., 'no-reply@yourdomain.com')
const MAILGUN_SENDER_NAME = process.env.MAILGUN_SENDER_NAME; // The name associated with the sender email
const MAILGUN_API_URL = process.env.MAILGUN_API_URL || 'https://api.mailgun.net'; // For EU domains, use 'https://api.eu.mailgun.net'

const generateSecurePasscode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

router.post('/send-passcode', async (req, res) => {
    console.log('Received POST to /send-passcode:', req.body);

    // --- START MAILGUN CONFIG LOGGING ---
    console.log('Mailgun Config:', {
        domain: MAILGUN_DOMAIN || 'Missing',
        senderEmail: MAILGUN_SENDER_EMAIL || 'Missing',
        senderName: MAILGUN_SENDER_NAME || 'Missing',
        apiUrl: MAILGUN_API_URL
    });
    // --- END MAILGUN CONFIG LOGGING ---

    const { email, firstName, lastName } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }
    if (!validator.isEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format.' });
    }
    if (!firstName || !lastName) {
        return res.status(400).json({ error: 'First name and last name are required.' });
    }
    if (!validator.isLength(firstName, { min: 1, max: 50 }) || !validator.isLength(lastName, { min: 1, max: 50 })) {
        return res.status(400).json({ error: 'Names must be 1-50 characters.' });
    }

    // --- START MAILGUN ENVIRONMENT VARIABLE CHECKS ---
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !MAILGUN_SENDER_EMAIL || !MAILGUN_SENDER_NAME) {
        console.error('Mailgun configuration missing:', {
            apiKey: !!MAILGUN_API_KEY,
            domain: !!MAILGUN_DOMAIN,
            senderEmail: !!MAILGUN_SENDER_EMAIL,
            senderName: !!MAILGUN_SENDER_NAME
        });
        return res.status(500).json({ error: 'Server configuration error: Mailgun credentials missing.' });
    }
    if (!validator.isEmail(MAILGUN_SENDER_EMAIL)) {
        console.error('Invalid Mailgun sender email:', MAILGUN_SENDER_EMAIL);
        return res.status(500).json({ error: 'Invalid sender email configuration for Mailgun.' });
    }
    // --- END MAILGUN ENVIRONMENT VARIABLE CHECKS ---

    try {
        let life = await LifeAccount.findOne({ where: { email } });
        if (!life) {
            life = await LifeAccount.create({
                email,
                firstName,
                lastName,
                registered: false,
                timestamp: new Date()
            });
            console.log('Created new LifeAccount for:', email);
        }

        const passcode = generateSecurePasscode();
        const hashedPasscode = await bcrypt.hash(passcode, 10);
        const expiration = new Date(Date.now() + 10 * 60 * 1000);

        life.passcode = hashedPasscode;
        life.passcodeExpiration = expiration;
        await life.save();

        // --- START MAILGUN INTEGRATION ---
        // Dynamically import mailgun.js and form-data here because `require` does not support `import` for modules
        if (!FormData) {
            FormData = (await import('form-data')).default;
        }
        if (!Mailgun) {
            Mailgun = (await import('mailgun.js')).default;
        }

        const mailgun = new Mailgun(FormData);
        const mg = mailgun.client({
            username: 'api',
            key: MAILGUN_API_KEY,
            url: MAILGUN_API_URL // Use the environment variable for URL
        });

        const mailgunMessageData = {
            from: `"${MAILGUN_SENDER_NAME}" <${MAILGUN_SENDER_EMAIL}>`,
            to: life.email, // Recipient from the user's input
            subject: 'Your Brainwave Interference Protocol Login Passcode',
            text: `Your passcode is: ${passcode}\n\nIt will expire in 10 minutes.`,
            // html: '<h1>Your HTML content here</h1>' // Optional: if you want to send HTML
        };

        console.log('Mailgun message options:', {
            from: mailgunMessageData.from,
            to: mailgunMessageData.to,
            subject: mailgunMessageData.subject,
            domain: MAILGUN_DOMAIN
        });

        try {
            // Use mg.messages.create with your Mailgun domain
            const info = await mg.messages.create(MAILGUN_DOMAIN, mailgunMessageData);
            console.log('Mailgun API response:', info);
        } catch (emailErr) {
            console.error('Mailgun API error:', {
                message: emailErr.message,
                status: emailErr.status, // Mailgun errors often include a status code
                details: emailErr.details, // And sometimes details
                type: emailErr.type // And type
            });
            return res.status(500).json({
                error: 'Failed to send email.',
                details: emailErr.message || 'Mailgun API error'
            });
        }
        // --- END MAILGUN INTEGRATION ---

        res.status(200).json({ message: 'Passcode sent to email.' });
    } catch (err) {
        console.error('Send passcode error:', err.message, err.stack);
        res.status(500).json({ error: 'Failed to send passcode.', details: err.message });
    }
});

router.post('/login', async (req, res) => {
    const { email, passcode } = req.body;

    console.log('Received POST to /login:', { email, passcode });

    try {
        if (!email || !passcode) {
            console.error('Missing email or passcode:', { email, passcode });
            return res.status(400).json({ error: 'Email and passcode are required.' });
        }

        if (!validator.isEmail(email)) {
            console.error('Invalid email format:', email);
            return res.status(400).json({ error: 'Invalid email format.' });
        }

        if (!/^\d{6}$/.test(passcode)) {
            console.error('Invalid passcode format:', passcode);
            return res.status(400).json({ error: 'Passcode must be a 6-digit number.' });
        }

        console.log('Querying LifeAccount for:', email);
        const life = await LifeAccount.findOne({ where: { email } });
        if (!life) {
            console.error('User not found for email:', email);
            return res.status(404).json({ error: 'User not found.' });
        }

        console.log('LifeAccount found:', {
            lifeId: life.lifeId,
            email: life.email,
            registered: life.registered,
            passcodeExists: !!life.passcode,
            expiration: life.passcodeExpiration ? life.passcodeExpiration.toISOString() : null
        });

        if (!life.lifeId || !life.email) {
            console.error('LifeAccount missing lifeId or email:', { lifeId: life.lifeId, email: life.email });
            return res.status(500).json({ error: 'Server error: invalid user data' });
        }

        if (!life.passcode || !life.passcodeExpiration) {
            console.error('No passcode or expiration for:', email);
            return res.status(401).json({ error: 'Passcode not generated or expired.' });
        }

        console.log('Comparing passcode for:', email);
        const isMatch = await bcrypt.compare(passcode, life.passcode);
        if (!isMatch) {
            console.error('Invalid passcode for:', email);
            return res.status(401).json({ error: 'Invalid passcode.' });
        }

        const currentTime = new Date();
        const expirationTime = new Date(life.passcodeExpiration);
        console.log('Checking passcode expiration:', {
            currentTime: currentTime.toISOString(),
            expirationTime: expirationTime.toISOString()
        });
        if (currentTime > expirationTime) {
            console.error('Passcode expired for:', email);
            return res.status(401).json({ error: 'Passcode has expired.' });
        }

        if (!life.registered) {
            console.log('New user, registering:', email);
            life.registered = true;
            life.passcode = null;
            life.passcodeExpiration = null;

            try {
                console.log('Saving LifeAccount for:', email);
                await life.save();
                console.log('User saved successfully for:', email);
            } catch (saveErr) {
                console.error('Failed to save LifeAccount:', {
                    message: saveErr.message,
                    stack: saveErr.stack
                });
                return res.status(500).json({ error: 'Failed to save user data.', details: saveErr.message });
            }

            console.log('Sending account claimed response for:', email);
            return res.status(200).json({
                message: 'Account claimed successfully. You can now log in.',
                lifeId: life.lifeId,
            });
        }

        console.log('Generating JWT for:', email);
        try {
            if (!process.env.JWT_SECRET_KEY) {
                console.error('JWT_SECRET_KEY is missing in .env');
                return res.status(500).json({ error: 'Server configuration error.' });
            }
            const token = jwt.sign(
                { lifeId: life.lifeId, email: life.email },
                process.env.JWT_SECRET_KEY,
                { expiresIn: '1y' }
            );

            console.log('Generated token with payload:', { lifeId: life.lifeId, email: life.email });

            console.log('Clearing passcode for:', email);
            life.passcode = null;
            life.passcodeExpiration = null;
            await life.save();

            console.log('Login successful for:', email);
            return res.status(200).json({
                message: 'Login successful',
                token,
                lifeId: life.lifeId
            });
        } catch (jwtErr) {
            console.error('JWT generation failed:', {
                message: jwtErr.message,
                stack: jwtErr.stack
            });
            return res.status(500).json({ error: 'Failed to generate token.', details: jwtErr.message });
        }
    } catch (err) {
        console.error('Login error:', {
            message: err.message,
            stack: err.stack,
            name: err.name,
            requestBody: { email, passcode }
        });
        return res.status(500).json({ error: 'Failed to login.', details: err.message });
    }
});

module.exports = router;

// const express = require('express');
// const jwt = require('jsonwebtoken');
// const tf = require('@tensorflow/tfjs-node');
// const { LifeAccount } = require('../dataModels/lifeAccount.js');
// const LifeBrainwave = require('../dataModels/lifeBrainwave.js');
// const router = express.Router();
//
// // Constants
// const SPEED_OF_LIGHT = 299792458; // m/s
// const SAMPLING_RATE = 256; // Hz
// const EARTH_RADIUS = 6371000; // meters
// const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'your-secret-key';
//
// // ELF Receiver class
// class ELFReceiver {
//     constructor(id, lat, lon) {
//         this.id = id;
//         this.position = { lat, lon }; // Degrees
//     }
//
//     receiveBrainwave(brainwave, timeDelay) {
//         return { receiverId: this.id, brainwave, timeDelay };
//     }
// }
//
// // Real receiver network (example coordinates)
// const receivers = [
//     new ELFReceiver('R1', 40.7128, -74.0060), // New York
//     new ELFReceiver('R2', 34.0522, -118.2437), // Los Angeles
//     new ELFReceiver('R3', 51.5074, -0.1278), // London
// ];
//
// // Convert degrees to radians
// const toRadians = degrees => (degrees * Math.PI) / 180;
//
// // Haversine formula for distance calculation
// const haversineDistance = (lat1, lon1, lat2, lon2) => {
//     const dLat = toRadians(lat2 - lat1);
//     const dLon = toRadians(lon2 - lon1);
//     const a =
//         Math.sin(dLat / 2) ** 2 +
//         Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//     return EARTH_RADIUS * c;
// };
//
// // TDOA-based location estimation
// const calculateTDOALocation = receivedBrainwaves => {
//     if (receivedBrainwaves.length < 3) throw new Error('Need at least 3 receivers');
//
//     const ref = receivedBrainwaves[0];
//     const refPos = receivers.find(r => r.id === ref.receiverId).position;
//
//     let weightedLatSum = refPos.lat;
//     let weightedLonSum = refPos.lon;
//     let weightSum = 1;
//
//     receivedBrainwaves.slice(1).forEach(brainwave => {
//         const pos = receivers.find(r => r.id === brainwave.receiverId).position;
//         const distance = haversineDistance(refPos.lat, refPos.lon, pos.lat, pos.lon);
//         const deltaDist = brainwave.timeDelay * SPEED_OF_LIGHT;
//         const weight = 1 / Math.max(Math.abs(deltaDist), 1);
//
//         console.log(`Receiver: ${brainwave.receiverId}, Distance: ${distance}m, Time Delay: ${brainwave.timeDelay}s`);
//
//         weightedLatSum += pos.lat * weight;
//         weightedLonSum += pos.lon * weight;
//         weightSum += weight;
//     });
//
//     return {
//         lat: weightedLatSum / weightSum,
//         lon: weightedLonSum / weightSum,
//     };
// };
//
// // Compute FFT and extract magnitude
// const computeFFT = eegData => {
//     const brainwave = tf.tensor1d(eegData);
//     const fftResult = tf.spectral.fft(brainwave);  // Perform FFT
//     const magnitude = fftResult.abs();  // Get the magnitude (real + imaginary)
//
//     // Return the magnitude as a regular JavaScript array
//     return magnitude.arraySync();  // Convert to array
// };
//
// // Extracting peak amplitude data
// const extractAmplitudePeaks = eegData => {
//     const fftData = computeFFT(eegData); // Compute FFT
//
//     // Check if fftData is an array, and then proceed with map
//     if (Array.isArray(fftData)) {
//         const threshold = Math.max(...fftData) * 0.6;
//
//         return fftData.map((amp, idx) => (amp > threshold ? { frequency: idx, amplitude: amp } : null))
//             .filter(point => point);  // Filter out null values
//     } else {
//         console.error('Error: FFT data is not an array!');
//         return [];
//     }
// };
//
// // Normalize EEG data for DNN
// const prepareDNNInput = peaks => {
//     const amplitudes = peaks.map(p => p.amplitude);
//     const maxAmp = Math.max(...amplitudes, 1);
//     const normalized = amplitudes.map(a => a / maxAmp).slice(0, 100);
//
//     while (normalized.length < 100) {
//         normalized.push(0);
//     }
//
//     return tf.tensor2d([normalized]);
// };
//
// // Initialize/update DNN model
// let dnnModel;
// const initializeOrUpdateDNN = async () => {
//     const users = await LifeAccount.findAll({ attributes: ['lifeId'] });
//     const numClasses = users.length || 1;
//
//     if (!dnnModel || dnnModel.layers[dnnModel.layers.length - 1].getConfig().units !== numClasses) {
//         dnnModel = tf.sequential();
//         dnnModel.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [100] }));
//         dnnModel.add(tf.layers.dropout({ rate: 0.2 }));
//         dnnModel.add(tf.layers.dense({ units: 32, activation: 'relu' }));
//         dnnModel.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));
//         dnnModel.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
//
//         try {
//             const loadedModel = await tf.loadLayersModel('file://./brainwave_model/model.json');
//             const lastLayer = loadedModel.layers[loadedModel.layers.length - 1];
//             const units = lastLayer.getConfig().units;  // Access the 'units' config
//             if (units === numClasses) {
//                 dnnModel = loadedModel;
//             }
//         } catch {
//             console.log('No pre-trained model found. Starting fresh.');
//         }
//     }
// };
//
// const trainDNNWithNewUser = async (lifeId, eegData) => {
//     if (!lifeId) {
//         throw new Error('Missing lifeId');
//     }
//
//     await initializeOrUpdateDNN();
//     const peaks = extractAmplitudePeaks(eegData);
//     const input = prepareDNNInput(peaks);
//
//     const users = await LifeAccount.findAll({ attributes: ['lifeId'] });
//
//     if (!users.length) {
//         throw new Error('No users found in the database');
//     }
//
//     const userIndex = users.findIndex(user => user.lifeId === lifeId);
//
//     if (userIndex === -1) {
//         throw new Error(`lifeId "${lifeId}" not found`);
//     }
//
//     const oneHot = new Array(users.length).fill(0);
//     oneHot[userIndex] = 1;
//
//     await dnnModel.fit(input, tf.tensor2d([oneHot]), { epochs: 10, batchSize: 1 });
//     await dnnModel.save('file://./brainwave_model');
// };
//
// // Function to extract amplitude values along with timestamps
// function extractAmplitudeWithTimestamps(eegBrainwave) {
//     const samplingRate = 256; // Example EEG sampling rate (Hz)
//     const startTime = Date.now();
//
//     return eegBrainwave.map((amplitude, index) => ({
//         timestamp: startTime + (index * (1000 / samplingRate)), // Convert index to milliseconds
//         amplitude: amplitude
//     }));
// }
//
// // Route to authenticate a Life account
// router.post('/authenticate', async (req, res) => {
//     try {
//         // Generate received brainwaves using receiveBrainwave()
//         const receivedBrainwaves = receivers.map(receiver =>
//             receiver.receiveBrainwave('brainwave-brainwave', Math.random() * 0.002)
//         );
//
//         if (receivedBrainwaves.length < 3) {
//             return res.status(400).json({ error: 'Insufficient ELF receiver data' });
//         }
//
//         // Estimate location
//         const location = calculateTDOALocation(receivedBrainwaves);
//
//         // Determine strongest brainwave (lowest time delay)
//         const strongestBrainwave = receivedBrainwaves.reduce((prev, curr) =>
//             prev.timeDelay < curr.timeDelay ? prev : curr
//         ).brainwave;
//
//         // Generate a unique lifeId
//         const lifeId = `life_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
//
//         // Create new LifeAccount entry
//         await LifeAccount.create({ lifeId, registered: true });
//
//         // Extract amplitude peaks along with timestamps
//         const amplitudeData = extractAmplitudeWithTimestamps(strongestBrainwave);
//
//         // Convert to JSON format
//         const amplitudeJSON = JSON.stringify(amplitudeData);
//
//         // Save amplitude data to LifeBrainwave table
//         await LifeBrainwave.create({
//             lifeId,
//             rawEEGJSON: amplitudeJSON,
//             timestamp: new Date(),
//         });
//
//         // Train DNN model with the new user data
//         await trainDNNWithNewUser(lifeId, strongestBrainwave);
//
//         // Generate JWT token
//         const token = jwt.sign({ lifeId }, JWT_SECRET_KEY, { expiresIn: '7d' });
//
//         res.status(201).json({ lifeId, token, location, rawEEGJSON: amplitudeJSON });
//     } catch (error) {
//         console.error('Error in /authenticate:', error);
//         res.status(500).json({ error: 'Server error' });
//     }
// });
//
// module.exports = router;