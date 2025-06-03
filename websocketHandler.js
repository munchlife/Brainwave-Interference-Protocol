// websocketHandler.js

const WebSocket = require('ws');
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
    const wss = new WebSocket.Server({ server });

    wss.on('connection', ws => {
        console.log('Client connected via WebSocket.');

        ws.on('message', async message => {
            try {
                const data = JSON.parse(message);
                let { lifeId, channelIdentifier, samples, sampleRate, clientTimestamp } = data;

                // Basic validation: Check if lifeId and other crucial fields are present.
                if (!lifeId || !channelIdentifier || !Array.isArray(samples) || samples.length === 0 || !sampleRate || !clientTimestamp) {
                    console.warn('Invalid WebSocket message format received: Missing lifeId or other crucial fields.', data);
                    ws.send(JSON.stringify({ status: 'error', message: 'Invalid data format or missing lifeId' })); // Explicit error to frontend
                    return;
                }

                // Filter out unwanted channels
                if (!ALLOWED_CHANNELS.includes(channelIdentifier)) {
                    // console.log(`Ignoring data for disallowed channel: ${channelIdentifier}`);
                    return; // Simply ignore data for disallowed channels, no error needed for frontend
                }

                if (!RAW_EEG_BUFFERS.has(lifeId)) {
                    RAW_EEG_BUFFERS.set(lifeId, new Map());
                }
                const lifeBuffers = RAW_EEG_BUFFERS.get(lifeId);

                if (!lifeBuffers.has(channelIdentifier)) {
                    lifeBuffers.set(channelIdentifier, { samples: [], lastTimestamp: null, sampleRate: sampleRate });
                    console.log(`Initialized buffer for channel: ${channelIdentifier} for lifeId: ${lifeId}`);
                }
                const channelBuffer = lifeBuffers.get(channelIdentifier);

                // Ensure consistent sample rate for a channel.
                if (channelBuffer.sampleRate !== sampleRate) {
                    console.warn(`Sample rate changed for ${lifeId}-${channelIdentifier}. Resetting buffer.`);
                    channelBuffer.samples = [];
                    channelBuffer.sampleRate = sampleRate;
                }

                // Append new samples
                channelBuffer.samples.push(...samples);
                channelBuffer.lastTimestamp = clientTimestamp + (samples.length / sampleRate) * 1000;

                // Calculate dynamic window sizes
                const fftWindowSize = Math.floor(sampleRate * FFT_WINDOW_DURATION_SEC);
                const windowSlideAmount = Math.floor(sampleRate * WINDOW_OVERLAP_DURATION_SEC);

                // Process when enough data for an FFT window is accumulated
                while (channelBuffer.samples.length >= fftWindowSize) {
                    const windowData = channelBuffer.samples.slice(0, fftWindowSize);
                    const currentWindowStartTime = channelBuffer.lastTimestamp - (channelBuffer.samples.length / sampleRate) * 1000;

                    console.log(`Processing window for ${lifeId}-${channelIdentifier}. Samples: ${windowData.length}, SR: ${sampleRate}`);

                    // Apply High-Pass Filter to the window data
                    const filteredWindowData = highPassFilter(windowData, HIGHPASS_CUTOFF_FREQ_HZ, sampleRate);

                    // Call calculateEEGMetricsAndStore and get metrics AND dbSaveSuccess status
                    const { metrics, dbSaveSuccess } = await calculateEEGMetricsAndStore(
                        lifeId,
                        channelIdentifier,
                        filteredWindowData,
                        sampleRate,
                        new Date(currentWindowStartTime)
                    );

                    // --- CRITICAL CHANGE: Only send 'success' status if DB save was successful ---
                    if (dbSaveSuccess) {
                        ws.send(JSON.stringify({
                            status: 'success', // Only send success if data was saved to DB
                            message: `Processed and stored data for ${lifeId}-${channelIdentifier}`,
                            lifeId: lifeId,
                            channel: channelIdentifier,
                            metrics: metrics // Include the returned metrics object
                        }));
                    } else {
                        // If DB save failed, send an 'error' status to the frontend
                        ws.send(JSON.stringify({
                            status: 'error',
                            message: `Failed to store data for ${lifeId}-${channelIdentifier}. lifeId might be invalid.`,
                            lifeId: lifeId, // Still include lifeId for debugging
                            channel: channelIdentifier,
                            metrics: metrics // Optionally include metrics even on error, but frontend should check status
                        }));
                    }
                    // --- END CRITICAL CHANGE ---

                    // Slide the buffer for the next window
                    channelBuffer.samples = channelBuffer.samples.slice(windowSlideAmount);
                    console.log(`Buffer for ${lifeId}-${channelIdentifier} remaining: ${channelBuffer.samples.length}`);
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
                ws.send(JSON.stringify({ status: 'error', message: 'Failed to process data due to server error.' }));
            }
        });

        ws.on('close', () => {
            console.log('Client disconnected from WebSocket.');
        });

        ws.on('error', error => {
            console.error('WebSocket error:', error);
        });
    });

    console.log('WebSocket server initialized.');
}

module.exports = { initWebSocketServer };