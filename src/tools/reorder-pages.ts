import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PDFDocument } from 'pdf-lib';

export interface ReorderPagesConfig {
	extensions: string[];
	outputSuffix: string;
}

export const config: ReorderPagesConfig = {
	extensions: ['.pdf'],
	outputSuffix: '_reordered',
};

/**
 * Reorder pages in a PDF
 * @param inputFile PDF file path
 * @param newOrder Array of page numbers in desired order (1-indexed)
 * @param outputPath Output path for the modified PDF
 * @returns Success status
 */
export async function reorderPages(
	inputFile: string,
	newOrder: number[],
	outputPath?: string,
): Promise<boolean> {
	try {
		// Load PDF
		const pdfBytes = await fs.readFile(inputFile);
		const sourcePdf = await PDFDocument.load(pdfBytes);

		const totalPages = sourcePdf.getPageCount();

		// Validate and convert to 0-indexed
		const newOrderZeroIndexed = newOrder.map((pageNum) => pageNum - 1);

		if (newOrderZeroIndexed.length !== totalPages) {
			throw new Error(
				`New order must include all ${totalPages} pages. Received ${newOrderZeroIndexed.length} page numbers.`,
			);
		}

		for (const pageIndex of newOrderZeroIndexed) {
			if (pageIndex < 0 || pageIndex >= totalPages) {
				throw new Error(
					`Invalid page number: ${pageIndex + 1}. PDF has ${totalPages} pages.`,
				);
			}
		}

		// Check for duplicate page numbers
		const uniquePages = new Set(newOrderZeroIndexed);
		if (uniquePages.size !== totalPages) {
			throw new Error('Duplicate page numbers detected in new order');
		}

		// Create new PDF with reordered pages
		const newPdf = await PDFDocument.create();

		for (const pageIndex of newOrderZeroIndexed) {
			const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageIndex]);
			newPdf.addPage(copiedPage);
		}

		// Determine output path
		const outputFilePath =
			outputPath ||
			path.join(
				path.dirname(inputFile),
				`${path.basename(inputFile, '.pdf')}${config.outputSuffix}.pdf`,
			);

		// Save with compression
		const savedPdfBytes = await newPdf.save({
			useObjectStreams: true,
			addDefaultPage: false,
		});

		await fs.writeFile(outputFilePath, savedPdfBytes);
		console.log(`✓ Reordered PDF saved to: ${outputFilePath}`);

		return true;
	} catch (error) {
		console.error('Error reordering pages:', error);
		return false;
	}
}

/**
 * Move a single page up or down in the PDF
 * @param inputFile PDF file path
 * @param pageNumber Page number to move (1-indexed)
 * @param direction Direction to move ('up' or 'down')
 * @param outputPath Output path for the modified PDF
 * @returns Success status
 */
export async function movePage(
	inputFile: string,
	pageNumber: number,
	direction: 'up' | 'down',
	outputPath?: string,
): Promise<boolean> {
	try {
		// Load PDF to get page count
		const pdfBytes = await fs.readFile(inputFile);
		const pdfDoc = await PDFDocument.load(pdfBytes);
		const totalPages = pdfDoc.getPageCount();

		// Convert to 0-indexed
		const pageIndex = pageNumber - 1;

		if (pageIndex < 0 || pageIndex >= totalPages) {
			throw new Error(`Invalid page number: ${pageNumber}`);
		}

		// Calculate new position
		let newIndex = pageIndex;
		if (direction === 'up' && pageIndex > 0) {
			newIndex = pageIndex - 1;
		} else if (direction === 'down' && pageIndex < totalPages - 1) {
			newIndex = pageIndex + 1;
		} else {
			throw new Error(
				`Cannot move page ${pageNumber} ${direction}. It's already at the ${direction === 'up' ? 'top' : 'bottom'}.`,
			);
		}

		// Create new order
		const currentOrder = Array.from({ length: totalPages }, (_, i) => i + 1);

		// Swap pages
		[currentOrder[pageIndex], currentOrder[newIndex]] = [
			currentOrder[newIndex],
			currentOrder[pageIndex],
		];

		// Use reorderPages function
		return await reorderPages(inputFile, currentOrder, outputPath);
	} catch (error) {
		console.error('Error moving page:', error);
		return false;
	}
}
