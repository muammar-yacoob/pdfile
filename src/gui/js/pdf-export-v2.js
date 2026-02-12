// PDF Export with Canvas Capture - Simple WYSIWYG approach
const PDFExportV2 = (() => {
	/**
	 * Render a single page with all its overlays at actual PDF size (scale 1.0)
	 * @param {number} pageNum - Page number (1-indexed)
	 * @returns {Promise<string|null>} - Base64 PNG data URL or null if no overlays
	 */
	async function capturePageWithOverlays(pageNum) {
		const overlays = AppState.getOverlays();
		const pageIndex = pageNum - 1;

		// Check if this page has any overlays
		const pageOverlays = overlays.filter(o => (o.pageIndex || 0) === pageIndex);
		if (pageOverlays.length === 0) {
			return null; // No overlays, keep original vector page
		}

		const pdfCanvas = document.getElementById('pdfCanvas');
		const canvasWrapper = document.querySelector('.canvas-wrapper');
		if (!pdfCanvas || !canvasWrapper) {
			console.error('PDF canvas or wrapper not found');
			return null;
		}

		// Navigate to the page if not already there
		if (window.currentPreviewPage !== pageNum) {
			await window.PreviewController.renderPage(pageNum);
			await new Promise(resolve => setTimeout(resolve, 100)); // Wait for render
		}

		// Save the original canvas state
		const ctx = pdfCanvas.getContext('2d');
		const originalImageData = ctx.getImageData(0, 0, pdfCanvas.width, pdfCanvas.height);

		// Get all gizmos for this page
		const gizmos = canvasWrapper.querySelectorAll('.overlay-gizmo');

		// Draw overlays directly onto the PDF canvas from their gizmo positions
		for (const gizmo of gizmos) {
			const overlayIndex = parseInt(gizmo.dataset.overlayIndex);
			const overlay = window.AppState.getOverlay(overlayIndex);
			if (!overlay || (overlay.pageIndex || 0) !== pageIndex) continue;

			// Read position and size from gizmo element
			const x = parseFloat(gizmo.style.left) || 0;
			const y = parseFloat(gizmo.style.top) || 0;
			const w = parseFloat(gizmo.style.width) || gizmo.offsetWidth;
			const h = parseFloat(gizmo.style.height) || gizmo.offsetHeight;

			ctx.save();

			// Apply rotation if present
			if (overlay.rotation) {
				const centerX = x + w / 2;
				const centerY = y + h / 2;
				ctx.translate(centerX, centerY);
				ctx.rotate((overlay.rotation * Math.PI) / 180);
				ctx.translate(-centerX, -centerY);
			}

			// Apply opacity
			const opacity = (overlay.opacity !== undefined ? overlay.opacity : 100) / 100;
			ctx.globalAlpha = opacity;

			// Draw based on overlay type
			if (overlay.type === 'text' || overlay.type === 'date') {
				const textEl = gizmo.querySelector('.overlay-gizmo-text');
				if (textEl) {
					const computedStyle = window.getComputedStyle(textEl);
					const fontSize = parseFloat(computedStyle.fontSize);
					const fontWeight = computedStyle.fontWeight;
					const fontStyle = computedStyle.fontStyle;
					const fontFamily = computedStyle.fontFamily;
					const color = computedStyle.color;
					const bgColor = computedStyle.backgroundColor;

					ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
					ctx.fillStyle = color;
					ctx.textBaseline = 'middle';

					// Draw background if exists
					if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
						const bgMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
						if (bgMatch) {
							const r = bgMatch[1], g = bgMatch[2], b = bgMatch[3];
							const a = bgMatch[4] ? parseFloat(bgMatch[4]) : 1;
							ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
							ctx.fillRect(x, y, w, h);
							ctx.fillStyle = color;
						}
					}

					// Draw text vertically centered with small padding to prevent clipping
					const text = textEl.textContent;
					const textY = y + h / 2;
					const textX = x + 2; // Add 2px padding from left edge to prevent clipping

					// Handle letter spacing if present
					const letterSpacing = parseFloat(computedStyle.letterSpacing) || 0;
					if (letterSpacing && letterSpacing !== 0 && !isNaN(letterSpacing)) {
						let currentX = textX;
						for (const char of text) {
							ctx.fillText(char, currentX, textY);
							currentX += ctx.measureText(char).width + letterSpacing;
						}
					} else {
						ctx.fillText(text, textX, textY);
					}

					// Draw underline if present
					if (computedStyle.textDecoration.includes('underline')) {
						const metrics = ctx.measureText(text);
						ctx.strokeStyle = color;
						ctx.lineWidth = 1;
						ctx.beginPath();
						ctx.moveTo(textX, y + h / 2 + fontSize / 2);
						ctx.lineTo(textX + metrics.width, y + h / 2 + fontSize / 2);
						ctx.stroke();
					}
				}
			} else if (overlay.type === 'image' || overlay.type === 'signature') {
				const imgEl = gizmo.querySelector('img');
				if (imgEl && imgEl.complete) {
					// Check for container opacity
					const imgPreview = gizmo.querySelector('.overlay-gizmo-image-preview');
					if (imgPreview) {
						const containerStyle = window.getComputedStyle(imgPreview);
						const containerOpacity = parseFloat(containerStyle.opacity);
						ctx.globalAlpha = ctx.globalAlpha * containerOpacity;
					}
					ctx.drawImage(imgEl, x, y, w, h);
				}
			}

			ctx.restore();
		}

		// Capture the canvas with overlays drawn on it
		const dataURL = pdfCanvas.toDataURL('image/png');

		// Restore the original canvas (remove the overlays we just drew)
		ctx.putImageData(originalImageData, 0, 0);

		return dataURL;
	}

	/**
	 * Export PDF with canvas-captured overlay pages
	 */
	async function exportPDF() {
		// Sync from global state if sync function exists
		if (window.syncBeforeExport) {
			window.syncBeforeExport();
		}

		const currentPdfFile = AppState.getCurrentFile();
		if (!currentPdfFile) return;

		const exportBtn = document.getElementById('exportBtn');
		if (!exportBtn) return;

		const originalHtml = exportBtn.innerHTML;

		try {
			// Show processing indicator
			exportBtn.innerHTML = '<i data-lucide="loader" style="animation: spin 1s linear infinite;"></i>';
			exportBtn.disabled = true;

			console.log('\n=== Starting Canvas-Based Export ===');

			// Build the current page order from thumbnails
			const thumbnails = Array.from(document.querySelectorAll('.thumbnail-item'));
			const pageOrder = thumbnails.map((item, idx) => ({
				pageNum: parseInt(item.dataset.originalPage) || parseInt(item.dataset.pageNum),
				source: item.dataset.source || 'original',
				displayOrder: idx + 1,
			}));

			// Check if pages have been reordered
			const hasReordering = pageOrder.some((item, idx) => item.pageNum !== idx + 1);

			// Get overlays and check which pages have them
			const overlays = AppState.getOverlays();
			const pagesWithOverlays = new Set(overlays.map(o => (o.pageIndex || 0) + 1));

			console.log(`Pages with overlays: ${Array.from(pagesWithOverlays).join(', ')}`);

			// Capture pages with overlays
			const capturedPages = [];
			for (let pageNum = 1; pageNum <= thumbnails.length; pageNum++) {
				if (pagesWithOverlays.has(pageNum)) {
					console.log(`Capturing page ${pageNum}...`);
					const imageData = await capturePageWithOverlays(pageNum);
					if (imageData) {
						capturedPages.push({
							pageNum: pageNum,
							imageData: imageData
						});
						console.log(`✓ Page ${pageNum} captured`);
					}
				}
			}

			// Check if we have changes
			const mergedPagesData = AppState.getMergedPagesData();
			const hasMergedPages = mergedPagesData.length > 0;
			const serializableMergedPages = hasMergedPages
				? AppState.getSerializableMergedPages()
				: null;

			console.log(`Sending ${capturedPages.length} captured pages to backend`);

			// Send request with captured pages
			const response = await fetch('/api/export-pdf-v2', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					hasMergedPages,
					hasReordering,
					pageOrder,
					capturedPages: capturedPages,
					mergedPagesData: serializableMergedPages,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				console.error('Export failed with error:', error);
				if (error.stack) {
					console.error('Server stack trace:', error.stack);
				}
				throw new Error(error.error || 'Failed to export PDF');
			}

			const result = await response.json();

			// Clear unsaved changes flag after successful export
			if (window.AppState && window.AppState.clearUnsavedChanges) {
				window.AppState.clearUnsavedChanges();
			}

			// Show success message with file location
			if (window.showModal) {
				const folderPath = result.filePath.substring(0, result.filePath.lastIndexOf('\\'));
				window.showModal(
					'PDF Saved Successfully',
					`<p>Your PDF has been saved to:</p>
					<p style="font-family: monospace; background: var(--bg3); padding: 8px; border-radius: 4px; margin: 12px 0; word-break: break-all;">${result.filePath}</p>
					<button onclick="closeModal(); window.openFolder('${folderPath.replace(/\\/g, '\\\\')}')" class="modal-btn modal-btn-primary" style="margin-top: 12px;">
						<i data-lucide="folder-open" style="width: 16px; height: 16px; margin-right: 6px;"></i>
						Open Folder
					</button>`,
					false,
				);

				if (window.lucide) {
					window.lucide.createIcons();
				}
			}

			console.log('✓ Export completed successfully');

		} catch (error) {
			console.error('Export error:', error);
			if (window.showModal) {
				window.showModal('Export Failed', `Failed to export PDF: ${error.message}`);
			}
		} finally {
			exportBtn.innerHTML = originalHtml;
			exportBtn.disabled = false;

			if (window.lucide) {
				window.lucide.createIcons();
			}
		}
	}

	return {
		exportPDF,
		capturePageWithOverlays, // Exposed for testing
	};
})();

// Export to window
window.PDFExportV2 = PDFExportV2;

// Override the default export function to use V2
window.exportPDF = PDFExportV2.exportPDF;
