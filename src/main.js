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

    const WS_SERVER_URL = 'ws://localhost:3000';
    let ws = null;

    const storedLifeId = localStorage.getItem('lifeId');
    console.log("localStorage.getItem('lifeId') returned:", storedLifeId, "Type:", typeof storedLifeId);

    if (!storedLifeId) {
        outputElement.textContent = 'Error: No lifeId found. Please log in first.';
        phaseOutputElement.textContent = ''; // Clear phase output if no lifeId
        console.error('No lifeId found in localStorage. User must log in.');
        return;
    }

    const LIFE_ID = parseInt(storedLifeId, 10);
    console.log("parseInt(storedLifeId, 10) returned:", LIFE_ID, "Type:", typeof LIFE_ID);

    if (isNaN(LIFE_ID)) {
        outputElement.textContent = 'Error: Invalid lifeId found. Please log in again.';
        phaseOutputElement.textContent = ''; // Clear phase output if invalid lifeId
        console.error('LifeId from localStorage is not a valid number:', storedLifeId);
        return;
    }

    console.log("Using LIFE_ID:", LIFE_ID, "Type:", typeof LIFE_ID);

    // Buffer to store EEG samples for each channel (local to this scope)
    // Note: The backend filter now only processes AF7, AF8. You might consider
    // if you still need to buffer TP9 and TP10 on the frontend if they're not used.
    let buffer = {
        TP9: [], AF7: [], AF8: [], TP10: []
    };

    // Main function to connect to Muse and start data streaming
    async function start() {
        outputElement.textContent = "Attempting to connect to Muse S...";
        phaseOutputElement.textContent = "Waiting for Muse data..."; // Initial message for phase section
        console.log("start() function called. Attempting client.connect()...");

        // Establish WebSocket connection
        try {
            ws = new WebSocket(WS_SERVER_URL);

            ws.onopen = () => {
                console.log('WebSocket connected to server.');
                outputElement.textContent = 'WebSocket connected. Attempting Muse connection...';
                phaseOutputElement.textContent = 'WebSocket connected. Waiting for EEG data...'; // Update phase section too
            };

            ws.onmessage = (event) => {
                console.log('--- Frontend: Message from server received! ---');
                console.log('Frontend: Raw event data:', event.data);
                try {
                    const parsedData = JSON.parse(event.data);
                    console.log('Frontend: Parsed message:', parsedData);

                    if (parsedData.status === 'success' && parsedData.metrics) {
                        const metrics = parsedData.metrics;
                        const channel = parsedData.channel;

                        // --- Format Bandpower Data ---
                        let bandpowerString = `--- Latest Bandpowers for ${channel} ---\n`;
                        bandpowerString += `Overall Freq-Weighted Centroid: ${metrics.frequencyWeightedBandpower ? metrics.frequencyWeightedBandpower.toFixed(2) : 'N/A'} Hz\n`;
                        bandpowerString += `Bandpowers (uV^2/Hz):\n`; // Corrected unit label
                        bandpowerString += `  Delta: ${metrics.bandpowers.delta ? metrics.bandpowers.delta.toFixed(8) : 'N/A'}\n`; // Increased precision for linear power
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
                        outputElement.textContent = bandpowerString; // Assign bandpower data to the 'output' section
                        phaseOutputElement.textContent = phaseString; // Assign phase data to the 'phaseOutput' section

                    } else if (parsedData.status === 'error') {
                        outputElement.textContent = `Backend Error: ${parsedData.message}`;
                        phaseOutputElement.textContent = ''; // Clear phase output on error
                        console.error('Frontend: Backend reported an error:', parsedData.message);
                    } else {
                        outputElement.textContent = `Backend sent: ${JSON.stringify(parsedData)}`;
                        phaseOutputElement.textContent = ''; // Clear phase output for unexpected messages
                    }

                } catch (e) {
                    console.error('Frontend: Error parsing message from server:', e, event.data);
                    outputElement.textContent = `Frontend Error: Received invalid message from server. Raw: ${event.data}`;
                    phaseOutputElement.textContent = ''; // Clear phase output on parse error
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                outputElement.textContent = 'WebSocket error. Check server.';
                phaseOutputElement.textContent = 'WebSocket error.'; // Update phase section too
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected.');
                outputElement.textContent = 'WebSocket disconnected. Please refresh.';
                phaseOutputElement.textContent = 'WebSocket disconnected.'; // Update phase section too
            };

            // This part is redundant as onopen will trigger on success
            // await new Promise((resolve, reject) => {
            //     ws.onopen = resolve;
            //     ws.onerror = reject;
            // });

        } catch (e) {
            console.error("Error establishing WebSocket connection:", e);
            outputElement.textContent = 'Failed to connect to WebSocket: ' + (e.message || e);
            return; // Stop if WebSocket fails
        }

        // Connect to Muse and start streaming
        try {
            await client.connect();
            console.log("client.connect() successful! Attempting client.start()...");
            await client.start();
            console.log("client.start() successful. Subscribing to EEG readings...");

            outputElement.textContent = "Connected to Muse S. Streaming EEG data to server...";
            phaseOutputElement.textContent = "Streaming raw data..."; // Update phase section too

            client.eegReadings.subscribe(reading => {
                const channel = reading.electrode;
                const electrodeNames = ['TP9', 'AF7', 'AF8', 'TP10'];
                const channelName = electrodeNames[channel] || `Unknown Channel ${channel}`;

                // Only buffer allowed channels if you want to optimize frontend
                // Though backend already filters, it's good practice
                // if (['AF7', 'AF8'].includes(channelName)) {
                if (!buffer[channelName]) buffer[channelName] = [];
                buffer[channelName].push(...reading.samples);
                // }
            });
            console.log("EEG readings subscription initiated.");

            // Interval to send buffered data to the server
            setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    // Only send data for channels processed by the backend (AF7, AF8)
                    const channelNamesToSend = ['AF7', 'AF8']; // Only send AF7 and AF8
                    const currentTimestamp = Date.now();

                    for (let ch of channelNamesToSend) {
                        // Ensure we only send samples that have accumulated since last send
                        const samplesToSend = [...buffer[ch]];
                        buffer[ch] = []; // Clear the buffer after copying

                        if (samplesToSend.length > 0) {
                            const message = {
                                lifeId: LIFE_ID,
                                channelIdentifier: ch,
                                samples: samplesToSend,
                                sampleRate: SAMPLE_RATE,
                                clientTimestamp: currentTimestamp
                            };
                            ws.send(JSON.stringify(message));
                        }
                    }
                } else {
                    console.warn('WebSocket not open. Cannot send data.');
                    outputElement.textContent = 'WebSocket not connected. Please refresh or check server.';
                    phaseOutputElement.textContent = 'WebSocket not connected.'; // Update phase section too
                }
            }, 500); // Send data every 500ms

        } catch (e) {
            console.error("Error during Muse connection or start:", e);
            outputElement.textContent = 'Muse connection failed: ' + (e.message || e);
            phaseOutputElement.textContent = 'Muse connection failed.'; // Update phase section too
            if (ws) ws.close();
        }
    }

    document.getElementById('connect').onclick = () => {
        console.log("Connect button clicked.");
        start();
    };
});