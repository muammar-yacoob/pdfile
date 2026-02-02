import type { ToolConfig } from '../cli/tools.js';
import { createServer } from 'node:http';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import express from 'express';
import { signalLoadingComplete, cleanupSignalFiles } from '../lib/edge-launcher.js';
import { pdfToWord } from './pdf-to-word.js';
import { mergePdfs } from './merge-pdfs.js';
import { addSignature } from './add-signature.js';
import { insertDate } from './insert-date.js';
import { addImageOverlay } from './add-image-overlay.js';
import { removePages } from './remove-pages.js';
import { reorderPages } from './reorder-pages.js';

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

	return new Promise((resolve) => {
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
				fileName: basename(file),
				filePath: file,
			});
		});

		// Serve the actual PDF file for preview
		app.get('/pdf/:filename', (_req, res) => {
			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', 'inline');
			res.sendFile(file);
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

				let currentFile = file;
				let tempFiles: string[] = [];

				// Process each overlay sequentially
				for (let i = 0; i < overlays.length; i++) {
					const overlay = overlays[i];
					const isLast = i === overlays.length - 1;
					const outputPath = isLast
						? join(tmpDir, `${basename(file, '.pdf')}_with_overlays.pdf`)
						: join(tmpDir, `temp_${i}_${Date.now()}.pdf`);

					let success = false;

					if (overlay.type === 'date') {
						// Parse colors
						const parseColor = (hex: string) => {
							if (!hex) return undefined;
							const r = parseInt(hex.slice(1, 3), 16) / 255;
							const g = parseInt(hex.slice(3, 5), 16) / 255;
							const b = parseInt(hex.slice(5, 7), 16) / 255;
							return { r, g, b };
						};

						success = await insertDate(currentFile, {
							dateText: overlay.dateText,
							format: overlay.format,
							fontSize: overlay.fontSize,
							color: parseColor(overlay.textColor),
							bgColor: overlay.bgColor ? parseColor(overlay.bgColor) : undefined,
							rotation: overlay.rotation || 0,
							x: overlay.x,
							y: overlay.y,
							pages: overlay.pageIndex !== undefined ? [overlay.pageIndex] : undefined,
						}, outputPath);

					} else if (overlay.type === 'image') {
						// Save base64 image to temp file
						const imageBuffer = Buffer.from(overlay.imageData.split(',')[1], 'base64');
						const imagePath = join(tmpDir, `overlay_${Date.now()}.png`);
						await writeFile(imagePath, imageBuffer);
						tempFiles.push(imagePath);

						success = await addImageOverlay(currentFile, {
							imagePath,
							x: overlay.x,
							y: overlay.y,
							width: overlay.width,
							height: overlay.height,
							opacity: overlay.opacity / 100,
						}, outputPath);

					} else if (overlay.type === 'signature') {
						// Save base64 image to temp file
						const imageBuffer = Buffer.from(overlay.imageData.split(',')[1], 'base64');
						const imagePath = join(tmpDir, `signature_${Date.now()}.png`);
						await writeFile(imagePath, imageBuffer);
						tempFiles.push(imagePath);

						success = await addSignature(currentFile, {
							signatureFile: imagePath,
							x: overlay.x,
							y: overlay.y,
							width: overlay.width,
							height: overlay.height,
							removeBg: overlay.removeBackground !== false,
						}, outputPath);
					}

					if (!success) {
						throw new Error(`Failed to apply ${overlay.type} overlay`);
					}

					// Update current file for next overlay
					if (!isLast) {
						tempFiles.push(currentFile);
						currentFile = outputPath;
					}
				}

				const finalOutput = join(tmpDir, `${basename(file, '.pdf')}_with_overlays.pdf`);

				if (existsSync(finalOutput)) {
					res.download(finalOutput, `${basename(file, '.pdf')}_with_overlays.pdf`, (err) => {
						// Clean up temp files
						unlink(finalOutput).catch(() => {});
						tempFiles.forEach(f => unlink(f).catch(() => {}));
						if (err) {
							console.error('Download error:', err);
						}
					});
				} else {
					res.status(500).json({ error: 'Failed to create output file' });
				}

			} catch (error) {
				console.error('Apply overlays error:', error);
				res.status(500).json({ error: 'Internal server error: ' + (error as Error).message });
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
					`${basename(file, '.pdf')}_removed_pages.pdf`,
				);

				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				const success = await removePages(file, pages, outputPath);

				if (success && existsSync(outputPath)) {
					res.download(
						outputPath,
						`${basename(file, '.pdf')}_removed_pages.pdf`,
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
					`${basename(file, '.pdf')}_reordered.pdf`,
				);

				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				const success = await reorderPages(file, order, outputPath);

				if (success && existsSync(outputPath)) {
					res.download(
						outputPath,
						`${basename(file, '.pdf')}_reordered.pdf`,
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

		// API: Insert date into PDF
		app.post('/api/insert-date', async (req, res) => {
			try {
				const { dateText, format, x, y, fontSize, textColor, bgColor, rotation, pageIndex } = req.body;

				const tmpDir = join(__dirname, 'temp');
				const outputPath = join(
					tmpDir,
					`${basename(file, '.pdf')}_with_date.pdf`,
				);

				const { mkdir } = await import('node:fs/promises');
				await mkdir(tmpDir, { recursive: true });

				// Parse colors
				const parseColor = (hex: string) => {
					const r = parseInt(hex.slice(1, 3), 16) / 255;
					const g = parseInt(hex.slice(3, 5), 16) / 255;
					const b = parseInt(hex.slice(5, 7), 16) / 255;
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
				await (await import('node:fs/promises')).mkdir(tmpDir, { recursive: true });

				// Save base64 image to temp file
				const imageBuffer = Buffer.from(imageData.split(',')[1], 'base64');
				const imagePath = join(tmpDir, `overlay_${Date.now()}.png`);
				await writeFile(imagePath, imageBuffer);

				const outputPath = join(tmpDir, `${basename(file, '.pdf')}_with_overlay.pdf`);

				const success = await addImageOverlay(file, {
					imagePath,
					x: x || 50,
					y: y || 50,
					width: width || 100,
					height: height || 100,
					opacity: (opacity || 100) / 100,
				}, outputPath);

				if (success && existsSync(outputPath)) {
					res.download(outputPath, `${basename(file, '.pdf')}_with_overlay.pdf`, (err) => {
						unlink(outputPath).catch(() => {});
						unlink(imagePath).catch(() => {});
						if (err) console.error('Download error:', err);
					});
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
				await (await import('node:fs/promises')).mkdir(tmpDir, { recursive: true });

				// Save base64 image to temp file
				const imageBuffer = Buffer.from(imageData.split(',')[1], 'base64');
				const imagePath = join(tmpDir, `signature_${Date.now()}.png`);
				await writeFile(imagePath, imageBuffer);

				const outputPath = join(tmpDir, `${basename(file, '.pdf')}_signed.pdf`);

				const success = await addSignature(file, {
					signatureFile: imagePath,
					x: x || 50,
					y: y || 50,
					width: width || 150,
					height: height || 50,
					removeBg: removeBackground !== false,
				}, outputPath);

				if (success && existsSync(outputPath)) {
					res.download(outputPath, `${basename(file, '.pdf')}_signed.pdf`, (err) => {
						unlink(outputPath).catch(() => {});
						unlink(imagePath).catch(() => {});
						if (err) console.error('Download error:', err);
					});
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
				await (await import('node:fs/promises')).mkdir(tmpDir, { recursive: true });

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
						return res.status(400).json({ error: 'Unsupported image type. Use PNG or JPEG.' });
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
				} else { // 'end' or default
					filesToMerge = [file, uploadedPdfPath];
				}

				const success = await mergePdfs(filesToMerge, outputPath);

				if (success && existsSync(outputPath)) {
					res.download(outputPath, `${basename(file, '.pdf')}_merged.pdf`, (err) => {
						unlink(outputPath).catch(() => {});
						unlink(uploadedPdfPath).catch(() => {});
						if (err) console.error('Download error:', err);
					});
				} else {
					res.status(500).json({ error: 'Merge failed' });
				}
			} catch (error) {
				console.error('Merge error:', error);
				res.status(500).json({ error: 'Internal server error: ' + (error as Error).message });
			}
		});

		// Start server on random port
		const server = createServer(app);
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (!addr || typeof addr === 'string') {
				console.error('Failed to start server');
				resolve(false);
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
			resolve(false);
		});
	});
}
