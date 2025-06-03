// websocketHandler.js

const WebSocket = require('ws');
const jwt = require('jsonwebtoken'); // Import jsonwebtoken for token verification
const url = require('url'); // Node.js built-in module for URL parsing

const { calculateEEGMetricsAndStore } = require('./brainwaveMetrics');
const { highPassFilter } = require('./signalProcessing');

// Configuration for EEG processing windows
const FFT_WINDOW_DURATION_SEC = 1; // 1 second window for FFT
const WINDOW_OVERLAP_DURATION_SEC = 0.25; // Slide window by 0.25 seconds (75% overlap)

// Define the high-pass filter cutoff frequency (in Hz)
const HIGHPASS_CUTOFF_FREQ_HZ = 0.5; // Example: 0.5 Hz

// Define which channels to process.
const ALLOWED_CHANNELS = ['AF7', 'AF8'];

// In-memory buffers for raw EEG data
const RAW_EEG_BUFFERS = new Map();

/**
 * Initializes the WebSocket server and handles incoming EEG data streams.
 * @param {object} server - The HTTP server instance to attach the WebSocket server to.
 */
function initWebSocketServer(server) {
    // Attach WebSocket server to the HTTP server
    const wss = new WebSocket.Server({
        server,
        // The 'verifyClient' function is used for authentication during the WebSocket handshake.
        // `info` contains `req` (http.IncomingMessage) and `origin`.
        // `done` is a callback: done(boolean `authorized`, number `code`, string `message`)
        verifyClient: (info, done) => {
            console.log('\n--- [Server WS - Handshake] Initiated ---');
            console.log('[Server WS - Handshake] Request URL:', info.req.url);
            // console.log('[Server WS - Handshake] Request Headers:', info.req.headers); // Uncomment for verbose header debugging

            const parsedUrl = url.parse(info.req.url, true);
            const token = parsedUrl.query.token; // Expect token as a query parameter: ws://localhost:3000/?token=YOUR_JWT

            if (!token) {
                console.warn('[Server WS - Handshake] REJECTED: No token provided in URL query.');
                done(false, 401, 'Unauthorized: No token provided'); // Reject connection
                return;
            }

            try {
                // Verify the token using your JWT_SECRET_KEY from environment variables
                const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
                console.log('[Server WS - Handshake] SUCCESS: Token verified. Decoded lifeId:', decoded.lifeId);

                // Attach the decoded lifeId to the request object so it can be accessed
                // in the 'connection' event handler later.
                info.req.lifeId = decoded.lifeId;
                done(true); // Allow connection
            } catch (err) {
                console.error('[Server WS - Handshake] REJECTED: Invalid token.', err.message);
                console.error('[Server WS - Handshake] Token verification error details:', err); // Log full error object for detailed debug
                done(false, 403, 'Forbidden: Invalid token'); // Reject connection
            }
            console.log('--- [Server WS - Handshake] Completed (verifyClient) ---');
        }
    });

    wss.on('connection', (ws, req) => {
        // req.lifeId was set by the verifyClient function after successful token verification
        ws.lifeId = req.lifeId; // Store lifeId directly on the WebSocket connection object
        console.log(`\n--- [Server WS] Client Connected ---`);
        console.log(`[Server WS] Authenticated Client Life ID: ${ws.lifeId}`);

        ws.on('message', async message => {
            try {
                const data = JSON.parse(message);
                let { lifeId, channelIdentifier, samples, sampleRate, clientTimestamp } = data;

                // --- Authorization Check (Message's lifeId vs. Authenticated Connection's lifeId) ---
                if (!lifeId || lifeId !== ws.lifeId) {
                    console.warn(`[Server WS - Auth] Unauthorized data received. Authenticated lifeId: ${ws.lifeId}, Message lifeId: ${lifeId}.`);
                    ws.send(JSON.stringify({ status: 'error', message: 'Unauthorized: lifeId mismatch or missing in message' }));
                    // For security, you might want to close the connection after such an attempt:
                    // ws.close(1008, 'Unauthorized data'); // 1008 is 'Policy Violation'
                    return; // Stop processing this unauthorized message
                }

                // Basic validation for other crucial fields
                if (!channelIdentifier || !Array.isArray(samples) || samples.length === 0 || !sampleRate || !clientTimestamp) {
                    console.warn(`[Server WS - Validation] Invalid WebSocket message format for Life ID ${lifeId}: Missing crucial fields.`, data);
                    ws.send(JSON.stringify({ status: 'error', message: 'Invalid data format or missing crucial fields' }));
                    return;
                }

                // Filter out unwanted channels (This is still valid processing logic)
                if (!ALLOWED_CHANNELS.includes(channelIdentifier)) {
                    // console.log(`[Server WS] Ignoring data for disallowed channel: ${channelIdentifier} for Life ID ${lifeId}`);
                    return; // Simply ignore data for disallowed channels
                }

                // --- DEBUG LOGGING for Client vs. Server Time ---
                const parsedClientTimestamp = new Date(clientTimestamp);
                const currentServerTime = new Date();
                console.log(`[Server WS - Time Debug] Life ID: ${lifeId}, Channel: ${channelIdentifier}`);
                console.log(`[Server WS - Time Debug] Client Timestamp (from message): ${parsedClientTimestamp.toISOString()}`);
                console.log(`[Server WS - Time Debug] Server's Current Time (at receive): ${currentServerTime.toISOString()}`);
                // Compare the difference: parsedClientTimestamp.getTime() - currentServerTime.getTime()
                // Positive means client is ahead, negative means server is ahead.
                // --- END DEBUG LOGGING ---


                // Initialize or retrieve in-memory buffers
                if (!RAW_EEG_BUFFERS.has(lifeId)) {
                    RAW_EEG_BUFFERS.set(lifeId, new Map());
                }
                const lifeBuffers = RAW_EEG_BUFFERS.get(lifeId);

                if (!lifeBuffers.has(channelIdentifier)) {
                    lifeBuffers.set(channelIdentifier, { samples: [], lastTimestamp: null, sampleRate: sampleRate });
                    console.log(`[Server WS] Initialized buffer for channel: ${channelIdentifier} for Life ID: ${lifeId}`);
                }
                const channelBuffer = lifeBuffers.get(channelIdentifier);

                // Ensure consistent sample rate for a channel.
                if (channelBuffer.sampleRate !== sampleRate) {
                    console.warn(`[Server WS - Buffer] Sample rate changed for ${lifeId}-${channelIdentifier}. Resetting buffer.`);
                    channelBuffer.samples = [];
                    channelBuffer.sampleRate = sampleRate;
                }

                // Append new samples and update last timestamp (based on clientTimestamp and sample count)
                channelBuffer.samples.push(...samples);
                channelBuffer.lastTimestamp = clientTimestamp + (samples.length / sampleRate) * 1000;

                // Calculate dynamic window sizes
                const fftWindowSize = Math.floor(sampleRate * FFT_WINDOW_DURATION_SEC);
                const windowSlideAmount = Math.floor(sampleRate * WINDOW_OVERLAP_DURATION_SEC);

                // Process when enough data for an FFT window is accumulated
                while (channelBuffer.samples.length >= fftWindowSize) {
                    const windowData = channelBuffer.samples.slice(0, fftWindowSize);
                    // Estimate window start time. This uses the *client's* lastTimestamp as a reference.
                    const currentWindowStartTime = channelBuffer.lastTimestamp - (channelBuffer.samples.length / sampleRate) * 1000;

                    console.log(`[Server WS - Processing] Window for ${lifeId}-${channelIdentifier}. Samples: ${windowData.length}, SR: ${sampleRate}`);

                    // Apply High-Pass Filter to the window data
                    const filteredWindowData = highPassFilter(windowData, HIGHPASS_CUTOFF_FREQ_HZ, sampleRate);

                    // Call calculateEEGMetricsAndStore and get metrics AND dbSaveSuccess status
                    const { metrics, dbSaveSuccess } = await calculateEEGMetricsAndStore(
                        lifeId,
                        channelIdentifier,
                        filteredWindowData,
                        sampleRate,
                        new Date(currentWindowStartTime) // Pass as Date object
                    );

                    // Only send 'success' status to frontend if DB save was successful
                    if (dbSaveSuccess) {
                        ws.send(JSON.stringify({
                            status: 'success',
                            message: `Processed and stored data for ${lifeId}-${channelIdentifier}`,
                            lifeId: lifeId,
                            channel: channelIdentifier,
                            metrics: metrics
                        }));
                    } else {
                        // If DB save failed, send an 'error' status to the frontend
                        console.error(`[Server WS - DB Error] Failed to store data for ${lifeId}-${channelIdentifier} after calculation.`);
                        ws.send(JSON.stringify({
                            status: 'error',
                            message: `Failed to store data for ${lifeId}-${channelIdentifier}. Database error or invalid lifeId.`,
                            lifeId: lifeId,
                            channel: channelIdentifier,
                            metrics: metrics // Still include metrics for debugging
                        }));
                    }

                    // Slide the buffer for the next window
                    channelBuffer.samples = channelBuffer.samples.slice(windowSlideAmount);
                    console.log(`[Server WS - Buffer] Buffer for ${lifeId}-${channelIdentifier} remaining: ${channelBuffer.samples.length}`);
                }
            } catch (error) {
                console.error(`[Server WS - Message Error] Error processing WebSocket message for Life ID ${ws.lifeId}:`, error);
                ws.send(JSON.stringify({ status: 'error', message: 'Failed to process data due to server error.' }));
            }
        });

        ws.on('close', (code, reason) => {
            console.log(`[Server WS] Client disconnected. Life ID: ${ws.lifeId || 'Unknown'}, Code: ${code}, Reason: ${reason || 'No reason specified'}`);
            // Implement buffer cleanup logic here if needed (e.g., if a user truly leaves)
            // For now, buffers persist across disconnections to handle brief network drops.
        });

        ws.on('error', error => {
            console.error(`[Server WS - Error] WebSocket error for Life ID ${ws.lifeId || 'Unknown'}:`, error.message);
        });
    });

    console.log('[Server WS] WebSocket server initialized and ready to accept connections.');
}

module.exports = { initWebSocketServer };