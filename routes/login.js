const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Life } = require('../dataModels/life.js'); // Assuming you have the Life model for the users
const router = express.Router();

// Email setup (configure your email provider and credentials)
const transporter = nodemailer.createTransport({
    service: 'gmail', // Example: 'gmail', change according to your provider
    auth: {
        user: process.env.EMAIL_USER,  // Email account username
        pass: process.env.EMAIL_PASS   // Email account password (or app-specific password)
    }
});

// JWT Secret Key for signing (store securely in environment variables)
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'your-secret-key';

// POST: Request a passcode
router.post('/request-passcode', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        // Check if user exists in the database
        const user = await Life.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate a 4-digit passcode
        const passcode = crypto.randomInt(1000, 10000); // Random 4-digit passcode

        // Set expiration time (e.g., 5 minutes from now)
        const expirationTime = new Date();
        expirationTime.setMinutes(expirationTime.getMinutes() + 5); // 5 minutes expiry

        // Hash the passcode before storing it and save to user
        user.passcode = await bcrypt.hash(passcode.toString(), 10);
        user.passcodeExpiration = expirationTime;
        await user.save();

        // Send the passcode to the user's email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your 4-Digit Passcode',
            text: `Your 4-digit passcode is: ${passcode}`
        };

        // Send email
        transporter.sendMail(mailOptions, (error) => {
            if (error) {
                return res.status(500).json({ error: 'Failed to send email' });
            }
            res.status(200).json({ message: 'Passcode sent to email' });
        });

    } catch (err) {
        console.error('Error requesting passcode:', err);
        res.status(500).json({ error: 'Failed to request passcode' });
    }
});

// POST: Login with email and passcode
router.post('/login', async (req, res) => {
    const { email, passcode } = req.body; // User provides email and passcode

    if (!email || !passcode) {
        return res.status(400).json({ error: 'Email and passcode are required.' });
    }

    try {
        // Find user by email
        const user = await Life.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if the passcode matches and if it's expired
        if (!user.passcode || !user.passcodeExpiration) {
            return res.status(401).json({ error: 'Passcode not generated or expired.' });
        }

        // Compare the provided passcode with the stored hashed passcode
        const isMatch = await bcrypt.compare(passcode, user.passcode);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid passcode' });
        }

        // Check if passcode is expired
        const currentTime = new Date();
        if (currentTime > new Date(user.passcodeExpiration)) {
            return res.status(401).json({ error: 'Passcode has expired' });
        }

        // Create JWT token that lasts for 1 year
        const token = jwt.sign(
            { lifeId: user.lifeId, email: user.email },  // Payload
            JWT_SECRET_KEY,  // Secret key for signing
            { expiresIn: '1y' } // Session lasts for 1 year
        );

        // Optionally, clear passcode after successful login for security
        user.passcode = null;
        user.passcodeExpiration = null;
        await user.save();

        // Respond with the generated JWT token
        res.status(200).json({
            message: 'Login successful',
            token
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;