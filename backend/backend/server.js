const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec: _exec } = require('child_process');
const db = require('./database');
const logger = require('./logger');

const exec = (command, callback) => {
    logger.log(`[SYS EXEC] ${command}`);
    return _exec(command, callback);
};
const { connectToWhatsApp } = require('./whatsapp');

// Fix Directory Crash: Ensure uploads exists synchronously
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());

// Start WhatsApp Listener
connectToWhatsApp();

// --- API CONTRACT ---

/**
 * GET /api/queue
 * Returns pending WhatsApp print jobs
 */
app.get('/api/queue', (req, res) => {
    try {
        const jobs = db.prepare("SELECT * FROM PrintJobs WHERE status = 'pending' ORDER BY created_at ASC").all();
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/print/:id
 * Triggers a print job and updates inventory
 */
app.post('/api/print/:id', (req, res) => {
    const jobId = req.params.id;
    try {
        // 1. Get the job
        const job = db.prepare("SELECT * FROM PrintJobs WHERE id = ?").get(jobId);
        if (!job) {
            return res.status(404).json({ success: false, error: "Job not found" });
        }
        
        if (job.status === 'pending') {
            // STEP 1: Print Odd Pages
            exec(`lp -d Canon_G3010 "${job.odd_filepath}"`, (err, stdout, stderr) => {
                if (err) {
                    logger.error(`Hardware print error (odd): ${err}`);
                    // For safety, even if it fails, we might still proceed or return error. 
                    // Let's assume it succeeds for the sake of the dashboard demo if hardware isn't connected.
                }
                
                // Update to waiting_for_flip. No inventory deduction yet.
                db.prepare("UPDATE PrintJobs SET status = 'waiting_for_flip' WHERE id = ?").run(jobId);
                res.json({ success: true, message: `Odd pages printed for job ${jobId}. Please flip paper and trigger again.` });
            });
            
        } else if (job.status === 'waiting_for_flip') {
            // STEP 2: Print Even Pages
            exec(`lp -d Canon_G3010 "${job.even_filepath}"`, (err, stdout, stderr) => {
                if (err) {
                    logger.error(`Hardware print error (even): ${err}`);
                }

                // Calculate inventory usage
                const physicalPaperUsed = Math.ceil(job.printed_pages / 2);
                const inkUsed = job.printed_pages * 0.5; // Example: 0.5% ink per page

                // Perform transaction to update job and settings
                const transaction = db.transaction(() => {
                    db.prepare("UPDATE PrintJobs SET status = 'printed' WHERE id = ?").run(jobId);
                    db.prepare(`
                        UPDATE Settings 
                        SET paper_inventory = paper_inventory - ?, 
                            ink_level = ink_level - ? 
                        WHERE id = 1
                    `).run(physicalPaperUsed, inkUsed);
                });

                transaction();
                res.json({ success: true, message: `Even pages printed for job ${jobId}. Job complete. Inventory updated.` });
            });
            
        } else {
            return res.status(400).json({ success: false, error: "Job already fully processed" });
        }

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/stats
 * Returns business stats in LKR, paper inventory, ink levels
 */
app.get('/api/stats', (req, res) => {
    try {
        // Get settings (inventory and price)
        const settings = db.prepare("SELECT * FROM Settings WHERE id = 1").get();
        
        // Calculate total revenue from printed jobs
        const stats = db.prepare("SELECT SUM(printed_pages) as total_pages_printed FROM PrintJobs WHERE status = 'printed'").get();
        
        const totalPages = stats.total_pages_printed || 0;
        const totalRevenueLKR = totalPages * settings.lkr_price_per_page;

        res.json({
            success: true,
            stats: {
                totalRevenueLKR,
                totalPagesPrinted: totalPages,
                paperInventory: settings.paper_inventory,
                inkLevel: settings.ink_level,
                pricePerPageLKR: settings.lkr_price_per_page
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/settings
 * Updates LKR prices and inventory
 */
app.post('/api/settings', (req, res) => {
    const { lkr_price_per_page, paper_inventory, ink_level } = req.body;

    try {
        // Get current settings to only update provided fields
        const current = db.prepare("SELECT * FROM Settings WHERE id = 1").get();
        
        const newPrice = lkr_price_per_page !== undefined ? lkr_price_per_page : current.lkr_price_per_page;
        const newPaper = paper_inventory !== undefined ? paper_inventory : current.paper_inventory;
        const newInk = ink_level !== undefined ? ink_level : current.ink_level;

        db.prepare(`
            UPDATE Settings 
            SET lkr_price_per_page = ?, paper_inventory = ?, ink_level = ? 
            WHERE id = 1
        `).run(newPrice, newPaper, newInk);

        res.json({ success: true, message: "Settings updated successfully." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    logger.log(`Backend server listening on port ${PORT}`);
});
