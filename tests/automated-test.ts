/**
 * Automated test runner for PDFile - runs headless and reports results
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

// Start server
async function startServer(
	testPdfPath: string,
): Promise<{ process: any; url: string }> {
	return new Promise((resolve, reject) => {
		const serverProcess = spawn(
			'node',
			['dist/cli.js', 'pdfile', testPdfPath],
			{
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		let output = '';

		serverProcess.stdout.on('data', (data) => {
			output += data.toString();
			const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
			if (match) {
				resolve({ process: serverProcess, url: match[0] });
			}
		});

		serverProcess.stderr.on('data', (data) => {
			console.error('[Server]:', data.toString());
		});

		serverProcess.on('error', reject);
		setTimeout(() => reject(new Error('Server start timeout')), 10000);
	});
}

// Test suite
async function runTests() {
	console.log('\n========================================');
	console.log('PDFile Automated Test Suite');
	console.log('========================================\n');

	const testPdfPath = await createTestPDF();
	const { process: serverProcess, url: serverUrl } =
		await startServer(testPdfPath);

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext();
	const page = await context.newPage();

	const errors: string[] = [];
	const warnings: string[] = [];
	let passed = 0;
	let failed = 0;

	page.on('console', (msg) => {
		const type = msg.type();
		const text = msg.text();

		if (type === 'error' && !text.includes('Tracking Prevention')) {
			errors.push(text);
		} else if (type === 'warning') {
			warnings.push(text);
		}
	});

	page.on('pageerror', (error) => {
		errors.push(error.message);
	});

	const test = async (name: string, fn: () => Promise<boolean>) => {
		try {
			const result = await fn();
			if (result) {
				console.log('✓', name);
				passed++;
			} else {
				console.log('❌', name);
				failed++;
			}
		} catch (error) {
			console.log('❌', name, '-', (error as Error).message);
			failed++;
		}
	};

	try {
		await page.goto(serverUrl, { waitUntil: 'networkidle' });

		await test('Lucide icons loaded', async () => {
			return await page.evaluate(
				() => typeof (window as any).lucide !== 'undefined',
			);
		});

		await test('PDF.js loaded', async () => {
			return await page.evaluate(
				() => typeof (window as any).pdfjsLib !== 'undefined',
			);
		});

		await test('PDF filename displayed', async () => {
			const text = await page.locator('#fileName').textContent();
			return text?.includes('test.pdf') || false;
		});

		await page.waitForTimeout(3000);

		await test('PDF preview rendered', async () => {
			const count = await page.locator('embed[type="application/pdf"]').count();
			return count > 0;
		});

		await test('Thumbnails generated (3 pages)', async () => {
			const count = await page.locator('.thumbnail-item').count();
			return count >= 3;
		});

		await test('Toggle overlays tool', async () => {
			await page.locator('#t-overlays .tool-header').click();
			await page.waitForTimeout(300);
			return await page
				.locator('#t-overlays')
				.evaluate((el) => el.classList.contains('active'));
		});

		await test('Switch to text tab', async () => {
			await page.locator('.tabs .tab:has-text("Text")').click();
			await page.waitForTimeout(200);
			return await page
				.locator('#overlay-text')
				.evaluate((el) => el.classList.contains('active'));
		});

		await test('Add date overlay shows modal', async () => {
			await page.locator('.tabs .tab:has-text("Date")').click();
			await page.waitForTimeout(200);
			await page.locator('button:has-text("Add Date Overlay")').click();
			await page.waitForTimeout(500);
			const visible = await page.locator('.modal-overlay.active').isVisible();
			if (visible) {
				await page.locator('button.modal-btn-primary').click();
				await page.waitForTimeout(300);
			}
			return visible;
		});

		await test('Export menu toggles', async () => {
			await page.locator('#exportBtn').click();
			await page.waitForTimeout(300);
			const visible = await page.locator('#exportMenu').isVisible();
			await page.locator('body').click({ position: { x: 10, y: 10 } });
			await page.waitForTimeout(200);
			return visible;
		});

		await test('Pages panel collapses', async () => {
			await page.locator('.thumbnails-header .collapse-btn').click();
			await page.waitForTimeout(300);
			const collapsed = await page
				.locator('#thumbnailsPanel')
				.evaluate((el) => el.classList.contains('collapsed'));
			await page.locator('.thumbnails-header .collapse-btn').click();
			await page.waitForTimeout(200);
			return collapsed;
		});

		await test('Select page shows remove button', async () => {
			await page
				.locator('.thumbnail-item')
				.first()
				.click({ modifiers: ['Control'] });
			await page.waitForTimeout(300);
			return await page.locator('#removePageBtn').isVisible();
		});

		await test('Merge tool opens', async () => {
			await page.locator('#t-merge .tool-header').click();
			await page.waitForTimeout(300);
			return await page
				.locator('#t-merge')
				.evaluate((el) => el.classList.contains('active'));
		});

		await test('No JavaScript errors', async () => {
			return errors.length === 0;
		});

		console.log('\n========================================');
		console.log('Test Results');
		console.log('========================================');
		console.log(`Passed: ${passed}`);
		console.log(`Failed: ${failed}`);
		console.log(`Total:  ${passed + failed}`);

		if (errors.length > 0) {
			console.log('\n❌ JavaScript Errors:');
			errors.forEach((err) => console.log('  -', err));
		}

		if (warnings.length > 0 && warnings.length < 5) {
			console.log('\n⚠️  Warnings:');
			warnings.forEach((warn) => console.log('  -', warn));
		}

		console.log(
			'\n' + (failed === 0 ? '✓ All tests passed!' : '❌ Some tests failed'),
		);
	} catch (error) {
		console.error('\n❌ Fatal error:', error);
		failed++;
	} finally {
		await browser.close();
		serverProcess.kill();
		process.exit(failed > 0 ? 1 : 0);
	}
}

runTests().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
