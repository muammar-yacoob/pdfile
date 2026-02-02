/**
 * API functionality tests - tests actual PDF manipulations
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create test PDF and test image
async function createTestFixtures() {
  const fixturesDir = join(__dirname, '../test-fixtures');
  if (!existsSync(fixturesDir)) {
    await mkdir(fixturesDir, { recursive: true });
  }

  const testPdfPath = join(fixturesDir, 'test.pdf');
  const testImagePath = join(fixturesDir, 'test-signature.png');
  const testMergePdfPath = join(fixturesDir, 'test-merge.pdf');

  if (!existsSync(testPdfPath)) {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (let i = 1; i <= 3; i++) {
      const page = pdfDoc.addPage([612, 792]);
      page.drawText(`Test PDF Document`, { x: 50, y: 700, size: 30, font, color: rgb(0, 0, 0) });
      page.drawText(`Page ${i} Content`, { x: 50, y: 400, size: 20, font });
    }

    const pdfBytes = await pdfDoc.save();
    await writeFile(testPdfPath, pdfBytes);
    console.log('✓ Created test PDF');
  }

  // Create merge PDF
  if (!existsSync(testMergePdfPath)) {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([612, 792]);
    page.drawText(`Merge Test PDF`, { x: 50, y: 700, size: 30, font, color: rgb(0, 0, 0) });
    const pdfBytes = await pdfDoc.save();
    await writeFile(testMergePdfPath, pdfBytes);
    console.log('✓ Created merge test PDF');
  }

  // Create a simple PNG signature
  if (!existsSync(testImagePath)) {
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(300, 100);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 300, 100);

    ctx.fillStyle = 'black';
    ctx.font = '30px Arial';
    ctx.fillText('Test Signature', 20, 60);

    const buffer = canvas.toBuffer('image/png');
    await writeFile(testImagePath, buffer);
    console.log('✓ Created test signature image');
  }

  return { testPdfPath, testImagePath, testMergePdfPath };
}

// Start server
async function startServer(testPdfPath: string): Promise<{ process: any, url: string }> {
  return new Promise((resolve, reject) => {
    const serverProcess = spawn('node', ['dist/cli.js', 'pdfile', testPdfPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

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

// Main test runner
async function runAPITests() {
  console.log('\n========================================');
  console.log('PDFile API Functionality Tests');
  console.log('========================================\n');

  const { testPdfPath, testImagePath, testMergePdfPath } = await createTestFixtures();
  const { process: serverProcess, url: serverUrl } = await startServer(testPdfPath);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

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
    await page.waitForTimeout(2000);

    // Test 1: Convert to Word
    await test('Convert PDF to Word', async () => {
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await page.locator('#exportBtn').click();
      await page.waitForTimeout(300);
      await page.locator('button:has-text("Convert to Word")').click();

      const download = await downloadPromise;
      const fileName = download.suggestedFilename();
      console.log('  Downloaded:', fileName);

      return fileName.endsWith('.docx');
    });

    // Test 2: Reorder pages
    await test('Reorder pages', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // Drag first thumbnail to second position
      const thumbnails = page.locator('.thumbnail-item');
      const first = thumbnails.nth(0);
      const second = thumbnails.nth(1);

      const firstBox = await first.boundingBox();
      const secondBox = await second.boundingBox();

      if (firstBox && secondBox) {
        await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
        await page.mouse.up();
        await page.waitForTimeout(500);

        const reorderBtnVisible = await page.locator('#reorderBtn').isVisible();
        if (!reorderBtnVisible) return false;

        const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
        await page.locator('#reorderBtn').click();
        await page.waitForTimeout(500);

        // Confirm modal
        const confirmBtn = page.locator('button.modal-btn-primary:has-text("Confirm")');
        if (await confirmBtn.isVisible()) {
          await confirmBtn.click();
        }

        const download = await downloadPromise;
        const fileName = download.suggestedFilename();
        console.log('  Downloaded:', fileName);

        return fileName.includes('reordered.pdf');
      }
      return false;
    });

    // Test 3: Remove pages
    await test('Remove pages', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // Select first page
      await page.locator('.thumbnail-item').first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(500);

      const removeBtnVisible = await page.locator('#removePageBtn').isVisible();
      if (!removeBtnVisible) return false;

      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await page.locator('#removePageBtn').click();
      await page.waitForTimeout(500);

      // Confirm modal
      const confirmBtn = page.locator('button.modal-btn-primary:has-text("Confirm")');
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }

      const download = await downloadPromise;
      const fileName = download.suggestedFilename();
      console.log('  Downloaded:', fileName);

      return fileName.includes('removed.pdf');
    });

    // Test 4: Add date overlay and export
    await test('Add date overlay and export', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Open overlays tool
      await page.locator('#t-overlays .tool-header').click();
      await page.waitForTimeout(300);

      // Add date overlay
      await page.locator('button:has-text("Add Date Overlay")').click();
      await page.waitForTimeout(500);

      // Close modal
      const okBtn = page.locator('button.modal-btn-primary:has-text("OK")');
      if (await okBtn.isVisible()) {
        await okBtn.click();
        await page.waitForTimeout(300);
      }

      // Export
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await page.locator('#exportBtn').click();
      await page.waitForTimeout(300);
      await page.locator('button:has-text("Export PDF")').click();

      const download = await downloadPromise;
      const fileName = download.suggestedFilename();
      console.log('  Downloaded:', fileName);

      return fileName.includes('exported.pdf') || fileName.includes('with_date.pdf');
    });

    // Test 5: Add image overlay
    await test('Add image overlay', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Open overlays tool
      await page.locator('#t-overlays .tool-header').click();
      await page.waitForTimeout(300);

      // Switch to image tab
      await page.locator('.tabs .tab:has-text("Image")').click();
      await page.waitForTimeout(300);

      // Upload image
      const fileInput = page.locator('#imageFile');
      await fileInput.setInputFiles(testImagePath);
      await page.waitForTimeout(300);

      // Add overlay
      await page.locator('button:has-text("Add Image Overlay")').click();
      await page.waitForTimeout(500);

      // Close modal
      const okBtn = page.locator('button.modal-btn-primary:has-text("OK")');
      if (await okBtn.isVisible()) {
        await okBtn.click();
        await page.waitForTimeout(300);
      }

      // Export
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await page.locator('#exportBtn').click();
      await page.waitForTimeout(300);
      await page.locator('button:has-text("Export PDF")').click();

      const download = await downloadPromise;
      const fileName = download.suggestedFilename();
      console.log('  Downloaded:', fileName);

      return fileName.includes('exported.pdf') || fileName.includes('overlay.pdf');
    });

    // Test 6: Add signature
    await test('Add signature overlay', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Open overlays tool
      await page.locator('#t-overlays .tool-header').click();
      await page.waitForTimeout(300);

      // Switch to signature tab
      await page.locator('.tabs .tab:has-text("Sign")').click();
      await page.waitForTimeout(300);

      // Upload signature
      const fileInput = page.locator('#signatureFile');
      await fileInput.setInputFiles(testImagePath);
      await page.waitForTimeout(300);

      // Add signature
      await page.locator('button:has-text("Add Signature Overlay")').click();
      await page.waitForTimeout(500);

      // Close modal
      const okBtn = page.locator('button.modal-btn-primary:has-text("OK")');
      if (await okBtn.isVisible()) {
        await okBtn.click();
        await page.waitForTimeout(300);
      }

      // Export
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await page.locator('#exportBtn').click();
      await page.waitForTimeout(300);
      await page.locator('button:has-text("Export PDF")').click();

      const download = await downloadPromise;
      const fileName = download.suggestedFilename();
      console.log('  Downloaded:', fileName);

      return fileName.includes('exported.pdf') || fileName.includes('signed.pdf');
    });

    // Test 7: Merge PDFs
    await test('Merge PDFs', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Open merge tool
      await page.locator('#t-merge .tool-header').click();
      await page.waitForTimeout(300);

      // Set up file chooser handler
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.locator('button:has-text("Add to End")').click();

      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(testMergePdfPath);

      // Wait for download
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      const download = await downloadPromise;
      const fileName = download.suggestedFilename();
      console.log('  Downloaded:', fileName);

      return fileName.includes('merged.pdf');
    });

    console.log('\n========================================');
    console.log('API Test Results');
    console.log('========================================');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total:  ${passed + failed}`);

    console.log('\n' + (failed === 0 ? '✓ All API tests passed!' : '❌ Some tests failed'));

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    failed++;
  } finally {
    await browser.close();
    serverProcess.kill();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runAPITests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
