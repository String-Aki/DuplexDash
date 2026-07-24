const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const logger = require('./logger');

/**
 * Prints a file using CUPS
 * @param {string} filepath - Path to the file to print
 * @param {number} copies - Number of copies
 * @param {string} printer - Printer name (default: Canon_G3010)
 * @returns {Promise<Object>} Output of the print command
 */
async function printFile(filepath, copies = 1, printer = 'Canon_G3010') {
    try {
        // Hardcoded to strictly demand A4 sizing
        const command = `lp -d ${printer} -o media=A4 -n ${copies} "${filepath}"`;
        logger.log(`Executing print command: ${command}`);
        const { stdout, stderr } = await execAsync(command);
        return { success: true, stdout, stderr };
    } catch (error) {
        logger.error(`Error executing print command: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Gets the status of printers/jobs
 * @returns {Promise<Object>} Output of lpstat command
 */
async function getPrinterStatus() {
    try {
        const command = `lpstat -p -d`;
        const { stdout, stderr } = await execAsync(command);
        return { success: true, stdout, stderr };
    } catch (error) {
        logger.error(`Error executing lpstat: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Cancels a specific print job or all jobs on a printer
 * @param {string} printer - Printer name to cancel
 * @returns {Promise<Object>} Output of cancel command
 */
async function cancelPrintJob(printer = 'Canon_G3010') {
    try {
        const command = `cancel -a ${printer}`;
        logger.log(`Executing cancel command: ${command}`);
        const { stdout, stderr } = await execAsync(command);
        return { success: true, stdout, stderr };
    } catch (error) {
        logger.error(`Error executing cancel: ${error.message}`);
        return { success: false, error: error.message };
    }
}

module.exports = {
    printFile,
    getPrinterStatus,
    cancelPrintJob
};
