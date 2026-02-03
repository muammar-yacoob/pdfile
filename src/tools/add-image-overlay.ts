import { PDFDocument } from 'pdf-lib';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface AddImageOverlayConfig {
	extensions: string[];
	outputSuffix: string;
}

export const config: AddImageOverlayConfig = {
	extensions: ['.pdf'],
	outputSuffix: '_with_overlay',
};

export interface ImageOverlayOptions {
	imagePath: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	opacity?: number;
	rotation?: number; // Rotation angle in degrees
	pages?: number[]; // Specific page numbers (0-indexed), or all pages if undefined
}

/**
 * Add an image overlay to a PDF
 * @param inputFile PDF file path
 * @param options Image overlay configuration
 * @param outputPath Output path for the modified PDF
 * @returns Success status
 */
export async function addImageOverlay(
	inputFile: string,
	options: ImageOverlayOptions,
	outputPath?: string,
): Promise<boolean> {
	try {
		console.log(`\n=== addImageOverlay called ===`);
		console.log(`Input file: ${inputFile}`);
		console.log(`Image path: ${options.imagePath}`);
		console.log(`Options:`, options);

		// Verify input file exists
		try {
			await fs.access(inputFile);
		} catch (err) {
			throw new Error(`Input PDF file does not exist: ${inputFile}`);
		}

		// Verify image file exists
		try {
			await fs.access(options.imagePath);
		} catch (err) {
			throw new Error(`Image file does not exist: ${options.imagePath}`);
		}

		// Load PDF
		const pdfBytes = await fs.readFile(inputFile);
		const pdfDoc = await PDFDocument.load(pdfBytes);

		// Load image
		const imageBytes = await fs.readFile(options.imagePath);
		const imageExt = path.extname(options.imagePath).toLowerCase();

		let image;
		if (imageExt === '.png') {
			image = await pdfDoc.embedPng(imageBytes);
		} else if (imageExt === '.jpg' || imageExt === '.jpeg') {
			image = await pdfDoc.embedJpg(imageBytes);
		} else {
			// For other formats, convert to PNG using ImageMagick
			const { checkImageMagick } = await import('../lib/magick.js');
			const hasImageMagick = await checkImageMagick();

			if (!hasImageMagick) {
				throw new Error(
					`Image format '${imageExt}' requires ImageMagick. Install it with: sudo apt install imagemagick`,
				);
			}

			const { exec } = await import('node:child_process');
			const { promisify } = await import('node:util');
			const { tmpdir } = await import('node:os');
			const execAsync = promisify(exec);

			// Convert to PNG
			const tempPngPath = path.join(tmpdir(), `temp_${Date.now()}.png`);
			try {
				await execAsync(`convert "${options.imagePath}" "PNG32:${tempPngPath}"`);
				const pngBuffer = await fs.readFile(tempPngPath);
				image = await pdfDoc.embedPng(pngBuffer);
				await fs.unlink(tempPngPath);
			} catch (error) {
				throw new Error(
					`Failed to convert ${imageExt} to PNG: ${(error as Error).message}`,
				);
			}
		}

		// Get image dimensions
		const imageDims = image.scale(1);

		// Determine which pages to apply overlay to
		const pages = pdfDoc.getPages();
		const targetPages = options.pages
			? options.pages.map((pageNum) => pages[pageNum])
			: pages;

		// Apply overlay to target pages
		for (const page of targetPages) {
			const { width: pageWidth, height: pageHeight } = page.getSize();

			// Calculate position and size
			const width = options.width ?? imageDims.width;
			const height = options.height ?? imageDims.height;
			const x = options.x ?? (pageWidth - width) / 2;

			// CRITICAL FIX: Convert Y coordinate from top-left (canvas) to bottom-left (PDF)
			// Canvas: y=0 at top, PDF: y=0 at bottom
			const canvasY = options.y ?? (pageHeight - height) / 2;
			const y = pageHeight - canvasY - height;

			const opacity = options.opacity ?? 1.0;
			const rotation = options.rotation ?? 0;

			console.log(`Drawing image: x=${x}, y=${y}, w=${width}, h=${height}, opacity=${opacity}, rotation=${rotation}`);
			console.log(`Page size: ${pageWidth}x${pageHeight}`);

			// Validate dimensions
			if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
				throw new Error(`Invalid image dimensions: width=${width}, height=${height}`);
			}
			if (!isFinite(x) || !isFinite(y)) {
				throw new Error(`Invalid image position: x=${x}, y=${y}`);
			}

			// Draw image
			try {
				page.drawImage(image, {
					x,
					y,
					width,
					height,
					opacity,
					rotate: { angle: rotation, type: 'degrees' },
				});
			} catch (drawError) {
				console.error('drawImage failed:', drawError);
				throw drawError;
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
		console.log(`✓ PDF with image overlay saved to: ${outputFilePath}`);

		// Verify the file was created
		const stats = await fs.stat(outputFilePath);
		console.log(`File size: ${stats.size} bytes`);

		return true;
	} catch (error) {
		console.error('Error adding image overlay:', error);
		if (error instanceof Error) {
			console.error('Error details:', error.message);
			console.error('Stack:', error.stack);
		}
		return false;
	}
}
