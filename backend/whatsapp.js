const { makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs').promises;
const path = require('path');
const qrcode = require('qrcode-terminal');
const db = require('./database');
const { processPDFForDuplex } = require('./pdfProcessor');

async function connectToWhatsApp() {
    // Setup authentication state
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // Suppress detailed logs
        printQRInTerminal: false,

        // --- STABILITY PATCHES ---
        // 1. The Disguise: Tell WhatsApp we are a Mac running Chrome
        browser: ['Mac OS', 'Chrome', '10.15.7'],

        // 2. The Heartbeat: Ping WhatsApp every 10 seconds to keep the socket alive
        keepAliveIntervalMs: 10000,

        // 3. Memory Saver: Don't try to download the last 3 months of chat history
        syncFullHistory: false,

        // 4. Timeouts: Give it more time to establish the connection on a VPS
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\nScan this QR code with your WhatsApp mobile app to connect:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;
            const shouldReconnect = (statusCode !== DisconnectReason.loggedOut);

            console.log(`WhatsApp connection closed (Code: ${statusCode}). Reason:`, lastDisconnect.error?.message || 'unknown');

            if (shouldReconnect) {
                // If it's a 515 (Restart Required), reconnect immediately. Otherwise wait 5s.
                const timeout = statusCode === 515 ? 0 : 5000;
                console.log(`Reconnecting to WhatsApp in ${timeout / 1000} seconds...`);
                setTimeout(connectToWhatsApp, timeout);
            } else {
                console.log('❌ You have been logged out of WhatsApp.');
                console.log('ACTION REQUIRED: Delete the "baileys_auth_info" folder and restart the server to scan a new QR code.');
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp connected successfully and heartbeat is active!');
        }
    });

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue; // Ignore our own messages

            // Check if the message is a document (PDF)
            const isDocument = msg.message.documentMessage || msg.message.documentWithCaptionMessage?.message?.documentMessage;
            if (isDocument) {
                const docMsg = msg.message.documentMessage || msg.message.documentWithCaptionMessage.message.documentMessage;

                // Only process PDFs
                if (docMsg.mimetype === 'application/pdf') {
                    console.log(`Received PDF from: ${msg.key.remoteJid}`);

                    try {
                        // Download the media
                        const buffer = await downloadMediaMessage(
                            msg,
                            'buffer',
                            {},
                            {
                                logger: pino({ level: 'silent' }),
                                reuploadRequest: sock.updateMediaMessage
                            }
                        );

                        const fileName = docMsg.fileName || `document_${Date.now()}.pdf`;
                        const rawFilePath = path.join(__dirname, 'uploads', `raw_${fileName}`);
                        const processedFilePath = path.join(__dirname, 'uploads', `processed_${fileName}`);

                        // Save the raw PDF
                        await fs.writeFile(rawFilePath, buffer);
                        console.log(`Saved raw PDF to ${rawFilePath}`);

                        // Process the PDF (Smart Padding, etc.)
                        const result = await processPDFForDuplex(rawFilePath, processedFilePath);

                        if (result.success) {
                            // Insert into database
                            const stmt = db.prepare(`
                                INSERT INTO PrintJobs (filename, filepath, odd_filepath, even_filepath, original_pages, printed_pages, status)
                                VALUES (?, ?, ?, ?, ?, ?, 'pending')
                            `);
                            stmt.run(fileName, processedFilePath, result.oddPath, result.evenPath, result.originalPages, result.printedPages);

                            console.log(`Successfully queued job for ${fileName}. Printed Pages: ${result.printedPages}`);

                            // Acknowledge receipt
                            await sock.sendMessage(msg.key.remoteJid, { text: `✅ Received: ${fileName}\n\nAdded to the print queue. Requires ${result.physicalPaperRequired} physical sheets.` }, { quoted: msg });
                        } else {
                            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Error processing ${fileName}. Please try sending it again.` }, { quoted: msg });
                        }

                    } catch (err) {
                        console.error('Error handling incoming document:', err);
                    }
                }
            }
        }
    });
}

module.exports = { connectToWhatsApp };