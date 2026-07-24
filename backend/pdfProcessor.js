const { PDFDocument, PageSizes } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Processes a PDF file for duplex printing.
 * Applies 'Smart Padding' by injecting a blank page if the total pages are odd.
 * Splits the document into odd and even files.
 * 
 * @param {string} inputFilePath - Path to the incoming PDF file.
 * @param {string} outputFilePath - Base path to save the processed PDF files.
 * @returns {Promise<Object>} - Statistics and paths about the processed PDF.
 */
async function processPDFForDuplex(inputFilePath, outputFilePath) {
    try {
        // Read the existing PDF
        const existingPdfBytes = await fs.readFile(inputFilePath);
        
        // Load the PDF document
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        
        // Force all incoming pages to standard A4 dimensions
        const pages = pdfDoc.getPages();
        const a4Width = PageSizes.A4[0];
        const a4Height = PageSizes.A4[1];
        
        for (const page of pages) {
            const { width, height } = page.getSize();
            page.scale(a4Width / width, a4Height / height);
        }

        // Get the original number of pages
        const originalPageCount = pdfDoc.getPageCount();
        let finalPageCount = originalPageCount;

        // Apply 'Smart Padding' if pages are odd
        if (originalPageCount % 2 !== 0) {
            // Add a blank page to make it even for duplex printing
            pdfDoc.addPage();
            finalPageCount = pdfDoc.getPageCount();
            logger.log(`Smart Padding applied to ${inputFilePath}: Added 1 blank page. Original: ${originalPageCount}, New: ${finalPageCount}`);
        }

        // Calculate required physical paper
        const physicalPaperRequired = Math.ceil(finalPageCount / 2);

        // Split into odd and even documents
        const oddDoc = await PDFDocument.create();
        const evenDoc = await PDFDocument.create();
        
        const oddIndices = [];
        const evenIndices = [];
        for (let i = 0; i < finalPageCount; i++) {
            if (i % 2 === 0) oddIndices.push(i); // 1st page, 3rd page, etc (0-indexed)
            else evenIndices.push(i); // 2nd page, 4th page, etc
        }

        const oddPages = await oddDoc.copyPages(pdfDoc, oddIndices);
        oddPages.forEach(page => oddDoc.addPage(page));
        
        const evenPages = await evenDoc.copyPages(pdfDoc, evenIndices);
        evenPages.forEach(page => evenDoc.addPage(page));

        // Save the modified PDFs
        const parsed = path.parse(outputFilePath);
        const oddPath = path.join(parsed.dir, `${parsed.name}_odd.pdf`);
        const evenPath = path.join(parsed.dir, `${parsed.name}_even.pdf`);

        await fs.writeFile(oddPath, await oddDoc.save());
        await fs.writeFile(evenPath, await evenDoc.save());

        return {
            originalPages: originalPageCount,
            printedPages: finalPageCount,
            physicalPaperRequired: physicalPaperRequired,
            oddPath: oddPath,
            evenPath: evenPath,
            success: true
        };

    } catch (error) {
        logger.error(`Error processing PDF ${inputFilePath}: ${error}`);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    processPDFForDuplex
};
