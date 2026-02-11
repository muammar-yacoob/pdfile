import { type ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { type Page, expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'fs/promises';

let serverProcess: ChildProcess;
let serverUrl: string;
const testPdfPath = join(__dirname, '../test-fixtures/test.pdf');

test.beforeAll(async () => {
	// Ensure test fixtures directory exists
	const fixturesDir = join(__dirname, '../test-fixtures');
	if (!existsSync(fixturesDir)) {
		await mkdir(fixturesDir, { recursive: true });
	}

	// Create a test PDF if it doesn't exist
	if (!existsSync(testPdfPath)) {
		const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
		const pdfDoc = await PDFDocument.create();
		const page = pdfDoc.addPage([612, 792]);
		const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
		page.drawText('Test PDF Document', {
			x: 50,
			y: 700,
			size: 30,
			font,
			color: rgb(0, 0, 0),
		});
		page.drawText('Page 1 Content', {
			x: 50,
			y: 400,
			size: 20,
			font,
		});

		// Add second page
		const page2 = pdfDoc.addPage([612, 792]);
		page2.drawText('Page 2 Content', {
			x: 50,
			y: 700,
			size: 20,
			font,
		});

		// Add third page
		const page3 = pdfDoc.addPage([612, 792]);
		page3.drawText('Page 3 Content', {
			x: 50,
			y: 700,
			size: 20,
			font,
		});

		const pdfBytes = await pdfDoc.save();
		await writeFile(testPdfPath, pdfBytes);
	}

	// Start the server
	await new Promise<void>((resolve, reject) => {
		const distCli = join(__dirname, '../dist/cli.js');
		serverProcess = spawn('node', [distCli, 'gui', testPdfPath], {
			stdio: 'pipe',
			env: { ...process.env },
		});

		let output = '';

		serverProcess.stdout?.on('data', (data) => {
			output += data.toString();
			console.log('[Server]:', data.toString());

			// Look for server URL in output
			const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
			if (match) {
				serverUrl = match[0];
				console.log('Server started at:', serverUrl);
				resolve();
			}
		});

		serverProcess.stderr?.on('data', (data) => {
			console.error('[Server Error]:', data.toString());
		});

		serverProcess.on('error', reject);

		// Timeout after 10 seconds
		setTimeout(() => reject(new Error('Server start timeout')), 10000);
	});
});

test.afterAll(async () => {
	if (serverProcess) {
		serverProcess.kill();
	}
});

test.describe('PDFile GUI Tests', () => {
	test('should load the GUI without errors', async ({ page }) => {
		const errors: string[] = [];
		const warnings: string[] = [];

		page.on('console', (msg) => {
			const type = msg.type();
			const text = msg.text();
			console.log(`[Browser ${type}]:`, text);

			if (type === 'error') {
				errors.push(text);
			} else if (type === 'warning') {
				warnings.push(text);
			}
		});

		page.on('pageerror', (error) => {
			errors.push(error.message);
			console.error('[Page Error]:', error);
		});

		await page.goto(serverUrl);
		await page.waitForLoadState('networkidle');

		// Check if lucide icons are loaded
		const lucideScript = await page.evaluate(() => {
			return typeof (window as any).lucide !== 'undefined';
		});

		// Check if PDF.js is loaded
		const pdfjsLoaded = await page.evaluate(() => {
			return typeof (window as any).pdfjsLib !== 'undefined';
		});

		console.log('Lucide loaded:', lucideScript);
		console.log('PDF.js loaded:', pdfjsLoaded);
		console.log('Errors:', errors);
		console.log('Warnings:', warnings);

		// Verify critical resources loaded
		expect(lucideScript).toBeTruthy();
		expect(pdfjsLoaded).toBeTruthy();

		// Should have no JavaScript errors
		expect(
			errors.filter((e) => !e.includes('Tracking Prevention')),
		).toHaveLength(0);
	});

	test('should display PDF filename', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForLoadState('networkidle');

		const fileName = await page.locator('#fileName').textContent();
		expect(fileName).toContain('test.pdf');
	});

	test('should load PDF preview', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForTimeout(2000);

		const embedExists = await page
			.locator('embed[type="application/pdf"]')
			.count();
		expect(embedExists).toBeGreaterThan(0);
	});

	test('should generate thumbnails', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForTimeout(3000);

		const thumbnails = await page.locator('.thumbnail-item').count();
		console.log('Thumbnails found:', thumbnails);
		expect(thumbnails).toBeGreaterThanOrEqual(3);
	});

	test('should toggle tools panel', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForLoadState('networkidle');

		const overlaysTool = page.locator('#t-overlays .tool-header');
		await overlaysTool.click();

		const isActive = await page
			.locator('#t-overlays')
			.evaluate((el) => el.classList.contains('active'));
		expect(isActive).toBeTruthy();
	});

	test('should switch overlay tabs', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForLoadState('networkidle');

		// Open overlays tool
		await page.locator('#t-overlays .tool-header').click();

		// Switch to text tab
		await page.locator('.tabs .tab:has-text("Text")').click();

		const textTabActive = await page
			.locator('#overlay-text')
			.evaluate((el) => el.classList.contains('active'));
		expect(textTabActive).toBeTruthy();
	});

	test('should add date overlay', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(1000);

		// Open overlays tool
		await page.locator('#t-overlays .tool-header').click();
		await page.waitForTimeout(500);

		// Click add date overlay button
		await page.locator('button:has-text("Add Date Overlay")').click();

		// Wait for modal
		await page.waitForSelector('.modal-overlay.active', { timeout: 5000 });

		const modalText = await page.locator('.modal-body').textContent();
		expect(modalText).toContain('Date overlay added');
	});

	test('should open export menu', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForLoadState('networkidle');

		await page.locator('#exportBtn').click();

		const menuVisible = await page.locator('#exportMenu').isVisible();
		expect(menuVisible).toBeTruthy();
	});

	test('should collapse/expand pages panel', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForLoadState('networkidle');

		const collapseBtn = page.locator('.thumbnails-header .collapse-btn');
		await collapseBtn.click();

		const isCollapsed = await page
			.locator('#thumbnailsPanel')
			.evaluate((el) => el.classList.contains('collapsed'));
		expect(isCollapsed).toBeTruthy();
	});

	test('should select pages with Ctrl+Click', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForTimeout(3000);

		const firstThumbnail = page.locator('.thumbnail-item').first();

		// Ctrl+Click to select
		await firstThumbnail.click({ modifiers: ['Control'] });

		const removeBtn = page.locator('#removePageBtn');
		const isVisible = await removeBtn.isVisible();
		expect(isVisible).toBeTruthy();
	});

	test('should test merge PDFs flow', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForLoadState('networkidle');

		// Open merge tool
		await page.locator('#t-merge .tool-header').click();

		const mergeToolActive = await page
			.locator('#t-merge')
			.evaluate((el) => el.classList.contains('active'));
		expect(mergeToolActive).toBeTruthy();

		// Verify merge buttons exist
		const addToEndBtn = await page
			.locator('button:has-text("Add to End")')
			.count();
		expect(addToEndBtn).toBeGreaterThan(0);
	});

	test('should test convert to Word', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForLoadState('networkidle');

		// Set up download handler
		const downloadPromise = page.waitForEvent('download', { timeout: 30000 });

		// Click export menu
		await page.locator('#exportBtn').click();

		// Click convert to Word
		await page.locator('button:has-text("Convert to Word")').click();

		// Wait for download
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.docx$/);
	});

	test('should handle reorder pages', async ({ page }) => {
		await page.goto(serverUrl);
		await page.waitForTimeout(3000);

		const thumbnails = page.locator('.thumbnail-item');
		const count = await thumbnails.count();

		if (count >= 2) {
			// Get first and second thumbnail positions
			const first = thumbnails.nth(0);
			const second = thumbnails.nth(1);

			const firstBox = await first.boundingBox();
			const secondBox = await second.boundingBox();

			if (firstBox && secondBox) {
				// Drag first thumbnail to second position
				await page.mouse.move(
					firstBox.x + firstBox.width / 2,
					firstBox.y + firstBox.height / 2,
				);
				await page.mouse.down();
				await page.mouse.move(
					secondBox.x + secondBox.width / 2,
					secondBox.y + secondBox.height / 2,
				);
				await page.mouse.up();

				// Check if reorder button appeared
				await page.waitForTimeout(500);
				const reorderBtn = page.locator('#reorderBtn');
				const isVisible = await reorderBtn.isVisible();
				expect(isVisible).toBeTruthy();
			}
		}
	});
});
