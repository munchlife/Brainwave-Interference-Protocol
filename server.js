// server.js
const fs = require('fs');
const https = require('https');
const http = require('http');
const app = require('./app');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Configuration for SSL certificates (for production)
let server;

if (process.env.NODE_ENV === 'production') {
    // In production, use HTTPS
    const privateKey = fs.readFileSync('path/to/key.pem', 'utf8');
    const certificate = fs.readFileSync('path/to/cert.pem', 'utf8');
    const ca = fs.readFileSync('path/to/ca.pem', 'utf8'); // Optional, if using a certificate chain

    const credentials = { key: privateKey, cert: certificate, ca: ca };

    // Create the HTTPS server
    server = https.createServer(credentials, app);
    console.log('Server is running on HTTPS');
} else {
    // In development, use HTTP
    server = http.createServer(app);
    console.log('Server is running on HTTP');
}

// Port configuration (can be defined in .env)
const PORT = process.env.PORT || 3000;

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});