import { PDFDocument } from 'pdf-lib';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface MergePdfsConfig {
	extensions: string[];
	outputSuffix: string;
}

export const config: MergePdfsConfig = {
	extensions: ['.pdf'],
	outputSuffix: '_merged',
};

/**
 * Merge multiple PDF files into a single PDF
 * @param inputFiles Array of PDF file paths to merge
 * @param outputPath Output path for the merged PDF
 * @returns Success status
 */
export async function mergePdfs(
	inputFiles: string[],
	outputPath?: string,
): Promise<boolean> {
	try {
		if (inputFiles.length < 2) {
			throw new Error('At least 2 PDF files are required to merge');
		}

		// Create a new PDF document
		const mergedPdf = await PDFDocument.create();

		// Load and copy pages from each input file
		for (const filePath of inputFiles) {
			const pdfBytes = await fs.readFile(filePath);
			const pdf = await PDFDocument.load(pdfBytes);
			const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());

			for (const page of copiedPages) {
				mergedPdf.addPage(page);
			}
		}

		// Determine output path
		const outputFilePath =
			outputPath ||
			path.join(
				path.dirname(inputFiles[0]),
				`${path.basename(inputFiles[0], '.pdf')}${config.outputSuffix}.pdf`,
			);

		// Save with compression
		const pdfBytes = await mergedPdf.save({
			useObjectStreams: true,
			addDefaultPage: false,
		});

		await fs.writeFile(outputFilePath, pdfBytes);
		console.log(`✓ Merged PDF saved to: ${outputFilePath}`);

		return true;
	} catch (error) {
		console.error('Error merging PDFs:', error);
		return false;
	}
}
