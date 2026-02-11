import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PDFDocument, degrees } from 'pdf-lib';

export interface RotatePagesConfig {
	extensions: string[];
	outputSuffix: string;
}

export const config: RotatePagesConfig = {
	extensions: ['.pdf'],
	outputSuffix: '_rotated',
};

/**
 * Rotate specific pages in a PDF
 * @param inputFile PDF file path
 * @param pageNumbers Array of page numbers to rotate (1-indexed). If empty, rotates all pages.
 * @param rotation Rotation angle in degrees (90, 180, 270, or -90)
 * @param outputPath Output path for the modified PDF
 * @returns Success status
 */
export async function rotatePages(
	inputFile: string,
	pageNumbers: number[],
	rotation: number,
	outputPath?: string,
): Promise<boolean> {
	try {
		// Validate rotation angle
		const validRotations = [90, 180, 270, -90];
		if (!validRotations.includes(rotation)) {
			throw new Error(
				'Invalid rotation angle. Must be 90, 180, 270, or -90 degrees',
			);
		}

		// Load PDF
		const pdfBytes = await fs.readFile(inputFile);
		const pdfDoc = await PDFDocument.load(pdfBytes);

		const totalPages = pdfDoc.getPageCount();

		// If no page numbers provided, rotate all pages
		const pagesToRotate =
			pageNumbers.length === 0
				? Array.from({ length: totalPages }, (_, i) => i + 1)
				: pageNumbers;

		// Validate and convert to 0-indexed
		const pagesToRotateZeroIndexed = pagesToRotate
			.map((pageNum) => pageNum - 1)
			.filter((pageNum) => pageNum >= 0 && pageNum < totalPages);

		if (pagesToRotateZeroIndexed.length === 0) {
			throw new Error('No valid page numbers specified');
		}

		// Rotate pages
		for (const pageIndex of pagesToRotateZeroIndexed) {
			const page = pdfDoc.getPage(pageIndex);
			const currentRotation = page.getRotation().angle;
			page.setRotation(degrees(currentRotation + rotation));
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
			`✓ PDF with ${pagesToRotateZeroIndexed.length} page(s) rotated ${rotation}° saved to: ${outputFilePath}`,
		);

		return true;
	} catch (error) {
		console.error('Error rotating pages:', error);
		return false;
	}
}
