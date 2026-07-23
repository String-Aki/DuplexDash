require('dotenv').config();
const { makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs').promises;
const path = require('path');
const qrcode = require('qrcode-terminal');
const db = require('./database');
const { processPDFForDuplex } = require('./pdfProcessor');
const { exec: _exec } = require('child_process');
const { getConversationalIntent } = require('./nlpEngine');
const logger = require('./logger');

const exec = (command, callback) => {
    logger.log(`[SYS EXEC] ${command}`);
    return _exec(command, callback);
};

async function connectToWhatsApp() {
    // Setup authentication state
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // Suppress detailed logs
        printQRInTerminal: false,

        // --- STABILITY PATCHES ---
        // 1. The Disguise: Use official Baileys string
        browser: Browsers.macOS('Desktop'),

        // 2. The Heartbeat: Ping WhatsApp every 10 seconds to keep the socket alive
        keepAliveIntervalMs: 10000,

        // 3. Memory Saver: Don't try to download the last 3 months of chat history
        syncFullHistory: false,

        // 4. Timeouts: Give it more time to establish the connection on a VPS
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000
    });

    // Intercept outgoing messages to log bot replies
    const originalSendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options) => {
        if (content.text) {
            logger.log(`[BOT -> ${jid}]: ${content.text}`);
        }
        return originalSendMessage(jid, content, options);
    };

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logger.log('\nScan this QR code with your WhatsApp mobile app to connect:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;
            const shouldReconnect = (statusCode !== DisconnectReason.loggedOut);

            logger.log(`WhatsApp connection closed (Code: ${statusCode}). Reason: ${lastDisconnect.error?.message || 'unknown'}`);

            if (shouldReconnect) {
                // If it's a 515 (Restart Required), reconnect immediately. Otherwise wait 5s.
                const timeout = statusCode === 515 ? 0 : 5000;
                logger.log(`Reconnecting to WhatsApp in ${timeout / 1000} seconds...`);
                setTimeout(connectToWhatsApp, timeout);
            } else {
                logger.log('❌ You have been logged out of WhatsApp.');
                logger.log('ACTION REQUIRED: Delete the "baileys_auth_info" folder and restart the server to scan a new QR code.');
            }
        } else if (connection === 'open') {
            logger.log('✅ WhatsApp connected successfully and heartbeat is active!');
        }
    });

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            // RAW DEBUG LOG
            logger.log(`[RAW INCOMING] fromMe: ${msg.key.fromMe}, remoteJid: ${msg.key.remoteJid}, type: ${Object.keys(msg.message || {})[0]}`);

            if (!msg.message || msg.key.fromMe) continue; // Ignore our own messages

            // Ignore status broadcasts quietly
            if (msg.key.remoteJid === 'status@broadcast') {
                continue;
            }

            // Hard Whitelisting (Supports comma-separated JIDs in .env)
            const authorizedJids = process.env.AUTHORIZED_JID.split(',').map(j => j.trim());
            if (!authorizedJids.includes(msg.key.remoteJid)) {
                continue; // Silence all other messages
            }

            // Check if the message is a document (PDF)
            const isDocument = msg.message.documentMessage || msg.message.documentWithCaptionMessage?.message?.documentMessage;
            if (isDocument) {
                const docMsg = msg.message.documentMessage || msg.message.documentWithCaptionMessage.message.documentMessage;

                // Only process PDFs
                if (docMsg.mimetype === 'application/pdf') {
                    logger.log(`Received PDF from: ${msg.key.remoteJid}`);

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
                        logger.log(`Saved raw PDF to ${rawFilePath}`);

                        // Process the PDF (Smart Padding, etc.)
                        const result = await processPDFForDuplex(rawFilePath, processedFilePath);

                        if (result.success) {
                            // Insert into database
                            const stmt = db.prepare(`
                                INSERT INTO PrintJobs (remote_jid, filename, filepath, odd_filepath, even_filepath, original_pages, printed_pages, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_start')
                            `);
                            const dbResult = stmt.run(msg.key.remoteJid, fileName, processedFilePath, result.oddPath, result.evenPath, result.originalPages, result.printedPages);
                            
                            logger.log(`Job ${dbResult.lastInsertRowid} created. Status: awaiting_start`);

                            // Acknowledge receipt
                            await sock.sendMessage(msg.key.remoteJid, { text: `PDF received (${result.originalPages} pages). Shall I start?` }, { quoted: msg });
                        } else {
                            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Error processing ${fileName}. Please try sending it again.` }, { quoted: msg });
                        }

                    } catch (err) {
                        logger.error(`Error handling incoming document: ${err}`);
                    }
                }
            } else if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
                // Handle text messages
                const text = msg.message.conversation || msg.message.extendedTextMessage.text;
                logger.log(`[USER -> ${msg.key.remoteJid}]: ${text}`);
                // Get most recent non-completed job for this user
                const job = db.prepare("SELECT * FROM PrintJobs WHERE remote_jid = ? AND status NOT IN ('printed', 'failed', 'cancelled') ORDER BY created_at DESC LIMIT 1").get(msg.key.remoteJid);
                
                // Quota Saver Logic
                const lowerText = text.trim().toLowerCase();
                let intentResult = null;
                
                if (['yes', 'y', 'print', 'go ahead', 'proceed'].includes(lowerText)) {
                    intentResult = { intent: 'affirmative', botReply: '' };
                } else if (['no', 'cancel', 'stop', 'abort'].includes(lowerText)) {
                    intentResult = { intent: 'cancel', botReply: 'Print job stopped and queue cleared.' };
                } else if (['done', 'flipped', 'loaded'].includes(lowerText)) {
                    intentResult = { intent: 'flipped', botReply: 'Printing even pages...' };
                } else {
                    intentResult = await getConversationalIntent(text, job);
                }

                if (!job) {
                    if (intentResult.botReply) await sock.sendMessage(msg.key.remoteJid, { text: intentResult.botReply });
                    continue;
                }

                if (intentResult.intent === 'cancel') {
                    db.prepare("UPDATE PrintJobs SET status = 'cancelled' WHERE id = ?").run(job.id);
                    logger.log(`Job ${job.id} state changed to cancelled`);
                    
                    const cancelCmd = `cancel -a Canon_G3010`;
                    logger.log(`[HARDWARE EXEC] ${cancelCmd}`);
                    exec(cancelCmd, async (err) => {
                         if (err) logger.error(`Hardware cancel error: ${err}`);
                         await sock.sendMessage(msg.key.remoteJid, { text: intentResult.botReply || 'Print job stopped and queue cleared.' });
                    });
                    continue;
                }

                if (job.status === 'awaiting_start' && intentResult.intent === 'affirmative') {
                    db.prepare("UPDATE PrintJobs SET status = 'awaiting_prefs' WHERE id = ?").run(job.id);
                    logger.log(`Job ${job.id} state changed to awaiting_prefs`);
                    await sock.sendMessage(msg.key.remoteJid, { text: "How many copies? Color or B&W? (e.g., '1 bw')" });
                } else if (job.status === 'awaiting_prefs' && intentResult.intent === 'prefs') {
                    // Extract from AI response
                    const copies = intentResult.copies || 1;
                    const colorMode = intentResult.colorMode || 'BW';
                    
                    db.prepare("UPDATE PrintJobs SET copies = ?, color_mode = ?, status = 'awaiting_confirmation' WHERE id = ?").run(copies, colorMode, job.id);
                    logger.log(`Job ${job.id} state changed to awaiting_confirmation`);
                    
                    const requiredSheets = Math.ceil(job.original_pages / 2) * copies;
                    
                    await sock.sendMessage(msg.key.remoteJid, { text: `I have calculated the paper requirements: You will need ${requiredSheets} sheets.` });
                    await sock.sendMessage(msg.key.remoteJid, { text: "Shall I proceed with printing?" });
                } else if (job.status === 'awaiting_confirmation' && intentResult.intent === 'affirmative') {
                    db.prepare("UPDATE PrintJobs SET status = 'printing_odds' WHERE id = ?").run(job.id);
                    logger.log(`Job ${job.id} state changed to printing_odds`);
                    await sock.sendMessage(msg.key.remoteJid, { text: "Printing odd pages..." });

                    const lpCmd = `lp -d Canon_G3010 -n ${job.copies} "${job.odd_filepath}"`;
                    logger.log(`[HARDWARE EXEC] ${lpCmd}`);
                    exec(lpCmd, (err, stdout) => {
                        if (err) {
                            logger.error(`Hardware print error (odd): ${err}`);
                            return;
                        }
                        
                        const match = stdout.match(/request id is ([^\s]+)/);
                        const jobId = match ? match[1] : null;
                        
                        if (jobId) {
                            const pollInterval = setInterval(() => {
                                exec('lpstat -o', async (err, lpstatStdout) => {
                                    if (!lpstatStdout || !lpstatStdout.includes(jobId)) {
                                        clearInterval(pollInterval);
                                        db.prepare("UPDATE PrintJobs SET status = 'waiting_for_flip' WHERE id = ?").run(job.id);
                                        logger.log(`Job ${job.id} state changed to waiting_for_flip`);
                                        await sock.sendMessage(msg.key.remoteJid, { text: "Odd pages are done! Please flip the paper, load it into the printer, and reply 'flipped'." });
                                    }
                                });
                            }, 5000);
                        } else {
                            logger.error("Could not parse job ID from lp output.");
                        }
                    });
                } else if (job.status === 'waiting_for_flip' && intentResult.intent === 'flipped') {
                    db.prepare("UPDATE PrintJobs SET status = 'printing_evens' WHERE id = ?").run(job.id);
                    logger.log(`Job ${job.id} state changed to printing_evens`);
                    await sock.sendMessage(msg.key.remoteJid, { text: "Printing even pages..." });

                    const lpCmd = `lp -d Canon_G3010 -n ${job.copies} "${job.even_filepath}"`;
                    logger.log(`[HARDWARE EXEC] ${lpCmd}`);
                    exec(lpCmd, (err, stdout) => {
                        if (err) {
                            logger.error(`Hardware print error (even): ${err}`);
                            return;
                        }

                        const match = stdout.match(/request id is ([^\s]+)/);
                        const jobId = match ? match[1] : null;

                        if (jobId) {
                            const pollInterval = setInterval(() => {
                                exec('lpstat -o', async (err, lpstatStdout) => {
                                    if (!lpstatStdout || !lpstatStdout.includes(jobId)) {
                                        clearInterval(pollInterval);
                                        
                                        // Update inventory
                                        const physicalPaperUsed = Math.ceil(job.printed_pages / 2) * job.copies;
                                        const inkUsed = job.printed_pages * job.copies * 0.5;

                                        db.transaction(() => {
                                            db.prepare("UPDATE Settings SET paper_inventory = paper_inventory - ?, ink_level = ink_level - ? WHERE id = 1").run(physicalPaperUsed, inkUsed);
                                        })();

                                        // Final state update
                                        db.prepare("UPDATE PrintJobs SET status = 'printed' WHERE id = ?").run(job.id);
                                        logger.log(`Job ${job.id} state changed to printed`);
                                        
                                        const pricePerPage = job.color_mode.toLowerCase() === 'color' ? 
                                            parseFloat(process.env.LKR_PRINT_PRICE_COLOR || 25) : 
                                            parseFloat(process.env.LKR_PRINT_PRICE_BW || 10);
                                            
                                        const totalCost = job.original_pages * job.copies * pricePerPage;
                                        await sock.sendMessage(msg.key.remoteJid, { text: `Printing Complete! Total Cost: Rs. ${totalCost}.` });
                                    }
                                });
                            }, 5000);
                        } else {
                            logger.error("Could not parse job ID from lp output.");
                        }
                    });
                } else {
                    if (intentResult.botReply) await sock.sendMessage(msg.key.remoteJid, { text: intentResult.botReply });
                }
            }
        }
    });
}

module.exports = { connectToWhatsApp };