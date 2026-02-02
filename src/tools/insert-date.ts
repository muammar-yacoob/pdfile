import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface InsertDateConfig {
	extensions: string[];
	outputSuffix: string;
}

export const config: InsertDateConfig = {
	extensions: ['.pdf'],
	outputSuffix: '_with_date',
};

export interface DateInsertOptions {
	x?: number;
	y?: number;
	fontSize?: number;
	color?: { r: number; g: number; b: number };
	format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'Month DD, YYYY';
	pages?: number[]; // Specific page numbers (0-indexed), or all pages if undefined
}

/**
 * Format date according to specified format
 */
function formatDate(date: Date, format: string): string {
	const months = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	];

	const day = date.getDate();
	const month = date.getMonth() + 1;
	const year = date.getFullYear();
	const monthName = months[date.getMonth()];

	switch (format) {
		case 'MM/DD/YYYY':
			return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
		case 'DD/MM/YYYY':
			return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
		case 'YYYY-MM-DD':
			return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
		case 'Month DD, YYYY':
			return `${monthName} ${day}, ${year}`;
		default:
			return `${month}/${day}/${year}`;
	}
}

/**
 * Insert today's date into a PDF
 * @param inputFile PDF file path
 * @param options Date insertion configuration
 * @param outputPath Output path for the modified PDF
 * @returns Success status
 */
export async function insertDate(
	inputFile: string,
	options: DateInsertOptions,
	outputPath?: string,
): Promise<boolean> {
	try {
		// Load PDF
		const pdfBytes = await fs.readFile(inputFile);
		const pdfDoc = await PDFDocument.load(pdfBytes);

		// Get font
		const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

		// Format today's date
		const today = new Date();
		const dateFormat = options.format ?? 'MM/DD/YYYY';
		const dateText = formatDate(today, dateFormat);

		// Determine which pages to apply date to
		const pages = pdfDoc.getPages();
		const targetPages = options.pages
			? options.pages.map((pageNum) => pages[pageNum])
			: pages;

		// Apply date to target pages
		const fontSize = options.fontSize ?? 12;
		const color = options.color ?? { r: 0, g: 0, b: 0 };

		for (const page of targetPages) {
			const { width, height } = page.getSize();

			// Calculate position (default: bottom right with padding)
			const textWidth = font.widthOfTextAtSize(dateText, fontSize);
			const x = options.x ?? width - textWidth - 50;
			const y = options.y ?? 30;

			// Draw date text
			page.drawText(dateText, {
				x,
				y,
				size: fontSize,
				font,
				color: rgb(color.r, color.g, color.b),
			});
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
		console.log(`✓ PDF with date saved to: ${outputFilePath}`);

		return true;
	} catch (error) {
		console.error('Error inserting date:', error);
		return false;
	}
}
