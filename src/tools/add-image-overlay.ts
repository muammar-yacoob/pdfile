import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PDFDocument } from 'pdf-lib';

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
	canvasWidth?: number; // Original canvas width (for coordinate scaling)
	canvasHeight?: number; // Original canvas height (for coordinate scaling)
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
				await execAsync(
					`convert "${options.imagePath}" "PNG32:${tempPngPath}"`,
				);
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

			// Calculate scaling factors if canvas dimensions provided
			const scaleX = options.canvasWidth ? pageWidth / options.canvasWidth : 1;
			const scaleY = options.canvasHeight ? pageHeight / options.canvasHeight : 1;

			// Calculate position and size (scale from canvas to PDF if needed)
			const canvasWidth = options.width ?? imageDims.width;
			const canvasHeight = options.height ?? imageDims.height;
			const width = canvasWidth * scaleX;
			const height = canvasHeight * scaleY;

			const canvasX = options.x ?? (options.canvasWidth ? (options.canvasWidth - canvasWidth) / 2 : (pageWidth - width) / 2);
			const x = canvasX * scaleX;

			// Convert Y coordinate from top-left (canvas) to bottom-left (PDF)
			// Canvas: y=0 at top, PDF: y=0 at bottom
			const canvasY = options.y ?? (options.canvasHeight ? (options.canvasHeight - canvasHeight) / 2 : (pageHeight - height) / 2);
			const pdfY_topLeft = canvasY * scaleY;
			const y = pageHeight - pdfY_topLeft - height;

			const opacity = options.opacity ?? 1.0;
			const rotation = options.rotation ?? 0;

			console.log(`\n=== Image Drawing Details ===`);
			console.log(`Canvas dimensions: ${options.canvasWidth || 'N/A'}x${options.canvasHeight || 'N/A'}`);
			console.log(`Page size: ${pageWidth}x${pageHeight}`);
			console.log(`Scale factors: X=${scaleX.toFixed(4)}, Y=${scaleY.toFixed(4)}`);
			console.log(`Canvas position: x=${canvasX}, y=${canvasY}`);
			console.log(`Canvas size: ${canvasWidth}x${canvasHeight}`);
			console.log(`PDF Y (top-left): ${pdfY_topLeft.toFixed(2)}`);
			console.log(`PDF position: x=${x.toFixed(2)}, y=${y.toFixed(2)}`);
			console.log(`PDF size: ${width.toFixed(2)}x${height.toFixed(2)}`);
			console.log(`Final: x=${x.toFixed(2)}, y=${y.toFixed(2)}, w=${width.toFixed(2)}, h=${height.toFixed(2)}, opacity=${opacity}, rotation=${rotation}°`);

			// Validate dimensions
			if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
				throw new Error(
					`Invalid image dimensions: width=${width}, height=${height}`,
				);
			}
			if (!isFinite(x) || !isFinite(y)) {
				throw new Error(`Invalid image position: x=${x}, y=${y}`);
			}

			// Draw image
			try {
				// pdf-lib rotates around bottom-left corner of the image
				// If rotation is applied, we may need to adjust position
				const drawOptions: any = {
					x,
					y,
					width,
					height,
					opacity,
				};

				// Only add rotation if non-zero
				if (rotation !== 0) {
					drawOptions.rotate = { angle: rotation, type: 'degrees' };
					console.log(`Applying rotation: ${rotation}° around point (${x}, ${y})`);
				}

				page.drawImage(image, drawOptions);
				console.log(`✓ Image drawn successfully`);
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
