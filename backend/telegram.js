require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const logger = require('./logger');
const { processPDFForDuplex } = require('./pdfProcessor');
const { routeMessage } = require('./router');
const { printFile, cancelPrintJob, getPrinterStatus } = require('./hardware');

let bot;

function connectToTelegram() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        logger.error("TELEGRAM_BOT_TOKEN not provided.");
        return;
    }

    bot = new TelegramBot(token, { polling: true });
    logger.log("Telegram bot connected and polling.");

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id.toString();
        const authorizedJid = process.env.AUTHORIZED_JID || process.env.AUTHORIZED_CHAT_ID;

        if (authorizedJid && chatId !== authorizedJid.toString()) {
            logger.log(`Unauthorized access attempt from ${chatId}`);
            bot.sendMessage(chatId, "Unauthorized access.");
            return;
        }

        if (msg.document) {
            await handleIncomingDocument(msg, chatId);
        } else if (msg.text) {
            await processUserIntent(chatId, msg.text, null);
        }
    });

    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id.toString();
        const authorizedJid = process.env.AUTHORIZED_JID || process.env.AUTHORIZED_CHAT_ID;

        if (authorizedJid && chatId !== authorizedJid.toString()) {
            return bot.answerCallbackQuery(query.id, { text: "Unauthorized" });
        }

        const payload = query.data;
        await bot.answerCallbackQuery(query.id); // Remove loading spinner
        await processUserIntent(chatId, null, payload);
    });
}

async function handleIncomingDocument(msg, chatId) {
    if (msg.document.mime_type !== 'application/pdf') {
        return bot.sendMessage(chatId, "Please send a valid PDF document.");
    }

    // Check if there is an active job
    const activeJob = db.prepare("SELECT * FROM PrintJobs WHERE status NOT IN ('printed', 'failed', 'cancelled')").get();
    if (activeJob) {
        return bot.sendMessage(chatId, "There is already an active print job. Please finish or cancel it first.");
    }

    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name || 'document.pdf';
    
    bot.sendMessage(chatId, "Receiving document...");

    const fileStream = bot.getFileStream(fileId);
    
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const rawPath = path.join(uploadsDir, `raw_${Date.now()}_${fileName}`);
    const writeStream = fs.createWriteStream(rawPath);

    fileStream.pipe(writeStream);

    writeStream.on('finish', async () => {
        bot.sendMessage(chatId, "Processing PDF for Duplex Printing...");
        
        const processResult = await processPDFForDuplex(rawPath, rawPath);
        
        if (!processResult.success) {
            return bot.sendMessage(chatId, "Failed to process the PDF document.");
        }

        // Insert job into database
        const result = db.prepare(`
            INSERT INTO PrintJobs (remote_jid, filename, filepath, odd_filepath, even_filepath, original_pages, printed_pages, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_start')
        `).run(chatId, fileName, rawPath, processResult.oddPath, processResult.evenPath, processResult.originalPages, processResult.printedPages);

        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Yes, Start", callback_data: "BTN_AFFIRMATIVE" },
                        { text: "❌ Cancel", callback_data: "BTN_CANCEL" }
                    ]
                ]
            }
        };

        bot.sendMessage(chatId, `*Document Ready!*\nPages: ${processResult.printedPages}\nSheets required: ${processResult.physicalPaperRequired}\n\nStart printing?`, { parse_mode: "Markdown", ...opts });
    });
}

async function processUserIntent(chatId, text, payload) {
    const activeJob = db.prepare("SELECT * FROM PrintJobs WHERE status NOT IN ('printed', 'failed', 'cancelled')").get();
    
    const routeResult = await routeMessage(text, payload, activeJob);
    const intent = routeResult.intent;

    if (intent === 'unknown') {
        if (!activeJob) {
            return bot.sendMessage(chatId, routeResult.botReply || "I didn't understand that. Please send a PDF to begin.");
        }
        return bot.sendMessage(chatId, routeResult.botReply || "Please use the buttons provided.");
    }

    if (intent === 'greeting') {
        return bot.sendMessage(chatId, routeResult.botReply || "👋 *Welcome to DuplexDash!*\n\nSend me a PDF document to begin duplex printing.", { parse_mode: "Markdown" });
    }

    if (intent === 'cancel') {
        if (activeJob) {
            await cancelPrintJob();
            db.prepare("UPDATE PrintJobs SET status = 'cancelled' WHERE id = ?").run(activeJob.id);
            await cleanupJobFiles(activeJob || job);
            return bot.sendMessage(chatId, routeResult.botReply || "🛑 Print job stopped and queue cleared.");
        }
        return bot.sendMessage(chatId, "No active print job to cancel.");
    }

    if (!activeJob) return;

    if (intent === 'affirmative' && activeJob.status === 'awaiting_start') {
        db.prepare("UPDATE PrintJobs SET status = 'awaiting_prefs' WHERE id = ?").run(activeJob.id);
        
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "⚫ 1 Copy (B&W)", callback_data: "BTN_PREF_1_BW" },
                        { text: "🌈 1 Copy (Color)", callback_data: "BTN_PREF_1_COLOR" }
                    ]
                ]
            }
        };
        return bot.sendMessage(chatId, "Select print preferences:", opts);
    }

    if (intent === 'prefs' && activeJob.status === 'awaiting_prefs') {
        const copies = routeResult.copies || 1;
        const colorMode = routeResult.colorMode || 'BW';
        
        db.prepare("UPDATE PrintJobs SET copies = ?, color_mode = ?, status = 'printing_odd' WHERE id = ?").run(copies, colorMode, activeJob.id);
        
        const expectedPages = Math.ceil(activeJob.printed_pages / 2);
        await trackHardwarePrint(chatId, `Printing odd pages (${copies} copy, ${colorMode})`, activeJob.odd_filepath, copies, expectedPages);
        
        db.prepare("UPDATE PrintJobs SET status = 'waiting_for_flip' WHERE id = ?").run(activeJob.id);
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🔄 Flipped & Loaded", callback_data: "BTN_FLIPPED" },
                        { text: "❌ Cancel Job", callback_data: "BTN_CANCEL" }
                    ]
                ]
            }
        };
        bot.sendMessage(chatId, "Odd pages printed. Please flip the paper and load it back into the tray.", opts);
        return;
    }

    if (intent === 'flipped' && activeJob.status === 'waiting_for_flip') {
        db.prepare("UPDATE PrintJobs SET status = 'printing_evens' WHERE id = ?").run(activeJob.id);
        
        const expectedPages = Math.floor(activeJob.printed_pages / 2) || 1;
        await trackHardwarePrint(chatId, "Printing even pages", activeJob.even_filepath, activeJob.copies || 1, expectedPages);
        
        // Update inventory
        const physicalPaperUsed = Math.ceil(activeJob.printed_pages / 2) * (activeJob.copies || 1);
        const inkUsed = activeJob.printed_pages * 0.5 * (activeJob.copies || 1);
        
        const transaction = db.transaction(() => {
            db.prepare("UPDATE PrintJobs SET status = 'printed' WHERE id = ?").run(activeJob.id);
            db.prepare(`
                UPDATE Settings 
                SET paper_inventory = paper_inventory - ?, 
                    ink_level = ink_level - ? 
                WHERE id = 1
            `).run(physicalPaperUsed, inkUsed);
        });
        transaction();
        
        const settings = db.prepare("SELECT * FROM Settings WHERE id = 1").get();
        const price = activeJob.color_mode === 'Color' ? settings.lkr_price_per_page_color : settings.lkr_price_per_page_bw;
        const totalCost = (activeJob.printed_pages * (activeJob.copies || 1) * price).toFixed(2);
        
        bot.sendMessage(chatId, `✅ Print job complete!\nTotal Cost: LKR ${totalCost}`);
        await cleanupJobFiles(activeJob);
        return;
    }
}

function renderProgressBar(percent) {
    const totalBlocks = 10;
    const filledBlocks = Math.round((percent / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
}

async function trackHardwarePrint(chatId, initialMessage, filePath, copies, expectedPages) {
    const printResult = await printFile(filePath, copies);
    let jobId = null;
    
    if (printResult.success && printResult.stdout) {
        const match = printResult.stdout.match(/request id is ([^\s]+)/);
        if (match) jobId = match[1];
    }
    
    const sentMsg = await bot.sendMessage(chatId, `🖨️ *${initialMessage}...*\n[░░░░░░░░░░] 0%\n\n_Spooling pages to Canon G3010..._`, { parse_mode: 'Markdown' });
    const messageId = sentMsg.message_id;

    if (!jobId) {
        // Fallback if no job id is parsed, just wait a few seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
        await bot.editMessageText(`🖨️ *${initialMessage}...*\n[██████████] 100% Complete!\n\n_Finished!_`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        return;
    }

    return new Promise(resolve => {
        let elapsed = 0;
        const expectedTimeMs = (expectedPages || 1) * copies * 3000 || 5000;

        const interval = setInterval(async () => {
            elapsed += 2500;
            let percent = Math.floor((elapsed / expectedTimeMs) * 100);
            if (percent > 90) percent = 90;

            const statusResult = await getPrinterStatus();
            const isActive = statusResult.success && statusResult.stdout && statusResult.stdout.includes(jobId);

            if (!isActive) {
                clearInterval(interval);
                percent = 100;
                const bar = renderProgressBar(percent);
                // Wrap in try-catch in case the message is exactly the same and Telegram throws 400 Bad Request
                try {
                    await bot.editMessageText(`🖨️ *${initialMessage}...*\n[${bar}] 100% Complete!\n\n_Hardware processing finished!_`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
                } catch (e) {}
                resolve();
            } else {
                const bar = renderProgressBar(percent);
                const currPage = Math.min(Math.ceil((percent / 100) * expectedPages), expectedPages) || 1;
                try {
                    await bot.editMessageText(`🖨️ *${initialMessage}...*\n[${bar}] ${percent}%\n\n_Printing page ${currPage} of ${expectedPages}..._`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
                } catch (e) {}
            }
        }, 2500);
    });
}

async function cleanupJobFiles(job) {
    const filesToDelete = [job.filepath, job.odd_filepath, job.even_filepath].filter(Boolean);
    
    for (const file of filesToDelete) {
        try {
            await fs.promises.unlink(file);
            logger.log(`[GARBAGE COLLECTION] Deleted file: ${file}`);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                logger.error(`[GARBAGE COLLECTION] Failed to delete ${file}: ${err.message}`);
            }
        }
    }
}

module.exports = { connectToTelegram };
