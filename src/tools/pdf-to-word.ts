import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';
import {
	Document,
	Packer,
	Paragraph,
	TextRun,
	HeadingLevel,
	PageBreak,
} from 'docx';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface PdfToWordConfig {
	extensions: string[];
	outputSuffix: string;
}

export const config: PdfToWordConfig = {
	extensions: ['.pdf'],
	outputSuffix: '_converted',
};

/**
 * Convert PDF to Word document
 * @param inputFile PDF file path
 * @param outputPath Output path for the Word document
 * @returns Success status
 */
export async function pdfToWord(
	inputFile: string,
	outputPath?: string,
): Promise<boolean> {
	try {
		// Read PDF file
		const pdfBuffer = await fs.readFile(inputFile);

		// Parse PDF to extract text
		const pdfData = await pdfParse(pdfBuffer);

		// Create Word document
		const paragraphs: Paragraph[] = [];

		// Split text into paragraphs
		const lines = pdfData.text.split('\n');

		for (const line of lines) {
			const trimmedLine = line.trim();

			if (trimmedLine.length === 0) {
				// Add empty paragraph for spacing
				paragraphs.push(new Paragraph({ text: '' }));
				continue;
			}

			// Check if line looks like a heading (all caps or short lines)
			const isHeading =
				trimmedLine.length < 100 &&
				(trimmedLine === trimmedLine.toUpperCase() ||
					/^[A-Z][a-z\s]+:/.test(trimmedLine));

			if (isHeading) {
				paragraphs.push(
					new Paragraph({
						text: trimmedLine,
						heading: HeadingLevel.HEADING_2,
					}),
				);
			} else {
				paragraphs.push(
					new Paragraph({
						children: [new TextRun(trimmedLine)],
					}),
				);
			}
		}

		// Create document
		const doc = new Document({
			sections: [
				{
					properties: {},
					children: paragraphs,
				},
			],
		});

		// Generate Word file
		const buffer = await Packer.toBuffer(doc);

		// Determine output path
		const outputFilePath =
			outputPath ||
			path.join(
				path.dirname(inputFile),
				`${path.basename(inputFile, '.pdf')}${config.outputSuffix}.docx`,
			);

		await fs.writeFile(outputFilePath, buffer);
		console.log(`✓ Word document saved to: ${outputFilePath}`);

		return true;
	} catch (error) {
		console.error('Error converting PDF to Word:', error);
		return false;
	}
}
