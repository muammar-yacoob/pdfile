import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

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
	dateText?: string; // Pre-formatted date text (overrides format)
	pages?: number[]; // Specific page numbers (0-indexed), or all pages if undefined
	rotation?: number; // Rotation angle in degrees
	bgColor?: { r: number; g: number; b: number }; // Background color
	// Font styling
	fontFamily?: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	// Text border
	borderColor?: { r: number; g: number; b: number };
	borderWidth?: number;
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
 * Load font from Google Fonts or use standard font
 */
async function loadFont(
	pdfDoc: PDFDocument,
	fontFamily: string,
	bold: boolean,
	italic: boolean,
): Promise<PDFFont> {
	// Map font family to appropriate variant
	const fontName = fontFamily || 'Helvetica';

	// Handle standard fonts
	const standardFonts: Record<string, StandardFonts> = {
		Helvetica: bold && italic
			? StandardFonts.HelveticaBoldOblique
			: bold
				? StandardFonts.HelveticaBold
				: italic
					? StandardFonts.HelveticaOblique
					: StandardFonts.Helvetica,
		'Times New Roman': bold && italic
			? StandardFonts.TimesRomanBoldItalic
			: bold
				? StandardFonts.TimesRomanBold
				: italic
					? StandardFonts.TimesRomanItalic
					: StandardFonts.TimesRoman,
		Courier: bold && italic
			? StandardFonts.CourierBoldOblique
			: bold
				? StandardFonts.CourierBold
				: italic
					? StandardFonts.CourierOblique
					: StandardFonts.Courier,
	};

	// Use standard font if available
	if (standardFonts[fontName]) {
		return await pdfDoc.embedFont(standardFonts[fontName]);
	}

	// For non-standard fonts, try to load from Google Fonts
	try {
		pdfDoc.registerFontkit(fontkit);

		// Determine font weight and style
		const weight = bold ? 700 : 400;
		const italicParam = italic ? 'ital,' : '';

		// Build Google Fonts URL
		const fontUrlName = fontName.replace(/ /g, '+');
		const fontUrl = `https://fonts.googleapis.com/css2?family=${fontUrlName}:${italicParam}wght@${weight}&display=swap`;

		// Fetch CSS to get font URL
		const cssResponse = await fetch(fontUrl);
		const cssText = await cssResponse.text();

		// Extract TTF/WOFF2 URL from CSS
		const urlMatch = cssText.match(/url\((https:\/\/[^)]+\.(?:ttf|woff2))\)/);
		if (!urlMatch) {
			console.warn(
				`Could not find font URL for ${fontName}, falling back to Helvetica`,
			);
			return await pdfDoc.embedFont(StandardFonts.Helvetica);
		}

		const fontFileUrl = urlMatch[1];

		// Fetch font file
		const fontResponse = await fetch(fontFileUrl);
		const fontBytes = await fontResponse.arrayBuffer();

		// Embed custom font
		const customFont = await pdfDoc.embedFont(fontBytes);
		return customFont;
	} catch (error) {
		console.warn(
			`Failed to load font ${fontName}, falling back to Helvetica:`,
			error,
		);
		return await pdfDoc.embedFont(StandardFonts.Helvetica);
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

		// Load font with style support
		const font = await loadFont(
			pdfDoc,
			options.fontFamily || 'Helvetica',
			options.bold || false,
			options.italic || false,
		);

		// Get date text (use provided text or format today's date)
		const dateText =
			options.dateText ??
			formatDate(new Date(), options.format ?? 'MM/DD/YYYY');

		// Determine which pages to apply date to
		const pages = pdfDoc.getPages();
		const targetPages = options.pages
			? options.pages.map((pageNum) => pages[pageNum])
			: pages;

		// Apply date to target pages
		const fontSize = options.fontSize ?? 12;
		const color = options.color ?? { r: 0, g: 0, b: 0 };
		const rotation = options.rotation ?? 0;

		for (const page of targetPages) {
			const { width, height } = page.getSize();

			// Calculate position (default: bottom right with padding)
			const textWidth = font.widthOfTextAtSize(dateText, fontSize);
			const textHeight = fontSize;
			const x = options.x ?? width - textWidth - 50;

			// CRITICAL FIX: Convert Y coordinate from top-left (canvas) to bottom-left (PDF)
			// Canvas: y=0 at top, PDF: y=0 at bottom
			const canvasY = options.y ?? 30;
			const y = height - canvasY - textHeight;

			// Draw background if specified
			if (options.bgColor) {
				page.drawRectangle({
					x: x - 2,
					y: y - 2,
					width: textWidth + 4,
					height: textHeight + 4,
					color: rgb(options.bgColor.r, options.bgColor.g, options.bgColor.b),
					rotate: { angle: rotation, type: 'degrees' },
				});
			}

			// Draw text border if specified
			if (options.borderColor && options.borderWidth) {
				const borderPadding = 2;
				page.drawRectangle({
					x: x - borderPadding,
					y: y - borderPadding,
					width: textWidth + borderPadding * 2,
					height: textHeight + borderPadding * 2,
					borderColor: rgb(
						options.borderColor.r,
						options.borderColor.g,
						options.borderColor.b,
					),
					borderWidth: options.borderWidth,
					rotate: { angle: rotation, type: 'degrees' },
				});
			}

			// Draw date text
			page.drawText(dateText, {
				x,
				y,
				size: fontSize,
				font,
				color: rgb(color.r, color.g, color.b),
				rotate: { angle: rotation, type: 'degrees' },
			});

			// Draw underline if specified
			if (options.underline) {
				const underlineY = y - 2;
				const underlineThickness = Math.max(1, fontSize / 12);
				page.drawRectangle({
					x,
					y: underlineY,
					width: textWidth,
					height: underlineThickness,
					color: rgb(color.r, color.g, color.b),
					rotate: { angle: rotation, type: 'degrees' },
				});
			}
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
