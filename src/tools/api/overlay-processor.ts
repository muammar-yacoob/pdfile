/**
 * Overlay processing helper - applies overlays sequentially to a PDF
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { addImageOverlay } from '../add-image-overlay.js';
import { addSignature } from '../add-signature.js';
import { insertDate } from '../insert-date.js';
import { parseColor } from './utils.js';

export interface Overlay {
	type: 'date' | 'text' | 'image' | 'signature' | 'rectangle';
	pageIndex?: number;
	x: number;
	y: number;
	width?: number;
	height?: number;
	fontSize?: number;
	textColor?: string;
	bgColor?: string;
	fillColor?: string;
	fillAlpha?: number;
	rotation?: number;
	opacity: number;
	dateText?: string;
	format?: string;
	imageData?: string;
	removeBackground?: boolean;
	borderFade?: number;
	// Font styling
	fontFamily?: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	// Highlight
	highlightColor?: string;
	highlightBlur?: number;
	// Letter spacing
	letterSpacing?: number;
	// Canvas dimensions for coordinate conversion
	canvasWidth?: number;
	canvasHeight?: number;
}

/**
 * Process overlays sequentially, applying each to the PDF
 */
export async function processOverlays(
	currentFile: string,
	overlays: Overlay[],
	outputDir: string,
	tmpDir: string,
	originalFile: string,
): Promise<{ finalFile: string; tempFiles: string[] }> {
	const tempFiles: string[] = [];
	const { PDFDocument } = await import('pdf-lib');

	// Load PDF once to get page dimensions for coordinate conversion
	const pdfBytes = await readFile(currentFile);
	const pdfDoc = await PDFDocument.load(pdfBytes);
	const pages = pdfDoc.getPages();

	for (let i = 0; i < overlays.length; i++) {
		const overlay = overlays[i];
		const isLast = i === overlays.length - 1;
		const outputPath = isLast
			? join(outputDir, basename(originalFile).replace(/\.pdf$/i, '_abused.pdf'))
			: join(tmpDir, `temp_overlay_${i}_${Date.now()}.pdf`);

		console.log(
			`\n=== Processing overlay ${i + 1}/${overlays.length} (${overlay.type}) ===`,
		);
		console.log(`Current input file: ${currentFile}`);
		console.log(`Output file: ${outputPath}`);
		console.log(`Is last: ${isLast}`);

		// Get actual PDF page dimensions for coordinate conversion
		const pageIndex = overlay.pageIndex ?? 0;
		const page = pages[pageIndex];
		const { width: pdfWidth, height: pdfHeight } = page.getSize();

		// Calculate scale factors from canvas to PDF coordinates
		const scaleX = overlay.canvasWidth ? pdfWidth / overlay.canvasWidth : 1;
		const scaleY = overlay.canvasHeight ? pdfHeight / overlay.canvasHeight : 1;

		console.log(`Canvas dimensions: ${overlay.canvasWidth} x ${overlay.canvasHeight}`);
		console.log(`PDF page dimensions: ${pdfWidth} x ${pdfHeight}`);
		console.log(`Scale factors: X=${scaleX.toFixed(4)}, Y=${scaleY.toFixed(4)}`);

		// Convert canvas coordinates to PDF coordinates
		const pdfX = overlay.x * scaleX;
		const pdfY = overlay.y * scaleY;
		const pdfWidth_overlay = overlay.width ? overlay.width * scaleX : undefined;
		const pdfHeight_overlay = overlay.height ? overlay.height * scaleY : undefined;
		const pdfFontSize = overlay.fontSize ? overlay.fontSize * scaleX : undefined;

		console.log(`Canvas coords: x=${overlay.x}, y=${overlay.y}, fontSize=${overlay.fontSize}`);
		console.log(`PDF coords: x=${pdfX.toFixed(2)}, y=${pdfY.toFixed(2)}, fontSize=${pdfFontSize?.toFixed(2)}`);

		let success = false;

		if (overlay.type === 'date' || overlay.type === 'text') {
			success = await insertDate(
				currentFile,
				{
					dateText: overlay.dateText || '',
					format: overlay.format,
					fontSize: pdfFontSize,
					color: parseColor(overlay.textColor),
					bgColor: overlay.bgColor ? parseColor(overlay.bgColor) : undefined,
					rotation: overlay.rotation || 0,
					x: pdfX,
					y: pdfY,
					pages: overlay.pageIndex !== undefined ? [overlay.pageIndex] : undefined,
					fontFamily: overlay.fontFamily,
					bold: overlay.bold,
					italic: overlay.italic,
					underline: overlay.underline,
					highlightColor: overlay.highlightColor
						? parseColor(overlay.highlightColor)
						: undefined,
					highlightBlur: overlay.highlightBlur ? overlay.highlightBlur * scaleX : 0,
					letterSpacing: overlay.letterSpacing ? overlay.letterSpacing * scaleX : undefined,
				},
				outputPath,
			);
		} else if (overlay.type === 'image') {
			let imagePath: string;
			try {
				// Extract image data
				const imageDataParts = overlay.imageData!.split(',');
				if (imageDataParts.length !== 2) {
					throw new Error(
						`Invalid image data format (expected data:type;base64,data)`,
					);
				}

				const imageBuffer = Buffer.from(imageDataParts[1], 'base64');
				console.log(`Image buffer size: ${imageBuffer.length} bytes`);

				// Determine image format from data URL
				const mimeType =
					imageDataParts[0].match(/data:(.+);base64/)?.[1] || 'image/png';
				console.log(`Image MIME type: ${mimeType}`);

				// Use correct file extension based on MIME type
				const imageExt =
					mimeType === 'image/jpeg'
						? 'jpg'
						: mimeType === 'image/png'
							? 'png'
							: mimeType.split('/')[1] || 'png';
				imagePath = join(tmpDir, `overlay_${i}_${Date.now()}.${imageExt}`);
				await writeFile(imagePath, imageBuffer);
				tempFiles.push(imagePath);

				console.log(
					`Image overlay dimensions: x=${overlay.x}, y=${overlay.y}, w=${overlay.width}, h=${overlay.height}`,
				);
			} catch (imageError) {
				console.error(`Failed to process image data:`, imageError);
				throw new Error(
					`Failed to process image data: ${(imageError as Error).message}`,
				);
			}

			// Use signature processing if removeBackground is true
			if (overlay.removeBackground) {
				success = await addSignature(
					currentFile,
					{
						signatureFile: imagePath,
						x: pdfX,
						y: pdfY,
						width: pdfWidth_overlay,
						height: pdfHeight_overlay,
						opacity: overlay.opacity / 100,
						rotation: overlay.rotation || 0,
						removeBg: true,
						pages: overlay.pageIndex !== undefined ? [overlay.pageIndex] : undefined,
					},
					outputPath,
				);
			} else {
				success = await addImageOverlay(
					currentFile,
					{
						imagePath,
						x: pdfX,
						y: pdfY,
						width: pdfWidth_overlay,
						height: pdfHeight_overlay,
						opacity: overlay.opacity / 100,
						rotation: overlay.rotation || 0,
						pages: overlay.pageIndex !== undefined ? [overlay.pageIndex] : undefined,
					},
					outputPath,
				);
			}

			if (!success) {
				console.error(
					`Failed to apply image overlay with dimensions: ${overlay.width}x${overlay.height}`,
				);
				throw new Error(
					`Image overlay returned false - check logs above for details`,
				);
			}
		} else if (overlay.type === 'signature') {
			const imageBuffer = Buffer.from(overlay.imageData!.split(',')[1], 'base64');
			const imagePath = join(tmpDir, `signature_${Date.now()}.png`);
			await writeFile(imagePath, imageBuffer);
			tempFiles.push(imagePath);

			success = await addSignature(
				currentFile,
				{
					signatureFile: imagePath,
					x: pdfX,
					y: pdfY,
					width: pdfWidth_overlay,
					height: pdfHeight_overlay,
					opacity: overlay.opacity / 100,
					rotation: overlay.rotation || 0,
					removeBg: overlay.removeBackground !== false,
					pages: overlay.pageIndex !== undefined ? [overlay.pageIndex] : undefined,
				},
				outputPath,
			);
		} else if (overlay.type === 'rectangle') {
			// Draw rectangle directly with pdf-lib
			const { PDFDocument, rgb } = await import('pdf-lib');
			const rectPdfBytes = await readFile(currentFile);
			const rectPdfDoc = await PDFDocument.load(rectPdfBytes);

			const rectPageIndex = overlay.pageIndex || 0;
			const rectPage = rectPdfDoc.getPages()[rectPageIndex];
			const { height: pageHeight } = rectPage.getSize();

			// Parse fill color
			const fillColor = overlay.fillColor || '#000000';
			const r = Number.parseInt(fillColor.slice(1, 3), 16) / 255;
			const g = Number.parseInt(fillColor.slice(3, 5), 16) / 255;
			const b = Number.parseInt(fillColor.slice(5, 7), 16) / 255;
			const fillAlpha = overlay.fillAlpha !== undefined ? overlay.fillAlpha : 0.5;

			// Use pre-calculated scaled coordinates
			const rectX = pdfX;
			const rectY = pageHeight - pdfY - (pdfHeight_overlay || 0);
			const rectWidth = pdfWidth_overlay || 100;
			const rectHeight = pdfHeight_overlay || 100;

			const rotation = overlay.rotation || 0;
			const borderFade = overlay.borderFade || 0;

			// Draw border fade layers if specified
			if (borderFade > 0) {
				const steps = Math.ceil(borderFade / 2);
				const fadeScale = borderFade * scaleX; // Scale the fade width

				for (let step = steps; step > 0; step--) {
					const offset = (fadeScale / steps) * step;
					const opacity = fillAlpha * (1 - step / (steps + 1));

					rectPage.drawRectangle({
						x: rectX - offset,
						y: rectY - offset,
						width: rectWidth + offset * 2,
						height: rectHeight + offset * 2,
						color: rgb(r, g, b),
						opacity: opacity,
						borderRadius: offset * 0.2,
						rotate: { angle: rotation, type: 'degrees' },
					});
				}
			}

			// Draw main rectangle
			rectPage.drawRectangle({
				x: rectX,
				y: rectY,
				width: rectWidth,
				height: rectHeight,
				color: rgb(r, g, b),
				opacity: fillAlpha * (overlay.opacity / 100),
				borderRadius: 2,
				rotate: { angle: rotation, type: 'degrees' },
			});

			const modifiedPdfBytes = await rectPdfDoc.save({ useObjectStreams: true });
			await writeFile(outputPath, modifiedPdfBytes);
			success = true;
		}

		if (!success) {
			console.error(`Overlay ${i} failed!`);
			throw new Error(`Failed to apply ${overlay.type} overlay`);
		}

		console.log(`Overlay ${i} succeeded!`);

		// Verify output file was created
		if (!existsSync(outputPath)) {
			throw new Error(`Output file not created: ${outputPath}`);
		}
		console.log(`Output file verified: ${outputPath}`);

		if (!isLast) {
			if (currentFile !== originalFile && existsSync(currentFile)) {
				console.log(`Adding old currentFile to temp cleanup: ${currentFile}`);
				tempFiles.push(currentFile);
			}
			console.log(`Updating currentFile from ${currentFile} to ${outputPath}`);
			currentFile = outputPath;
		} else {
			console.log(`Final overlay - setting currentFile to ${outputPath}`);
			currentFile = outputPath;
		}
	}

	console.log(`\n=== All overlays processed successfully ===`);

	return { finalFile: currentFile, tempFiles };
}
