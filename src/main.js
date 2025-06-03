// main.js
import { MuseClient } from 'muse-js';

window.Muse = {
    MuseClient: MuseClient,
};

console.log("Muse.js client exposed globally. App logic runs from here, sending data to WebSocket.");
console.log("Document readyState at script load:", document.readyState);

document.addEventListener('DOMContentLoaded', () => {
    console.log("--- DOMContentLoaded callback executed ---");

    const client = new MuseClient();
    const outputElement = document.getElementById('output'); // Renamed for clarity
    const phaseOutputElement = document.getElementById('phaseOutput'); // Renamed for clarity
    const SAMPLE_RATE = 256;

    // Base WebSocket server URL
    const BASE_WS_SERVER_URL = 'ws://localhost:3000';
    let ws = null;

    const storedLifeId = localStorage.getItem('lifeId');
    const storedToken = localStorage.getItem('token'); // Get the stored JWT token

    console.log("[Frontend Startup] localStorage.getItem('lifeId') returned:", storedLifeId, "Type:", typeof storedLifeId);
    console.log("[Frontend Startup] localStorage.getItem('token') returned:", storedToken ? '[Token Found]' : '[Token Missing]', "Type:", typeof storedToken);

    // Initial authentication check before even attempting connection
    if (!storedLifeId || !storedToken) {
        outputElement.textContent = 'Error: Authentication required. Please log in first.';
        phaseOutputElement.textContent = ''; // Clear phase output
        console.error('[Frontend Error] Authentication token or lifeId missing in localStorage. User must log in.');
        return; // Stop execution if auth info is missing
    }

    const LIFE_ID = parseInt(storedLifeId, 10);
    console.log("[Frontend Startup] parseInt(storedLifeId, 10) returned:", LIFE_ID, "Type:", typeof LIFE_ID);

    if (isNaN(LIFE_ID)) {
        outputElement.textContent = 'Error: Invalid lifeId found. Please log in again.';
        phaseOutputElement.textContent = ''; // Clear phase output if invalid lifeId
        console.error('[Frontend Error] LifeId from localStorage is not a valid number:', storedLifeId);
        return; // Stop execution if lifeId is invalid
    }

    console.log("[Frontend Startup] Using LIFE_ID:", LIFE_ID, "Type:", typeof LIFE_ID);

    // Buffer to store EEG samples for each channel
    let buffer = {
        TP9: [], AF7: [], AF8: [], TP10: []
    };

    // Main function to connect to Muse and start data streaming
    async function start() {
        outputElement.textContent = "Attempting to connect to Muse S...";
        phaseOutputElement.textContent = "Waiting for Muse data..."; // Initial message for phase section
        console.log("[Start Function] start() called. Attempting client.connect()...");

        // Establish WebSocket connection, including the token in the URL query parameter
        try {
            const WS_SERVER_URL_WITH_TOKEN = `${BASE_WS_SERVER_URL}/?token=${storedToken}`;

            console.log(`[Frontend DEBUG] Stored Token (first 20 chars): ${storedToken ? storedToken.substring(0, 20) + '...' : 'NONE'}`);
            console.log(`[Frontend DEBUG] Attempting to connect to WS URL: ${WS_SERVER_URL_WITH_TOKEN}`);

            ws = new WebSocket(WS_SERVER_URL_WITH_TOKEN);

            ws.onopen = () => {
                console.log('[WebSocket] Connected to server.');
                outputElement.textContent = 'WebSocket connected. Attempting Muse connection...';
                phaseOutputElement.textContent = 'WebSocket connected. Waiting for EEG data...'; // Update phase section too
            };

            ws.onmessage = (event) => {
                // console.log('--- Frontend: Message from server received! ---'); // Suppress verbose log
                // console.log('Frontend: Raw event data:', event.data); // Suppress verbose raw data log
                try {
                    const parsedData = JSON.parse(event.data);
                    // console.log('Frontend: Parsed message:', parsedData); // Keep this for now, useful for debugging

                    if (parsedData.status === 'success' && parsedData.metrics) {
                        const metrics = parsedData.metrics;
                        const channel = parsedData.channel;

                        // --- Format Bandpower Data ---
                        let bandpowerString = `--- Latest Bandpowers for ${channel} ---\n`;
                        bandpowerString += `Overall Freq-Weighted Centroid: ${metrics.frequencyWeightedBandpower ? metrics.frequencyWeightedBandpower.toFixed(2) : 'N/A'} Hz\n`;
                        bandpowerString += `Bandpowers (uV^2/Hz):\n`;
                        bandpowerString += `  Delta: ${metrics.bandpowers.delta ? metrics.bandpowers.delta.toFixed(8) : 'N/A'}\n`;
                        bandpowerString += `  Theta: ${metrics.bandpowers.theta ? metrics.bandpowers.theta.toFixed(8) : 'N/A'}\n`;
                        bandpowerString += `  Alpha: ${metrics.bandpowers.alpha ? metrics.bandpowers.alpha.toFixed(8) : 'N/A'}\n`;
                        bandpowerString += `  Beta: ${metrics.bandpowers.beta ? metrics.bandpowers.beta.toFixed(8) : 'N/A'}\n`;
                        bandpowerString += `  Gamma: ${metrics.bandpowers.gamma ? metrics.bandpowers.gamma.toFixed(8) : 'N/A'}\n`;

                        // --- Format Phase Data ---
                        let phaseString = `--- Latest Phases for ${channel} ---\n`;
                        phaseString += `Phases (Degrees):\n`;
                        phaseString += `  Delta: ${metrics.phases.delta ? metrics.phases.delta.toFixed(2) : 'N/A'}\n`;
                        phaseString += `  Theta: ${metrics.phases.theta ? metrics.phases.theta.toFixed(2) : 'N/A'}\n`;
                        phaseString += `  Alpha: ${metrics.phases.alpha ? metrics.phases.alpha.toFixed(2) : 'N/A'}\n`;
                        phaseString += `  Beta: ${metrics.phases.beta ? metrics.phases.beta.toFixed(2) : 'N/A'}\n`;
                        phaseString += `  Gamma: ${metrics.phases.gamma ? metrics.phases.gamma.toFixed(2) : 'N/A'}\n`;

                        // --- Update the UI elements ---
                        outputElement.textContent = bandpowerString;
                        phaseOutputElement.textContent = phaseString;

                    } else if (parsedData.status === 'error') {
                        outputElement.textContent = `Backend Error: ${parsedData.message}`;
                        phaseOutputElement.textContent = ''; // Clear phase output on error
                        console.error('[Frontend Error] Backend reported an error:', parsedData.message);
                    } else {
                        outputElement.textContent = `Backend sent unexpected message: ${JSON.stringify(parsedData)}`;
                        phaseOutputElement.textContent = ''; // Clear phase output for unexpected messages
                        console.warn('[Frontend Warn] Backend sent unexpected message format:', parsedData);
                    }

                } catch (e) {
                    console.error('[Frontend Error] Error parsing message from server:', e, event.data);
                    outputElement.textContent = `Frontend Error: Received invalid message from server. Raw: ${event.data}`;
                    phaseOutputElement.textContent = ''; // Clear phase output on parse error
                }
            };

            ws.onerror = (errorEvent) => {
                console.error('[WebSocket Error] An error occurred:', errorEvent);
                outputElement.textContent = 'WebSocket error. Check console and server logs.';
                phaseOutputElement.textContent = 'WebSocket error.';
                // Attempt to display error message from the event if available
                if (errorEvent && errorEvent.message) {
                    outputElement.textContent += ` Reason: ${errorEvent.message}`;
                } else if (errorEvent && errorEvent.code) {
                    outputElement.textContent += ` Code: ${errorEvent.code}`;
                }
            };

            ws.onclose = (event) => {
                console.log(`[WebSocket] Disconnected. Code: ${event.code}, Reason: ${event.reason || 'No reason specified'}`);
                let disconnectMessage = 'WebSocket disconnected.';
                if (event.code === 1000) {
                    disconnectMessage += ' (Normal closure)';
                } else if (event.code === 1008) { // Policy Violation (e.g., unauthorized)
                    disconnectMessage += ' (Unauthorized or Policy Violation - check token/lifeId)';
                } else if (event.code === 1006) { // Abnormal closure (no close frame received)
                    disconnectMessage += ' (Abnormal closure - server might have crashed or connection lost)';
                } else if (event.code === 1001) { // Going Away
                    disconnectMessage += ' (Browser/tab closing)';
                } else {
                    disconnectMessage += ` (Code: ${event.code})`;
                }
                outputElement.textContent = `${disconnectMessage} Please refresh or check server.`;
                phaseOutputElement.textContent = `${disconnectMessage}.`; // Update phase section too
            };

        } catch (e) {
            console.error("[Start Function Error] Failed to establish WebSocket connection:", e);
            outputElement.textContent = 'Failed to connect to WebSocket: ' + (e.message || e);
            phaseOutputElement.textContent = 'WebSocket connection failed.';
            return; // Stop if WebSocket fails
        }

        // Connect to Muse and start streaming
        try {
            await client.connect();
            console.log("[Muse Client] client.connect() successful! Attempting client.start()...");
            await client.start();
            console.log("[Muse Client] client.start() successful. Subscribing to EEG readings...");

            outputElement.textContent = "Connected to Muse S. Streaming EEG data to server...";
            phaseOutputElement.textContent = "Streaming raw data..."; // Update phase section too

            client.eegReadings.subscribe(reading => {
                const channel = reading.electrode;
                const electrodeNames = ['TP9', 'AF7', 'AF8', 'TP10'];
                const channelName = electrodeNames[channel] || `Unknown Channel ${channel}`;

                if (!buffer[channelName]) buffer[channelName] = [];
                buffer[channelName].push(...reading.samples);
            });
            console.log("[Muse Client] EEG readings subscription initiated.");

            // Interval to send buffered data to the server
            setInterval(() => {
                // Ensure WebSocket is open and ready before sending data
                if (ws && ws.readyState === WebSocket.OPEN) {
                    const channelNamesToSend = ['AF7', 'AF8']; // Only send AF7 and AF8
                    const currentTimestamp = Date.now(); // Timestamp when data is *sent* from client

                    for (let ch of channelNamesToSend) {
                        const samplesToSend = [...buffer[ch]];
                        buffer[ch] = []; // Clear the buffer after copying

                        if (samplesToSend.length > 0) {
                            const message = {
                                lifeId: LIFE_ID, // Use the authenticated lifeId from localStorage
                                channelIdentifier: ch,
                                samples: samplesToSend,
                                sampleRate: SAMPLE_RATE,
                                clientTimestamp: currentTimestamp
                            };
                            ws.send(JSON.stringify(message));
                        }
                    }
                } else {
                    // This warning is expected if WebSocket fails to connect or closes.
                    // The primary issue is the initial WebSocket connection failure.
                    console.warn('[WebSocket] WebSocket not open. Cannot send data.');
                    outputElement.textContent = 'WebSocket not connected. Please refresh or check server.';
                    phaseOutputElement.textContent = 'WebSocket not connected.';
                }
            }, 500); // Send data every 500ms

        } catch (e) {
            console.error("[Muse Client Error] Error during Muse connection or start:", e);
            outputElement.textContent = 'Muse connection failed: ' + (e.message || e);
            phaseOutputElement.textContent = 'Muse connection failed.';
            if (ws && ws.readyState !== WebSocket.CLOSED) ws.close(); // Close WebSocket if Muse connection fails
        }
    }

    document.getElementById('connect').onclick = () => {
        console.log("Connect button clicked.");
        start();
    };
});