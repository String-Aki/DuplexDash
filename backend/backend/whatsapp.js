const { makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason } = require('@whiskeysockets/baileys');
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
        logger: pino({ level: 'silent' }), // Suppress detailed logs for cleaner output
        printQRInTerminal: false // We will handle it manually to guarantee it shows
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

        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('WhatsApp connection closed due to:', lastDisconnect.error?.message || 'unknown');
            
            // Reconnect if not logged out
            if(shouldReconnect) {
                console.log('Reconnecting to WhatsApp in 3 seconds...');
                setTimeout(connectToWhatsApp, 3000);
            } else {
                console.log('You have been logged out of WhatsApp. Please delete the "baileys_auth_info" folder and restart to scan a new QR code.');
            }
        } else if(connection === 'open') {
            console.log('WhatsApp connected successfully!');
        }
    });

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        for (const msg of messages) {
            if (!msg.message) continue;

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
                            
                            console.log(`Successfully queued job for ${fileName}. Original Pages: ${result.originalPages}, Printed Pages: ${result.printedPages}`);
                            
                            // Acknowledge receipt
                            await sock.sendMessage(msg.key.remoteJid, { text: `Received your PDF: ${fileName}. It has been added to the print queue. It requires ${result.physicalPaperRequired} physical pages.` }, { quoted: msg });
                        } else {
                            await sock.sendMessage(msg.key.remoteJid, { text: `Error processing your PDF: ${fileName}. Please try again.` }, { quoted: msg });
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
