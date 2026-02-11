/**
 * Manual test runner for PDFile
 * This script manually tests each feature using Playwright
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'fs/promises';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create test PDF
async function createTestPDF() {
	const fixturesDir = join(__dirname, '../test-fixtures');
	if (!existsSync(fixturesDir)) {
		await mkdir(fixturesDir, { recursive: true });
	}

	const testPdfPath = join(fixturesDir, 'test.pdf');

	if (!existsSync(testPdfPath)) {
		const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
		const pdfDoc = await PDFDocument.create();
		const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

		// Add 3 pages
		for (let i = 1; i <= 3; i++) {
			const page = pdfDoc.addPage([612, 792]);
			page.drawText(`Test PDF Document`, {
				x: 50,
				y: 700,
				size: 30,
				font,
				color: rgb(0, 0, 0),
			});
			page.drawText(`Page ${i} Content`, { x: 50, y: 400, size: 20, font });
		}

		const pdfBytes = await pdfDoc.save();
		await writeFile(testPdfPath, pdfBytes);
		console.log('✓ Created test PDF');
	}

	return testPdfPath;
}

// Start server and get URL
async function startServer(
	testPdfPath: string,
): Promise<{ process: any; url: string }> {
	return new Promise((resolve, reject) => {
		const serverProcess = spawn('node', ['dist/cli.js', 'gui', testPdfPath], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let output = '';

		serverProcess.stdout.on('data', (data) => {
			output += data.toString();
			const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
			if (match) {
				console.log('✓ Server started:', match[0]);
				resolve({ process: serverProcess, url: match[0] });
			}
		});

		serverProcess.stderr.on('data', (data) => {
			console.error('Server error:', data.toString());
		});

		serverProcess.on('error', reject);

		setTimeout(() => reject(new Error('Server start timeout')), 10000);
	});
}

// Main test runner
async function runTests() {
	console.log('========================================');
	console.log('PDFile Manual Test Runner');
	console.log('========================================\n');

	const testPdfPath = await createTestPDF();
	const { process: serverProcess, url: serverUrl } =
		await startServer(testPdfPath);

	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();
	const page = await context.newPage();

	const errors: string[] = [];
	const consoleMessages: string[] = [];

	page.on('console', (msg) => {
		const text = `[${msg.type()}] ${msg.text()}`;
		consoleMessages.push(text);
		if (msg.type() === 'error') {
			errors.push(msg.text());
			console.error('❌', text);
		}
	});

	page.on('pageerror', (error) => {
		errors.push(error.message);
		console.error('❌ Page Error:', error.message);
	});

	try {
		console.log('\n--- Test 1: Load GUI ---');
		await page.goto(serverUrl);
		await page.waitForLoadState('networkidle');
		console.log('✓ Page loaded');

		// Check for lucide and pdf.js
		const lucideLoaded = await page.evaluate(
			() => typeof (window as any).lucide !== 'undefined',
		);
		const pdfjsLoaded = await page.evaluate(
			() => typeof (window as any).pdfjsLib !== 'undefined',
		);

		console.log('Lucide loaded:', lucideLoaded ? '✓' : '❌');
		console.log('PDF.js loaded:', pdfjsLoaded ? '✓' : '❌');

		await page.waitForTimeout(2000);

		console.log('\n--- Test 2: Check PDF Display ---');
		const fileName = await page.locator('#fileName').textContent();
		console.log('File name:', fileName);
		console.log(
			fileName?.includes('test.pdf') ? '✓' : '❌',
			'File name displayed',
		);

		console.log('\n--- Test 3: Check Thumbnails ---');
		await page.waitForTimeout(3000);
		const thumbnailCount = await page.locator('.thumbnail-item').count();
		console.log('Thumbnails:', thumbnailCount);
		console.log(thumbnailCount >= 3 ? '✓' : '❌', 'Thumbnails generated');

		console.log('\n--- Test 4: Toggle Overlays Tool ---');
		await page.locator('#t-overlays .tool-header').click();
		await page.waitForTimeout(500);
		const overlaysActive = await page
			.locator('#t-overlays')
			.evaluate((el) => el.classList.contains('active'));
		console.log(overlaysActive ? '✓' : '❌', 'Overlays tool opened');

		console.log('\n--- Test 5: Switch Overlay Tabs ---');
		await page.locator('.tabs .tab:has-text("Text")').click();
		await page.waitForTimeout(300);
		const textTabActive = await page
			.locator('#overlay-text')
			.evaluate((el) => el.classList.contains('active'));
		console.log(textTabActive ? '✓' : '❌', 'Text tab activated');

		console.log('\n--- Test 6: Add Date Overlay ---');
		await page.locator('.tabs .tab:has-text("Date")').click();
		await page.waitForTimeout(300);
		await page.locator('button:has-text("Add Date Overlay")').click();
		await page.waitForTimeout(1000);
		const modalVisible = await page
			.locator('.modal-overlay.active')
			.isVisible();
		console.log(modalVisible ? '✓' : '❌', 'Date overlay modal appeared');

		if (modalVisible) {
			await page.locator('button:has-text("OK")').click();
			await page.waitForTimeout(500);
		}

		console.log('\n--- Test 7: Export Menu ---');
		await page.locator('#exportBtn').click();
		await page.waitForTimeout(500);
		const exportMenuVisible = await page.locator('#exportMenu').isVisible();
		console.log(exportMenuVisible ? '✓' : '❌', 'Export menu opened');

		// Close menu
		if (exportMenuVisible) {
			await page.locator('body').click({ position: { x: 10, y: 10 } });
			await page.waitForTimeout(300);
		}

		console.log('\n--- Test 8: Collapse Pages Panel ---');
		await page.locator('.thumbnails-header .collapse-btn').click();
		await page.waitForTimeout(500);
		const panelCollapsed = await page
			.locator('#thumbnailsPanel')
			.evaluate((el) => el.classList.contains('collapsed'));
		console.log(panelCollapsed ? '✓' : '❌', 'Pages panel collapsed');

		// Expand back
		await page.locator('.thumbnails-header .collapse-btn').click();
		await page.waitForTimeout(500);

		console.log('\n--- Test 9: Select Page (Ctrl+Click) ---');
		const firstThumbnail = page.locator('.thumbnail-item').first();
		await firstThumbnail.click({ modifiers: ['Control'] });
		await page.waitForTimeout(500);
		const removeBtnVisible = await page.locator('#removePageBtn').isVisible();
		console.log(removeBtnVisible ? '✓' : '❌', 'Remove page button appeared');

		console.log('\n--- Test 10: Open Merge Tool ---');
		await page.locator('#t-merge .tool-header').click();
		await page.waitForTimeout(500);
		const mergeActive = await page
			.locator('#t-merge')
			.evaluate((el) => el.classList.contains('active'));
		console.log(mergeActive ? '✓' : '❌', 'Merge tool opened');

		console.log('\n========================================');
		console.log('Test Summary');
		console.log('========================================');
		console.log('Total errors:', errors.length);

		if (errors.length > 0) {
			console.log('\nErrors found:');
			errors.forEach((err) => console.log('  -', err));
		}

		console.log('\n✓ All manual tests completed');
		console.log('Check the browser window for visual verification');
		console.log('Press Enter to close...');

		// Wait for user input
		await new Promise((resolve) => {
			process.stdin.once('data', resolve);
		});
	} catch (error) {
		console.error('\n❌ Test failed:', error);
	} finally {
		await browser.close();
		serverProcess.kill();
		process.exit(0);
	}
}

runTests().catch(console.error);
