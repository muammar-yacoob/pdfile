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
				filePath: currentWorkingFile,
			});
		});

		// Serve the actual PDF file for preview
		app.get('/pdf/:filename', (_req, res) => {
			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', 'inline');
			res.sendFile(currentWorkingFile);
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

				// Update the current working file
				currentWorkingFile = tempPath;

				res.json({ success: true, filePath: tempPath });
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

				const tmpDir = join(__dirname, 'temp');
				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				let currentFile = currentWorkingFile;
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
					const parseColor = (hex: string) => {
						if (!hex) return undefined;
						const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
						const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
						const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
						return { r, g, b };
					};

					for (let i = 0; i < overlays.length; i++) {
						const overlay = overlays[i];
						const isLast = i === overlays.length - 1;
						const outputPath = isLast
							? file.replace(/\.pdf$/i, '_abused.pdf')
							: join(tmpDir, `temp_overlay_${i}_${Date.now()}.pdf`);

						console.log(
							`\n=== Processing overlay ${i + 1}/${overlays.length} (${overlay.type}) ===`,
						);
						console.log(`Current input file: ${currentFile}`);
						console.log(`Output file: ${outputPath}`);
						console.log(`Is last: ${isLast}`);

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
				const finalOutput =
					currentFile === file
						? file.replace(/\.pdf$/i, '_modified.pdf')
						: currentFile;

				// If currentFile is still the original, copy it
				if (currentFile === file && hasMergedPages) {
					const { copyFile } = await import('node:fs/promises');
					await copyFile(file, finalOutput);
					currentFile = finalOutput;
				}

				if (existsSync(currentFile)) {
					res.download(currentFile, basename(currentFile), (err) => {
						tempFiles.forEach((f) => unlink(f).catch(() => {}));
						if (err) {
							console.error('Download error:', err);
						}
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
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// API: Reorder pages in PDF
		app.post('/api/reorder-pages', async (req, res) => {
			try {
				const { order } = req.body;
				if (!order || !Array.isArray(order) || order.length === 0) {
					return res.status(400).json({ error: 'No page order specified' });
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

				const outputPath = join(tmpDir, `${basename(file, '.pdf')}_merged.pdf`);

				// Merge based on position
				let filesToMerge = [];
				if (position === 'beginning') {
					filesToMerge = [uploadedPdfPath, file];
				} else if (position === 'replace') {
					filesToMerge = [uploadedPdfPath];
				} else {
					// 'end' or default
					filesToMerge = [file, uploadedPdfPath];
				}

				const success = await mergePdfs(filesToMerge, outputPath);

				if (success && existsSync(outputPath)) {
					res.download(
						outputPath,
						`${basename(file, '.pdf')}_merged.pdf`,
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
