import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { ToolConfig } from '../cli/tools.js';
import {
	cleanupSignalFiles,
	signalLoadingComplete,
} from '../lib/edge-launcher.js';
import { wslToWindows } from '../lib/paths.js';
import { addImageOverlay } from './add-image-overlay.js';
import { addSignature } from './add-signature.js';
import { insertDate } from './insert-date.js';
import { mergePdfs } from './merge-pdfs.js';
import { pdfToWord } from './pdf-to-word.js';
import { removePages } from './remove-pages.js';
import { reorderPages } from './reorder-pages.js';
import { rotatePages } from './rotate-pages.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** PDFile unified tool config */
export const config: ToolConfig = {
	id: 'pdfile',
	name: 'PDFile',
	icon: 'pdfile.ico',
	extensions: ['.pdf'],
};

/**
 * Open PDFile GUI with all PDF tools
 */
export async function runGUI(file: string): Promise<boolean> {
	// Clean up any stale signal files from previous sessions
	cleanupSignalFiles();

	return new Promise((promiseResolve) => {
		// Track current working file (may change after merges) - ensure absolute path
		let currentWorkingFile = resolve(file);

		console.log('=== PDFile GUI Starting ===');
		console.log(`WSL Path (internal): ${currentWorkingFile}`);
		console.log(`Windows Path (display): ${wslToWindows(currentWorkingFile)}`);

		const app = express();
		app.use(express.json({ limit: '50mb' }));
		app.use(express.urlencoded({ extended: true, limit: '50mb' }));

		// Disable caching
		app.use((_req, res, next) => {
			res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
			res.set('Pragma', 'no-cache');
			res.set('Expires', '0');
			next();
		});

		// Serve static files
		const guiDir = join(__dirname, 'gui');
		const iconsDir = join(__dirname, 'icons');
		app.use(express.static(guiDir));
		app.use('/icons', express.static(iconsDir));

		// Serve favicon
		app.get('/favicon.ico', (_req, res) => {
			res.sendFile(join(iconsDir, 'pdfile.ico'));
		});

		// Serve main PDFile interface
		app.get('/', (_req, res) => {
			res.sendFile(join(guiDir, 'pdfile.html'));
		});

		// API endpoint to get file info
		app.get('/api/file', (_req, res) => {
			res.json({
				fileName: basename(currentWorkingFile),
				filePath: wslToWindows(currentWorkingFile),
			});
		});

		// Serve the actual PDF file for preview
		app.get('/pdf/:filename', (_req, res) => {
			// Ensure currentWorkingFile exists, fallback to original file
			const fileToServe = existsSync(currentWorkingFile) ? currentWorkingFile : resolve(file);
			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', 'inline');
			res.sendFile(fileToServe);
		});

		// API endpoint to update current working file (after merge)
		app.post('/api/update-working-file', async (req, res) => {
			try {
				const { pdfData } = req.body;
				if (!pdfData) {
					return res.status(400).json({ error: 'No PDF data provided' });
				}

				const tmpDir = join(__dirname, 'temp');
				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				// Save the PDF data to a temporary file
				const pdfBuffer = Buffer.from(pdfData.split(',')[1], 'base64');
				const tempPath = join(tmpDir, `working_${Date.now()}.pdf`);
				await writeFile(tempPath, pdfBuffer);

				console.log(`[Server] Updating working file from ${currentWorkingFile} to ${tempPath}`);

				// Delete the old working file if it exists and is in temp directory
				const oldWorkingFile = currentWorkingFile;
				if (oldWorkingFile && oldWorkingFile.includes('/temp/working_') && existsSync(oldWorkingFile)) {
					console.log(`[Server] Cleaning up old working file: ${oldWorkingFile}`);
					unlink(oldWorkingFile).catch((err) => console.warn('Failed to delete old working file:', err));
				}

				// Update the current working file
				currentWorkingFile = tempPath;

				console.log(`[Server] Working file updated successfully: ${tempPath}`);
				res.json({ success: true, filePath: wslToWindows(tempPath) });
			} catch (error) {
				console.error('Update working file error:', error);
				res.status(500).json({ error: 'Failed to update working file' });
			}
		});

		// API: Export PDF with merged pages and overlays
		app.post('/api/export-pdf', async (req, res) => {
			try {
				const {
					hasMergedPages,
					hasReordering,
					pageOrder,
					overlays,
					mergedPagesData,
				} = req.body;

				console.log('\n=== Export PDF Started ===');
				console.log(`Current working file: ${currentWorkingFile}`);
				console.log(`Working file exists: ${existsSync(currentWorkingFile)}`);

				const tmpDir = join(__dirname, 'temp');
				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				// Create PDFile subdirectory in source file's directory
				const sourceDir = dirname(file);
				const outputDir = join(sourceDir, 'PDFile');
				await mkdir(outputDir, { recursive: true });

				// Ensure currentWorkingFile exists, fallback to original file
				if (!existsSync(currentWorkingFile)) {
					console.warn(`[Export] Warning: currentWorkingFile ${currentWorkingFile} does not exist, using original file: ${file}`);
					currentWorkingFile = resolve(file);
				}

				let currentFile = currentWorkingFile;
				console.log(`[Export] Using file for export: ${currentFile}`);
				const tempFiles: string[] = [];

				// Step 1: Handle merged pages or reordering if needed
				if (
					(hasMergedPages || hasReordering) &&
					pageOrder &&
					pageOrder.length > 0
				) {
					const { PDFDocument } = await import('pdf-lib');
					const pdfBytes = await readFile(currentWorkingFile);
					const srcDoc = await PDFDocument.load(pdfBytes);
					const newDoc = await PDFDocument.create();

					// Copy pages in the specified order
					for (const pageInfo of pageOrder) {
						const pageIndex = pageInfo.pageNum - 1;
						const [copiedPage] = await newDoc.copyPages(srcDoc, [pageIndex]);
						newDoc.addPage(copiedPage);
					}

					// Save merged/reordered PDF
					const reorderedPath = join(tmpDir, `reordered_${Date.now()}.pdf`);
					const reorderedBytes = await newDoc.save({ useObjectStreams: true });
					await writeFile(reorderedPath, reorderedBytes);
					currentFile = reorderedPath;
					tempFiles.push(reorderedPath);
				}

				// Step 2: Apply overlays if any
				if (overlays && overlays.length > 0) {
					console.log(`\n=== Processing ${overlays.length} overlays ===`);

					const parseColor = (hex: string) => {
						if (!hex) return undefined;
						const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
						const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
						const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
						return { r, g, b };
					};

					// Load PDF once to get page dimensions for coordinate conversion
					const { PDFDocument } = await import('pdf-lib');
					const pdfBytes = await readFile(currentFile);
					const pdfDoc = await PDFDocument.load(pdfBytes);
					const pages = pdfDoc.getPages();

					console.log(`PDF has ${pages.length} pages`);

					// Filter out overlays with invalid page indices
					const validOverlays = overlays.filter((overlay, i) => {
						const pageIndex = overlay.pageIndex ?? 0;
						if (pageIndex < 0 || pageIndex >= pages.length) {
							console.warn(`Skipping overlay ${i} (${overlay.type}): pageIndex ${pageIndex} is out of bounds (PDF has ${pages.length} pages)`);
							return false;
						}
						return true;
					});

					if (validOverlays.length === 0) {
						console.log('No valid overlays to process - skipping overlay step');
					} else if (validOverlays.length < overlays.length) {
						console.warn(`${overlays.length - validOverlays.length} overlay(s) were skipped due to invalid page indices`);
					}

					for (let i = 0; i < validOverlays.length; i++) {
						const overlay = validOverlays[i];
						const isLast = i === validOverlays.length - 1;
						const outputPath = isLast
							? join(outputDir, basename(file).replace(/\.pdf$/i, '_abused.pdf'))
							: join(tmpDir, `temp_overlay_${i}_${Date.now()}.pdf`);

						console.log(
							`\n=== Processing overlay ${i + 1}/${overlays.length} (${overlay.type}) ===`,
						);
						console.log(`Current input file: ${currentFile}`);
						console.log(`Output file: ${outputPath}`);
						console.log(`Is last: ${isLast}`);

						// Get actual PDF page dimensions for coordinate conversion
						const pageIndex = overlay.pageIndex ?? 0;
						console.log(`Overlay pageIndex: ${pageIndex}, Total pages: ${pages.length}`);

						// Page is already validated in the filter above
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

						if (overlay.type === 'date') {
							success = await insertDate(
								currentFile,
								{
									dateText: overlay.dateText,
									format: overlay.format,
									fontSize: overlay.fontSize,
									color: parseColor(overlay.textColor),
									bgColor: overlay.bgColor
										? parseColor(overlay.bgColor)
										: undefined,
									rotation: overlay.rotation || 0,
									x: overlay.x,
									y: overlay.y,
									canvasWidth: overlay.canvasWidth,
									canvasHeight: overlay.canvasHeight,
									pages:
										overlay.pageIndex !== undefined
											? [overlay.pageIndex]
											: undefined,
							// Font styling
							fontFamily: overlay.fontFamily,
							bold: overlay.bold,
							italic: overlay.italic,
							underline: overlay.underline,
							// Text highlight
							highlightColor: overlay.highlightColor
								? parseColor(overlay.highlightColor)
								: undefined,
							highlightBlur: overlay.highlightBlur,
								},
								outputPath,
							);
						} else if (overlay.type === 'image') {
							let imagePath: string;
							try {
								// Extract image data
								const imageDataParts = overlay.imageData.split(',');
								if (imageDataParts.length !== 2) {
									throw new Error(
										`Invalid image data format (expected data:type;base64,data)`,
									);
								}

								const imageBuffer = Buffer.from(imageDataParts[1], 'base64');
								console.log(`Image buffer size: ${imageBuffer.length} bytes`);

								// Determine image format from data URL
								const mimeType =
									imageDataParts[0].match(/data:(.+);base64/)?.[1] ||
									'image/png';
								console.log(`Image MIME type: ${mimeType}`);

								// Use correct file extension based on MIME type
								const imageExt =
									mimeType === 'image/jpeg'
										? 'jpg'
										: mimeType === 'image/png'
											? 'png'
											: mimeType.split('/')[1] || 'png';
								imagePath = join(
									tmpDir,
									`overlay_${i}_${Date.now()}.${imageExt}`,
								);
								await writeFile(imagePath, imageBuffer);
								tempFiles.push(imagePath);

								// Log dimensions for debugging
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
										x: overlay.x,
										y: overlay.y,
										width: overlay.width,
										height: overlay.height,
										canvasWidth: overlay.canvasWidth,
										canvasHeight: overlay.canvasHeight,
										opacity: overlay.opacity / 100,
										rotation: overlay.rotation || 0,
										removeBg: true,
										pages:
											overlay.pageIndex !== undefined
												? [overlay.pageIndex]
												: undefined,
									},
									outputPath,
								);
							} else {
								success = await addImageOverlay(
									currentFile,
									{
										imagePath,
										x: overlay.x,
										y: overlay.y,
										width: overlay.width,
										height: overlay.height,
										canvasWidth: overlay.canvasWidth,
										canvasHeight: overlay.canvasHeight,
										opacity: overlay.opacity / 100,
										rotation: overlay.rotation || 0,
										pages:
											overlay.pageIndex !== undefined
												? [overlay.pageIndex]
												: undefined,
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
							const imageBuffer = Buffer.from(
								overlay.imageData.split(',')[1],
								'base64',
							);
							const imagePath = join(tmpDir, `signature_${Date.now()}.png`);
							await writeFile(imagePath, imageBuffer);
							tempFiles.push(imagePath);

							success = await addSignature(
								currentFile,
								{
									signatureFile: imagePath,
									x: overlay.x,
									y: overlay.y,
									width: overlay.width,
									height: overlay.height,
									canvasWidth: overlay.canvasWidth,
									canvasHeight: overlay.canvasHeight,
									opacity: overlay.opacity / 100,
									rotation: overlay.rotation || 0,
									removeBg: overlay.removeBackground !== false,
									pages:
										overlay.pageIndex !== undefined
											? [overlay.pageIndex]
											: undefined,
								},
								outputPath,
							);
						} else if (overlay.type === 'rectangle') {
							// Draw rectangle directly with pdf-lib
							const { PDFDocument, rgb } = await import('pdf-lib');
							const pdfBytes = await readFile(currentFile);
							const pdfDoc = await PDFDocument.load(pdfBytes);

							const pageIndex = overlay.pageIndex || 0;
							const page = pdfDoc.getPages()[pageIndex];
							const { width: pageWidth_rect, height: pageHeight_rect } = page.getSize();

							// Parse fill color
							const fillColor = overlay.fillColor || '#000000';
							const r = Number.parseInt(fillColor.slice(1, 3), 16) / 255;
							const g = Number.parseInt(fillColor.slice(3, 5), 16) / 255;
							const b = Number.parseInt(fillColor.slice(5, 7), 16) / 255;
							const fillAlpha = overlay.fillAlpha !== undefined ? overlay.fillAlpha : 0.5;

							// Calculate scaled dimensions from canvas coordinates
							const canvasRectX = overlay.x;
							const canvasRectY = overlay.y;
							const canvasRectWidth = overlay.width || 100;
							const canvasRectHeight = overlay.height || 100;

							const rectX = canvasRectX * scaleX;
							const rectY = pageHeight_rect - (canvasRectY * scaleY) - (canvasRectHeight * scaleY);
							const rectWidth = canvasRectWidth * scaleX;
							const rectHeight = canvasRectHeight * scaleY;

							const rotation = overlay.rotation || 0;
							const borderFade = overlay.borderFade || 0;

							// Draw border fade layers if specified
							if (borderFade > 0) {
								const steps = Math.ceil(borderFade / 2);
								const fadeScale = borderFade * scaleX; // Scale the fade width

								for (let step = steps; step > 0; step--) {
									const offset = (fadeScale / steps) * step;
									const opacity = fillAlpha * (1 - step / (steps + 1));

									page.drawRectangle({
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
							page.drawRectangle({
								x: rectX,
								y: rectY,
								width: rectWidth,
								height: rectHeight,
								color: rgb(r, g, b),
								opacity: fillAlpha * (overlay.opacity / 100),
								borderRadius: 2,
								rotate: { angle: rotation, type: 'degrees' },
							});

							const modifiedPdfBytes = await pdfDoc.save({ useObjectStreams: true });
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
							if (currentFile !== file && existsSync(currentFile)) {
								console.log(
									`Adding old currentFile to temp cleanup: ${currentFile}`,
								);
								tempFiles.push(currentFile);
							}
							console.log(
								`Updating currentFile from ${currentFile} to ${outputPath}`,
							);
							currentFile = outputPath;
						} else {
							console.log(
								`Final overlay - setting currentFile to ${outputPath}`,
							);
							currentFile = outputPath;
						}
					}

					console.log(`\n=== All overlays processed successfully ===`);
				}

				// Return the final file
				// If no changes were made, save a copy to PDFile subdirectory
				if (currentFile === currentWorkingFile) {
					const { copyFile } = await import('node:fs/promises');
					const finalOutput = join(outputDir, basename(file).replace(/\.pdf$/i, '_exported.pdf'));
					await copyFile(currentWorkingFile, finalOutput);
					currentFile = finalOutput;
				}

				if (existsSync(currentFile)) {
					// Clean up temp files
					tempFiles.forEach((f) => unlink(f).catch(() => {}));

					// Return the saved file path instead of downloading
					// Convert to Windows path for proper display and folder opening
					const windowsPath = wslToWindows(currentFile);
					console.log(`\n=== Export Complete ===`);
					console.log(`WSL Path (internal): ${currentFile}`);
					console.log(`Windows Path (returned): ${windowsPath}`);
					res.json({
						success: true,
						filePath: windowsPath,
						fileName: basename(currentFile),
					});
				} else {
					res.status(500).json({ error: 'Failed to create output file' });
				}
			} catch (error) {
				console.error('Export PDF error:', error);
				if (error instanceof Error) {
					console.error('Error stack:', error.stack);
				}
				res.status(500).json({
					error: 'Internal server error: ' + (error as Error).message,
					stack: error instanceof Error ? error.stack : undefined,
				});
			}
		});

		// API: Export PDF V2 - Simple canvas capture approach
		app.post('/api/export-pdf-v2', async (req, res) => {
			try {
				const {
					hasMergedPages,
					hasReordering,
					pageOrder,
					capturedPages,
					mergedPagesData,
				} = req.body;

				console.log('\n=== Export PDF V2 (Canvas Capture) Started ===');
				console.log(`Current working file: ${currentWorkingFile}`);
				console.log(`Captured pages: ${capturedPages?.length || 0}`);

				const tmpDir = join(__dirname, 'temp');
				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				// Create PDFile subdirectory in source file's directory
				const sourceDir = dirname(file);
				const outputDir = join(sourceDir, 'PDFile');
				await mkdir(outputDir, { recursive: true });

				// Ensure currentWorkingFile exists, fallback to original file
				if (!existsSync(currentWorkingFile)) {
					console.warn(`[Export] Warning: currentWorkingFile ${currentWorkingFile} does not exist, using original file: ${file}`);
					currentWorkingFile = resolve(file);
				}

				let currentFile = currentWorkingFile;
				console.log(`[Export] Using file for export: ${currentFile}`);
				const tempFiles: string[] = [];

				// Step 1: Handle merged pages or reordering if needed
				if (
					(hasMergedPages || hasReordering) &&
					pageOrder &&
					pageOrder.length > 0
				) {
					const { PDFDocument } = await import('pdf-lib');
					const pdfBytes = await readFile(currentFile);
					const pdfDoc = await PDFDocument.load(pdfBytes);

					const newPdf = await PDFDocument.create();

					for (const item of pageOrder) {
						const pageIndex = item.pageNum - 1;
						const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIndex]);
						newPdf.addPage(copiedPage);
					}

					const reorderedPath = join(tmpDir, `reordered_${Date.now()}.pdf`);
					const reorderedBytes = await newPdf.save({ useObjectStreams: true });
					await writeFile(reorderedPath, reorderedBytes);
					tempFiles.push(reorderedPath);

					currentFile = reorderedPath;
					console.log(`✓ Pages reordered/merged, saved to: ${currentFile}`);
				}

				// Step 2: Replace pages with captured images
				if (capturedPages && capturedPages.length > 0) {
					const { PDFDocument } = await import('pdf-lib');
					const pdfBytes = await readFile(currentFile);
					const pdfDoc = await PDFDocument.load(pdfBytes);

					console.log(`\n=== Replacing ${capturedPages.length} Pages with Captured Images ===`);

					for (const captured of capturedPages) {
						const pageNum = captured.pageNum;
						const pageIndex = pageNum - 1;
						const imageData = captured.imageData;

						console.log(`Processing captured page ${pageNum}...`);

						// Extract base64 data from data URL
						const base64Data = imageData.split(',')[1];
						const imageBuffer = Buffer.from(base64Data, 'base64');

						// Embed PNG image
						const image = await pdfDoc.embedPng(imageBuffer);
						const imageDims = image.scale(1);

						// Get the page to replace
						const page = pdfDoc.getPages()[pageIndex];
						const { width: pageWidth, height: pageHeight } = page.getSize();

						console.log(`  Page size: ${pageWidth}x${pageHeight}`);
						console.log(`  Image size: ${imageDims.width}x${imageDims.height}`);

						// Clear the page content but keep the page dimensions
						// We'll draw the captured image over it
						page.drawImage(image, {
							x: 0,
							y: 0,
							width: pageWidth,
							height: pageHeight,
						});

						console.log(`  ✓ Page ${pageNum} replaced with captured image`);
					}

					// Save the modified PDF
					const finalPath = join(outputDir, `${basename(file, '.pdf')}_abused.pdf`);
					const finalBytes = await pdfDoc.save({ useObjectStreams: true });
					await writeFile(finalPath, finalBytes);

					console.log(`\n✓ Export complete: ${finalPath}`);

					// Clean up temp files
					for (const tempFile of tempFiles) {
						try {
							await unlink(tempFile);
						} catch (err) {
							console.warn(`Failed to delete temp file: ${tempFile}`);
						}
					}

					const windowsPath = wslToWindows(finalPath);
					res.json({
						success: true,
						filePath: windowsPath,
						fileName: basename(finalPath),
					});
				} else {
					// No captured pages, just save the current file
					const finalPath = join(outputDir, `${basename(file, '.pdf')}_abused.pdf`);
					await writeFile(finalPath, await readFile(currentFile));

					console.log(`\n✓ Export complete (no overlays): ${finalPath}`);

					// Clean up temp files
					for (const tempFile of tempFiles) {
						try {
							await unlink(tempFile);
						} catch (err) {
							console.warn(`Failed to delete temp file: ${tempFile}`);
						}
					}

					const windowsPath = wslToWindows(finalPath);
					res.json({
						success: true,
						filePath: windowsPath,
						fileName: basename(finalPath),
					});
				}
			} catch (error) {
				console.error('Export V2 error:', error);
				res.status(500).json({
					error: 'Failed to export PDF',
					details: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				});
			}
		});

		// API: Apply multiple overlays sequentially
		app.post('/api/apply-overlays', async (req, res) => {
			try {
				const { overlays } = req.body;

				if (!overlays || !Array.isArray(overlays) || overlays.length === 0) {
					return res.status(400).json({ error: 'No overlays provided' });
				}

				const tmpDir = join(__dirname, 'temp');
				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				// Calculate final output path (next to original with _abused.pdf suffix)
				const finalOutput = file.replace(/\.pdf$/i, '_abused.pdf');

				let currentFile = file;
				const tempFiles: string[] = [];

				// Process each overlay sequentially
				for (let i = 0; i < overlays.length; i++) {
					const overlay = overlays[i];
					const isLast = i === overlays.length - 1;
					const outputPath = isLast
						? finalOutput
						: join(tmpDir, `temp_${i}_${Date.now()}.pdf`);

					let success = false;

					if (overlay.type === 'date') {
						// Parse colors
						const parseColor = (hex: string) => {
							if (!hex) return undefined;
							const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
							const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
							const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
							return { r, g, b };
						};

						success = await insertDate(
							currentFile,
							{
								dateText: overlay.dateText,
								format: overlay.format,
								fontSize: overlay.fontSize,
								color: parseColor(overlay.textColor),
								bgColor: overlay.bgColor
									? parseColor(overlay.bgColor)
									: undefined,
								rotation: overlay.rotation || 0,
								x: overlay.x,
								y: overlay.y,
								pages:
									overlay.pageIndex !== undefined
										? [overlay.pageIndex]
										: undefined,
								// Font styling
								fontFamily: overlay.fontFamily,
								bold: overlay.bold,
								italic: overlay.italic,
								underline: overlay.underline,
								// Text highlight
								highlightColor: overlay.highlightColor
									? parseColor(overlay.highlightColor)
									: undefined,
							},
							outputPath,
						);
					} else if (overlay.type === 'image' || overlay.type === 'signature') {
						// Save base64 image to temp file
						const imageBuffer = Buffer.from(
							overlay.imageData.split(',')[1],
							'base64',
						);
						const imagePath = join(tmpDir, `overlay_${Date.now()}.png`);
						await writeFile(imagePath, imageBuffer);
						tempFiles.push(imagePath);

						// Use signature processing if removeBackground is true
						if (overlay.removeBackground) {
							success = await addSignature(
								currentFile,
								{
									signatureFile: imagePath,
									x: overlay.x,
									y: overlay.y,
									width: overlay.width,
									height: overlay.height,
									opacity: overlay.opacity / 100,
									rotation: overlay.rotation || 0,
									removeBg: true,
									pages:
										overlay.pageIndex !== undefined
											? [overlay.pageIndex]
											: undefined,
								},
								outputPath,
							);
						} else {
							success = await addImageOverlay(
								currentFile,
								{
									imagePath,
									x: overlay.x,
									y: overlay.y,
									width: overlay.width,
									height: overlay.height,
									opacity: overlay.opacity / 100,
									rotation: overlay.rotation || 0,
									pages:
										overlay.pageIndex !== undefined
											? [overlay.pageIndex]
											: undefined,
								},
								outputPath,
							);
						}
					} else if (overlay.type === 'rectangle') {
						// Draw rectangle directly with pdf-lib
						const { PDFDocument, rgb } = await import('pdf-lib');
						const pdfBytes = await readFile(currentFile);
						const pdfDoc = await PDFDocument.load(pdfBytes);

						const pageIndex = overlay.pageIndex || 0;
						const page = pdfDoc.getPages()[pageIndex];
						const { width: pageWidth, height: pageHeight } = page.getSize();

						// Parse fill color
						const fillColor = overlay.fillColor || '#000000';
						const r = Number.parseInt(fillColor.slice(1, 3), 16) / 255;
						const g = Number.parseInt(fillColor.slice(3, 5), 16) / 255;
						const b = Number.parseInt(fillColor.slice(5, 7), 16) / 255;
						const fillAlpha = overlay.fillAlpha !== undefined ? overlay.fillAlpha : 0.5;

						// Convert canvas coordinates to PDF coordinates
						const pdfX = (overlay.x / overlay.canvasWidth) * pageWidth;
						const pdfY = pageHeight - (overlay.y / overlay.canvasHeight) * pageHeight;
						const pdfWidth = (overlay.width / overlay.canvasWidth) * pageWidth;
						const pdfHeight = (overlay.height / overlay.canvasHeight) * pageHeight;

						const rotation = overlay.rotation || 0;
						const borderFade = overlay.borderFade || 0;

						// Draw border fade layers if specified
						if (borderFade > 0) {
							const steps = Math.ceil(borderFade / 2);
							const fadeScale = borderFade / overlay.canvasWidth * pageWidth;

							for (let step = steps; step > 0; step--) {
								const offset = (fadeScale / steps) * step;
								const opacity = fillAlpha * (1 - step / (steps + 1));

								page.drawRectangle({
									x: pdfX - offset,
									y: pdfY - pdfHeight - offset,
									width: pdfWidth + offset * 2,
									height: pdfHeight + offset * 2,
									color: rgb(r, g, b),
									opacity: opacity,
									borderRadius: offset * 0.2,
									rotate: { angle: rotation, type: 'degrees' },
								});
							}
						}

						// Draw main rectangle
						page.drawRectangle({
							x: pdfX,
							y: pdfY - pdfHeight,
							width: pdfWidth,
							height: pdfHeight,
							color: rgb(r, g, b),
							opacity: fillAlpha * (overlay.opacity / 100),
							borderRadius: 2,
							rotate: { angle: rotation, type: 'degrees' },
						});

						const modifiedPdfBytes = await pdfDoc.save({ useObjectStreams: true });
						await writeFile(outputPath, modifiedPdfBytes);
						success = true;
					}

					if (!success) {
						throw new Error(`Failed to apply ${overlay.type} overlay`);
					}

					// Update current file for next overlay
					if (!isLast) {
						// Only add intermediate temp files, never the original source file
						if (currentFile !== file) {
							tempFiles.push(currentFile);
						}
						currentFile = outputPath;
					}
				}

				if (existsSync(finalOutput)) {
					res.download(finalOutput, basename(finalOutput), (err) => {
						// Clean up intermediate temp files only (keep finalOutput)
						tempFiles.forEach((f) => unlink(f).catch(() => {}));
						if (err) {
							console.error('Download error:', err);
						}
					});
				} else {
					res.status(500).json({ error: 'Failed to create output file' });
				}
			} catch (error) {
				console.error('Apply overlays error:', error);
				res.status(500).json({
					error: 'Internal server error: ' + (error as Error).message,
				});
			}
		});

		// API: Get PDF page count
		app.get('/api/pdf-info', async (_req, res) => {
			try {
				const { PDFDocument } = await import('pdf-lib');
				const pdfBytes = await readFile(file);
				const pdfDoc = await PDFDocument.load(pdfBytes);
				res.json({
					pageCount: pdfDoc.getPageCount(),
					fileName: basename(file),
				});
			} catch (error) {
				console.error('PDF info error:', error);
				res.status(500).json({ error: 'Failed to read PDF info' });
			}
		});

		// API: Remove pages from PDF
		app.post('/api/remove-pages', async (req, res) => {
			try {
				const { pages } = req.body;
				if (!pages || !Array.isArray(pages) || pages.length === 0) {
					return res.status(400).json({ error: 'No pages specified' });
				}

				// Ensure currentWorkingFile exists, fallback to original file
				if (!existsSync(currentWorkingFile)) {
					console.warn(`Warning: currentWorkingFile ${currentWorkingFile} does not exist, using original file: ${file}`);
					currentWorkingFile = resolve(file);
				}

				// Check if trying to remove all pages
				const { PDFDocument } = await import('pdf-lib');
				const pdfBytes = await readFile(currentWorkingFile);
				const pdfDoc = await PDFDocument.load(pdfBytes);
				const totalPages = pdfDoc.getPageCount();

				if (pages.length >= totalPages) {
					return res.status(400).json({
						error: 'Cannot remove all pages. A PDF must have at least one page.'
					});
				}

				const tmpDir = join(__dirname, 'temp');
				const outputPath = join(
					tmpDir,
					`${basename(currentWorkingFile, '.pdf')}_removed_pages.pdf`,
				);

				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				const success = await removePages(currentWorkingFile, pages, outputPath);

				if (success && existsSync(outputPath)) {
					res.download(
						outputPath,
						`${basename(currentWorkingFile, '.pdf')}_removed_pages.pdf`,
						(err) => {
							unlink(outputPath).catch(() => {});
							if (err) {
								console.error('Download error:', err);
							}
						},
					);
				} else {
					res.status(500).json({ error: 'Page removal failed' });
				}
			} catch (error) {
				console.error('Remove pages error:', error);
				res.status(500).json({
					error: 'Internal server error: ' + (error as Error).message
				});
			}
		});

		// API: Reorder pages in PDF
		app.post('/api/reorder-pages', async (req, res) => {
			try {
				const { order } = req.body;
				if (!order || !Array.isArray(order) || order.length === 0) {
					return res.status(400).json({ error: 'No page order specified' });
				}

				// Ensure currentWorkingFile exists, fallback to original file
				if (!existsSync(currentWorkingFile)) {
					console.warn(`Warning: currentWorkingFile ${currentWorkingFile} does not exist, using original file: ${file}`);
					currentWorkingFile = resolve(file);
				}

				const tmpDir = join(__dirname, 'temp');
				const outputPath = join(
					tmpDir,
					`${basename(currentWorkingFile, '.pdf')}_reordered.pdf`,
				);

				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				const success = await reorderPages(currentWorkingFile, order, outputPath);

				if (success && existsSync(outputPath)) {
					res.download(
						outputPath,
						`${basename(currentWorkingFile, '.pdf')}_reordered.pdf`,
						(err) => {
							unlink(outputPath).catch(() => {});
							if (err) {
								console.error('Download error:', err);
							}
						},
					);
				} else {
					res.status(500).json({ error: 'Page reordering failed' });
				}
			} catch (error) {
				console.error('Reorder pages error:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// API: Rotate pages
		app.post('/api/rotate-pages', async (req, res) => {
			try {
				const { pages, rotation } = req.body;

				// Validate rotation
				const validRotations = [90, 180, 270, -90];
				if (!validRotations.includes(rotation)) {
					return res.status(400).json({ error: 'Invalid rotation angle' });
				}

				// Ensure currentWorkingFile exists, fallback to original file
				if (!existsSync(currentWorkingFile)) {
					console.warn(`Warning: currentWorkingFile ${currentWorkingFile} does not exist, using original file: ${file}`);
					currentWorkingFile = resolve(file);
				}

				// If no pages specified, rotate all pages
				const pagesToRotate = pages && Array.isArray(pages) && pages.length > 0
					? pages
					: [];

				const tmpDir = join(__dirname, 'temp');
				const outputPath = join(
					tmpDir,
					`${basename(currentWorkingFile, '.pdf')}_rotated.pdf`,
				);

				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				const success = await rotatePages(currentWorkingFile, pagesToRotate, rotation, outputPath);

				if (success && existsSync(outputPath)) {
					res.download(
						outputPath,
						`${basename(currentWorkingFile, '.pdf')}_rotated.pdf`,
						(err) => {
							unlink(outputPath).catch(() => {});
							if (err) {
								console.error('Download error:', err);
							}
						},
					);
				} else {
					res.status(500).json({ error: 'Page rotation failed' });
				}
			} catch (error) {
				console.error('Rotate pages error:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// API: Insert date into PDF
		app.post('/api/insert-date', async (req, res) => {
			try {
				const {
					dateText,
					format,
					x,
					y,
					fontSize,
					textColor,
					bgColor,
					rotation,
					pageIndex,
				} = req.body;

				const tmpDir = join(__dirname, 'temp');
				const outputPath = join(
					tmpDir,
					`${basename(file, '.pdf')}_with_date.pdf`,
				);

				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				// Parse colors
				const parseColor = (hex: string) => {
					const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
					const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
					const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
					return { r, g, b };
				};

				const success = await insertDate(
					file,
					{
						dateText: dateText,
						format: format || 'MM/DD/YYYY',
						x: x || 50,
						y: y || 50,
						fontSize: fontSize || 12,
						color: textColor ? parseColor(textColor) : { r: 0, g: 0, b: 0 },
						bgColor: bgColor ? parseColor(bgColor) : undefined,
						rotation: rotation || 0,
						pages: pageIndex !== undefined ? [pageIndex] : undefined,
					},
					outputPath,
				);

				if (success && existsSync(outputPath)) {
					res.download(
						outputPath,
						`${basename(file, '.pdf')}_with_date.pdf`,
						(err) => {
							unlink(outputPath).catch(() => {});
							if (err) {
								console.error('Download error:', err);
							}
						},
					);
				} else {
					res.status(500).json({ error: 'Date insertion failed' });
				}
			} catch (error) {
				console.error('Insert date error:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// API: Add image overlay
		app.post('/api/add-image-overlay', async (req, res) => {
			try {
				const { imageData, x, y, width, height, opacity } = req.body;
				if (!imageData) {
					return res.status(400).json({ error: 'No image data provided' });
				}

				const tmpDir = join(__dirname, 'temp');
				await (await import('node:fs/promises')).mkdir(tmpDir, {
					recursive: true,
				});

				// Save base64 image to temp file
				const imageBuffer = Buffer.from(imageData.split(',')[1], 'base64');
				const imagePath = join(tmpDir, `overlay_${Date.now()}.png`);
				await writeFile(imagePath, imageBuffer);

				const outputPath = join(
					tmpDir,
					`${basename(file, '.pdf')}_with_overlay.pdf`,
				);

				const success = await addImageOverlay(
					file,
					{
						imagePath,
						x: x || 50,
						y: y || 50,
						width: width || 100,
						height: height || 100,
						opacity: (opacity || 100) / 100,
					},
					outputPath,
				);

				if (success && existsSync(outputPath)) {
					res.download(
						outputPath,
						`${basename(file, '.pdf')}_with_overlay.pdf`,
						(err) => {
							unlink(outputPath).catch(() => {});
							unlink(imagePath).catch(() => {});
							if (err) console.error('Download error:', err);
						},
					);
				} else {
					res.status(500).json({ error: 'Image overlay failed' });
				}
			} catch (error) {
				console.error('Add image overlay error:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// API: Add signature
		app.post('/api/add-signature', async (req, res) => {
			try {
				const { imageData, x, y, width, height, removeBackground } = req.body;
				if (!imageData) {
					return res.status(400).json({ error: 'No signature image provided' });
				}

				const tmpDir = join(__dirname, 'temp');
				await (await import('node:fs/promises')).mkdir(tmpDir, {
					recursive: true,
				});

				// Save base64 image to temp file
				const imageBuffer = Buffer.from(imageData.split(',')[1], 'base64');
				const imagePath = join(tmpDir, `signature_${Date.now()}.png`);
				await writeFile(imagePath, imageBuffer);

				const outputPath = join(tmpDir, `${basename(file, '.pdf')}_signed.pdf`);

				const success = await addSignature(
					file,
					{
						signatureFile: imagePath,
						x: x || 50,
						y: y || 50,
						width: width || 150,
						height: height || 50,
						removeBg: removeBackground !== false,
					},
					outputPath,
				);

				if (success && existsSync(outputPath)) {
					res.download(
						outputPath,
						`${basename(file, '.pdf')}_signed.pdf`,
						(err) => {
							unlink(outputPath).catch(() => {});
							unlink(imagePath).catch(() => {});
							if (err) console.error('Download error:', err);
						},
					);
				} else {
					res.status(500).json({ error: 'Signature addition failed' });
				}
			} catch (error) {
				console.error('Add signature error:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// API: Merge PDFs or Images
		app.post('/api/merge-pdfs', async (req, res) => {
			try {
				const { pdfData, position, isImage } = req.body;
				if (!pdfData) {
					return res.status(400).json({ error: 'No data provided' });
				}

				// Ensure currentWorkingFile exists, fallback to original file
				if (!existsSync(currentWorkingFile)) {
					console.warn(`Warning: currentWorkingFile ${currentWorkingFile} does not exist, using original file: ${file}`);
					currentWorkingFile = resolve(file);
				}

				const tmpDir = join(__dirname, 'temp');
				await (await import('node:fs/promises')).mkdir(tmpDir, {
					recursive: true,
				});

				let uploadedPdfPath: string;

				if (isImage) {
					// Convert image to PDF first
					const { PDFDocument } = await import('pdf-lib');
					const imageBuffer = Buffer.from(pdfData.split(',')[1], 'base64');

					// Determine image type from data URL
					const imageType = pdfData.split(';')[0].split('/')[1];

					// Create a new PDF and add the image
					const pdfDoc = await PDFDocument.create();

					let image;
					if (imageType === 'png') {
						image = await pdfDoc.embedPng(imageBuffer);
					} else if (imageType === 'jpeg' || imageType === 'jpg') {
						image = await pdfDoc.embedJpg(imageBuffer);
					} else {
						// For other formats (gif, bmp, webp, etc.), convert to PNG first using ImageMagick
						const { checkImageMagick } = await import('../lib/magick.js');
						const hasImageMagick = await checkImageMagick();

						if (!hasImageMagick) {
							return res.status(400).json({
								error: `Image type '${imageType}' requires ImageMagick. Install it with: sudo apt install imagemagick`,
							});
						}

						// Save original image to temp file
						const tempImagePath = join(
							tmpDir,
							`temp_${Date.now()}.${imageType}`,
						);
						await writeFile(tempImagePath, imageBuffer);

						// Convert to PNG using ImageMagick
						const tempPngPath = join(tmpDir, `temp_${Date.now()}.png`);
						const { exec } = await import('node:child_process');
						const { promisify } = await import('node:util');
						const execAsync = promisify(exec);

						try {
							await execAsync(
								`convert "${tempImagePath}" "PNG32:${tempPngPath}"`,
							);

							// Read the converted PNG
							const pngBuffer = await (
								await import('node:fs/promises')
							).readFile(tempPngPath);
							image = await pdfDoc.embedPng(pngBuffer);

							// Clean up temp files
							await (await import('node:fs/promises')).unlink(tempImagePath);
							await (await import('node:fs/promises')).unlink(tempPngPath);
						} catch (error) {
							return res.status(500).json({
								error: `Failed to convert ${imageType} to PNG: ${(error as Error).message}`,
							});
						}
					}

					// Create page with image dimensions
					const page = pdfDoc.addPage([image.width, image.height]);
					page.drawImage(image, {
						x: 0,
						y: 0,
						width: image.width,
						height: image.height,
					});

					// Save the converted PDF
					uploadedPdfPath = join(tmpDir, `upload_${Date.now()}.pdf`);
					const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
					await writeFile(uploadedPdfPath, pdfBytes);
				} else {
					// Save uploaded PDF to temp file
					const pdfBuffer = Buffer.from(pdfData.split(',')[1], 'base64');
					uploadedPdfPath = join(tmpDir, `upload_${Date.now()}.pdf`);
					await writeFile(uploadedPdfPath, pdfBuffer);
				}

				const outputPath = join(tmpDir, `${basename(currentWorkingFile, '.pdf')}_merged.pdf`);

				// Merge based on position
				let filesToMerge = [];
				if (position === 'beginning') {
					filesToMerge = [uploadedPdfPath, currentWorkingFile];
				} else if (position === 'replace') {
					filesToMerge = [uploadedPdfPath];
				} else {
					// 'end' or default
					filesToMerge = [currentWorkingFile, uploadedPdfPath];
				}

				const success = await mergePdfs(filesToMerge, outputPath);

				if (success && existsSync(outputPath)) {
					res.download(
						outputPath,
						`${basename(currentWorkingFile, '.pdf')}_merged.pdf`,
						(err) => {
							unlink(outputPath).catch(() => {});
							unlink(uploadedPdfPath).catch(() => {});
							if (err) console.error('Download error:', err);
						},
					);
				} else {
					res.status(500).json({ error: 'Merge failed' });
				}
			} catch (error) {
				console.error('Merge error:', error);
				res.status(500).json({
					error: 'Internal server error: ' + (error as Error).message,
				});
			}
		});

		// API: Open folder in Windows Explorer
		app.post('/api/open-folder', async (req, res) => {
			try {
				const { folderPath } = req.body;
				if (!folderPath) {
					return res.status(400).json({ error: 'No folder path provided' });
				}

				console.log(`Opening folder: ${folderPath}`);

				// Use cmd.exe with start command for reliable folder opening from WSL
				const { execSync } = await import('node:child_process');

				// Normalize path - ensure it's a valid Windows path
				let normalizedPath = folderPath;
				if (normalizedPath.startsWith('/mnt/')) {
					normalizedPath = wslToWindows(normalizedPath);
					console.log(`Converted WSL path to Windows: ${normalizedPath}`);
				}

				// Use cmd.exe /c start to open the folder
				// The empty quotes "" are required for the window title parameter
				execSync(`cmd.exe /c start "" "${normalizedPath}"`, {
					stdio: 'ignore',
					windowsHide: true
				});

				console.log(`Successfully opened folder: ${normalizedPath}`);
				res.json({ success: true });
			} catch (error) {
				console.error('Open folder error:', error);
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				console.error('Error details:', errorMsg);
				res.status(500).json({
					error: 'Failed to open folder',
					details: errorMsg
				});
			}
		});

				// Start server on random port
		const server = createServer(app);
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (!addr || typeof addr === 'string') {
				console.error('Failed to start server');
				promiseResolve(false);
				return;
			}

			const url = `http://127.0.0.1:${addr.port}?file=${encodeURIComponent(basename(file))}`;

			// Log URL for testing/debugging
			console.log(`PDFile GUI started at: ${url}`);

			// Signal HTA to close and open Edge
			signalLoadingComplete(url);

			// Keep server running until window is closed
			// Server will be cleaned up when process exits
		});

		// Handle server errors
		server.on('error', (err) => {
			console.error('Server error:', err);
			promiseResolve(false);
		});
	});
}
