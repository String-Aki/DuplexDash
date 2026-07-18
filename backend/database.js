const Database = require('better-sqlite3');
const path = require('path');

// Initialize database in the backend directory
const dbPath = path.join(__dirname, 'duplexdash.db');
const db = new Database(dbPath);

/**
 * Initialize the database tables if they don't exist
 */
function initDB() {
    // PrintJobs table: persistent state for screen timeouts and job tracking
    db.exec(`
        CREATE TABLE IF NOT EXISTS PrintJobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            odd_filepath TEXT,
            even_filepath TEXT,
            original_pages INTEGER NOT NULL,
            printed_pages INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'waiting_for_flip', 'printed', 'failed'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migrate existing table if necessary
    try {
        db.exec("ALTER TABLE PrintJobs ADD COLUMN odd_filepath TEXT");
        db.exec("ALTER TABLE PrintJobs ADD COLUMN even_filepath TEXT");
    } catch (e) {
        // Columns already exist
    }

    // Settings table: tracking inventory and LKR financial metrics
    db.exec(`
        CREATE TABLE IF NOT EXISTS Settings (
            id INTEGER PRIMARY KEY CHECK (id = 1), -- Ensure only one settings row
            lkr_price_per_page REAL NOT NULL,
            paper_inventory INTEGER NOT NULL,
            ink_level REAL NOT NULL -- Percentage (0.0 to 100.0)
        )
    `);

    // Seed default settings if none exist
    const settingsCount = db.prepare('SELECT COUNT(*) as count FROM Settings').get();
    if (settingsCount.count === 0) {
        const stmt = db.prepare('INSERT INTO Settings (id, lkr_price_per_page, paper_inventory, ink_level) VALUES (?, ?, ?, ?)');
        // Defaults: 10 LKR per page, 500 sheets of paper, 100% ink
        stmt.run(1, 10.0, 500, 100.0);
        console.log('Database seeded with default settings.');
    }
}

initDB();

module.exports = db;
