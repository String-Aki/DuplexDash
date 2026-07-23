const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, 'duplex.log');

function formatMessage(message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] ${message}\n`;
}

function log(message) {
    const formatted = formatMessage(message);
    console.log(formatted.trim());
    fs.appendFileSync(logFilePath, formatted);
}

function error(message) {
    const formatted = formatMessage(`ERROR: ${message}`);
    console.error(formatted.trim());
    fs.appendFileSync(logFilePath, formatted);
}

module.exports = { log, error };
