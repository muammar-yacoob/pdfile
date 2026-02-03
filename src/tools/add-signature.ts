import { PDFDocument } from 'pdf-lib';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';

const execAsync = promisify(exec);

export interface AddSignatureConfig {
	extensions: string[];
	outputSuffix: string;
}

export const config: AddSignatureConfig = {
	extensions: ['.pdf'],
	outputSuffix: '_signed',
};

export interface SignatureOptions {
	signatureFile: string; // Path to PNG signature file
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	opacity?: number;
	pages?: number[]; // Specific page numbers (0-indexed), or all pages if undefined
	// Transparency removal options (applied automatically)
	removeBg?: boolean; // Default: true
	fuzz?: number; // Default: 15
	feather?: number; // Feathering radius (default: 2)
}

/**
 * Check if ImageMagick is available
 */
async function checkImageMagick(): Promise<boolean> {
	try {
		await execAsync('magick --version');
		return true;
	} catch {
		try {
			await execAsync('convert --version');
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Get the magick command (either 'magick' or 'convert' for older versions)
 */
async function getMagickCommand(): Promise<string> {
	try {
		await execAsync('magick --version');
		return 'magick';
	} catch {
		return 'convert';
	}
}

/**
 * Remove background from PNG signature using ImageMagick
 * Uses edge-aware flood-fill approach: removes only border/background colors
 * while preserving inner details, with smooth feathering for clean edges
 */
async function processSignature(
	inputFile: string,
	fuzz: number,
	feather: number,
): Promise<string> {
	// Create temp file for processed signature
	const tempFile = path.join(
		tmpdir(),
		`pdfile-signature-${Date.now()}-processed.png`,
	);

	const magickCmd = await getMagickCommand();

	// Auto-detect background color by sampling corner pixels
	let bgColor = 'white';
	try {
		const sampleCmd =
			magickCmd === 'magick'
				? `magick "${inputFile}" -format "%[pixel:u.p{0,0}]" info:`
				: `convert "${inputFile}" -format "%[pixel:u.p{0,0}]" info:`;
		const { stdout } = await execAsync(sampleCmd);
		bgColor = stdout.trim();
	} catch {
		// Fall back to white if detection fails
		bgColor = 'white';
	}

	try {
		// Calculate feather blur radius (0.5 to 3 pixels based on feather amount 0-100)
		const featherRadius = feather > 0 ? 0.5 + (feather / 100) * 2.5 : 0;

		// Edge-aware background removal with feathering
		// This uses flood-fill from borders only, not affecting inner colors
		// -bordercolor: sets the color to detect at edges
		// -border 1x1: adds 1px border to ensure edge detection works
		// -fill none -fuzz X% -draw "matte 0,0 floodfill": flood-fills from edges
		// -shave 1x1: removes the temporary border
		// -channel A -blur: feathers the alpha channel for smooth edges
		const cmd =
			magickCmd === 'magick'
				? `magick "${inputFile}" -bordercolor "${bgColor}" -border 1x1 -fill none -fuzz ${fuzz}% -draw "matte 0,0 floodfill" -shave 1x1 ${featherRadius > 0 ? `-channel A -blur 0x${featherRadius} +channel` : ''} "${tempFile}"`
				: `convert "${inputFile}" -bordercolor "${bgColor}" -border 1x1 -fill none -fuzz ${fuzz}% -draw "matte 0,0 floodfill" -shave 1x1 ${featherRadius > 0 ? `-channel A -blur 0x${featherRadius} +channel` : ''} "${tempFile}"`;

		await execAsync(cmd);

		return tempFile;
	} catch (error) {
		console.error('Error processing signature:', error);
		throw error;
	}
}

/**
 * Add signature to a PDF document
 * @param inputFile PDF file path
 * @param options Signature insertion configuration
 * @param outputPath Output path for the modified PDF
 * @returns Success status
 */
export async function addSignature(
	inputFile: string,
	options: SignatureOptions,
	outputPath?: string,
): Promise<boolean> {
	try {
		// Validate signature file
		const signatureExt = path.extname(options.signatureFile).toLowerCase();
		if (signatureExt !== '.png') {
			throw new Error('Signature file must be in PNG format');
		}

		// Check if signature file exists
		try {
			await fs.access(options.signatureFile);
		} catch {
			throw new Error(`Signature file not found: ${options.signatureFile}`);
		}

		// Process signature if background removal is enabled
		const removeBg = options.removeBg ?? true;
		const fuzz = options.fuzz ?? 20;
		const feather = options.feather ?? 50;

		let processedSignature = options.signatureFile;

		if (removeBg) {
			// Check ImageMagick availability
			if (!(await checkImageMagick())) {
				console.warn(
					'ImageMagick not found. Signature will be used without background removal.',
				);
				console.warn('Install ImageMagick: sudo apt install imagemagick');
			} else {
				console.log('Processing signature (removing background)...');
				processedSignature = await processSignature(
					options.signatureFile,
					fuzz,
					feather,
				);
			}
		}

		// Load PDF
		const pdfBytes = await fs.readFile(inputFile);
		const pdfDoc = await PDFDocument.load(pdfBytes);

		// Load processed signature
		const signatureBytes = await fs.readFile(processedSignature);
		const signatureImage = await pdfDoc.embedPng(signatureBytes);

		// Get signature dimensions
		const signatureDims = signatureImage.scale(1);

		// Determine which pages to apply signature to
		const pages = pdfDoc.getPages();
		const targetPages = options.pages
			? options.pages.map((pageNum) => pages[pageNum])
			: [pages[pages.length - 1]]; // Default: last page only

		// Apply signature to target pages
		for (const page of targetPages) {
			const { width: pageWidth, height: pageHeight } = page.getSize();

			// Calculate position (default: bottom right with padding)
			const sigWidth = options.width ?? signatureDims.width * 0.3; // 30% of original
			const sigHeight =
				options.height ??
				(signatureDims.height * sigWidth) / signatureDims.width;

			const x = options.x ?? pageWidth - sigWidth - 50;
			const y = options.y ?? 80;
			const opacity = options.opacity ?? 1.0;

			// Draw signature
			page.drawImage(signatureImage, {
				x,
				y,
				width: sigWidth,
				height: sigHeight,
				opacity,
			});
		}

		// Cleanup temp file if created
		if (processedSignature !== options.signatureFile) {
			try {
				await fs.unlink(processedSignature);
			} catch {
				// Ignore cleanup errors
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
		console.log(`✓ Signed PDF saved to: ${outputFilePath}`);

		return true;
	} catch (error) {
		console.error('Error adding signature:', error);
		return false;
	}
}
