import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PDFDocument } from 'pdf-lib';

export interface RemovePagesConfig {
	extensions: string[];
	outputSuffix: string;
}

export const config: RemovePagesConfig = {
	extensions: ['.pdf'],
	outputSuffix: '_removed_pages',
};

/**
 * Remove specific pages from a PDF
 * @param inputFile PDF file path
 * @param pagesToRemove Array of page numbers to remove (1-indexed)
 * @param outputPath Output path for the modified PDF
 * @returns Success status
 */
export async function removePages(
	inputFile: string,
	pagesToRemove: number[],
	outputPath?: string,
): Promise<boolean> {
	try {
		if (pagesToRemove.length === 0) {
			throw new Error('No pages specified for removal');
		}

		// Load PDF
		const pdfBytes = await fs.readFile(inputFile);
		const pdfDoc = await PDFDocument.load(pdfBytes);

		const totalPages = pdfDoc.getPageCount();

		// Validate page numbers (convert to 0-indexed)
		const pagesToRemoveZeroIndexed = pagesToRemove
			.map((pageNum) => pageNum - 1)
			.filter((pageNum) => pageNum >= 0 && pageNum < totalPages)
			.sort((a, b) => b - a); // Sort in descending order to remove from end first

		if (pagesToRemoveZeroIndexed.length === 0) {
			throw new Error('No valid page numbers specified');
		}

		if (pagesToRemoveZeroIndexed.length === totalPages) {
			throw new Error('Cannot remove all pages from PDF');
		}

		// Remove pages (from end to start to maintain correct indices)
		for (const pageIndex of pagesToRemoveZeroIndexed) {
			pdfDoc.removePage(pageIndex);
		}

		// Determine output path
		const outputFilePath =
			outputPath ||
			path.join(
				path.dirname(inputFile),
				`${path.basename(inputFile, '.pdf')}${config.outputSuffix}.pdf`,
			);

		// Save with compression
		const savedPdfBytes = await pdfDoc.save({
			useObjectStreams: true,
			addDefaultPage: false,
		});

		await fs.writeFile(outputFilePath, savedPdfBytes);
		console.log(
			`✓ PDF with ${pagesToRemoveZeroIndexed.length} page(s) removed saved to: ${outputFilePath}`,
		);

		return true;
	} catch (error) {
		console.error('Error removing pages:', error);
		return false;
	}
}
