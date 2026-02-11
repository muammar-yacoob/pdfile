// Preview Controller - Manages PDF preview rendering, zoom, and pan

const PreviewController = {
	currentRenderTask: null,

	async getPDFPageDimensions(pageNum) {
		if (!window.pdfDocument) return null;
		try {
			const page = await window.pdfDocument.getPage(pageNum);
			const viewport = page.getViewport({ scale: 1 }); // Unscaled = PDF points
			return { width: viewport.width, height: viewport.height };
		} catch (err) {
			console.error('Error getting PDF page dimensions:', err);
			return null;
		}
	},

	canvasToPDFCoords(canvasX, canvasY, canvasWidth, canvasHeight, pageNum) {
		const pdfDims = this.getPDFPageDimensions(pageNum);
		if (!pdfDims) return { x: canvasX, y: canvasY };

		const pdfWidth = pdfDims.width;
		const pdfHeight = pdfDims.height;

		const scaleX = pdfWidth / canvasWidth;
		const scaleY = pdfHeight / canvasHeight;
		return {
			x: canvasX * scaleX,
			y: canvasY * scaleY,
		};
	},

	async renderPage(pageNum) {
		if (!window.pdfDocument) return;

		// Cancel previous render task if still running
		if (this.currentRenderTask) {
			try {
				await this.currentRenderTask.cancel();
			} catch (err) {
				// Ignore cancellation errors
			}
			this.currentRenderTask = null;
		}

		window.currentPreviewPage = pageNum;
		const page = await window.pdfDocument.getPage(pageNum);

		const canvas = document.getElementById('pdfCanvas');
		if (!canvas) return;

		const context = canvas.getContext('2d');

		// Clear previous overlays
		const wrapper = canvas.parentElement;
		if (wrapper) {
			const oldOverlays = wrapper.querySelectorAll('.overlay-gizmo');
			oldOverlays.forEach((o) => o.remove());
		}

		// Calculate base scale to fill width
		const previewArea = document.getElementById('previewArea');
		const containerWidth = previewArea.clientWidth - 20;
		const pageViewport = page.getViewport({ scale: 1 });

		const baseScale = containerWidth / pageViewport.width; // Fill width

		// Apply zoom level - if 'fit', use baseScale; otherwise apply zoom multiplier
		const scale =
			window.zoomLevel === 'fit' ? baseScale : baseScale * window.zoomLevel;
		window.previewScale = scale;

		const viewport = page.getViewport({ scale });

		canvas.width = viewport.width;
		canvas.height = viewport.height;

		// Store render task so we can cancel it if needed
		this.currentRenderTask = page.render({ canvasContext: context, viewport });

		try {
			await this.currentRenderTask.promise;
		} catch (err) {
			// Ignore cancellation errors
			if (err.name !== 'RenderingCancelledException') {
				console.error('Error rendering preview page:', err);
			}
			return;
		}

		this.currentRenderTask = null;

		// Render overlays for this page
		this.updateGizmosForPage(pageNum);
	},

	setZoom(newZoom) {
		// Convert 'fit' to numeric value first if needed
		if (window.zoomLevel === 'fit') {
			window.zoomLevel = 1.0;
		}

		// If newZoom is a delta adjustment, add it to current zoom
		if (typeof newZoom === 'number') {
			window.zoomLevel = Math.max(0.5, Math.min(3.0, newZoom)); // Clamp between 50% and 300%
		} else if (newZoom === 'fit') {
			window.zoomLevel = 'fit';
		}

		this.renderPage(window.currentPreviewPage);
	},

	updateGizmosForPage(pageNum) {
		const canvasWrapper = document.querySelector('.canvas-wrapper');
		if (!canvasWrapper) return;

		// Remove existing gizmos
		const oldGizmos = canvasWrapper.querySelectorAll('.overlay-gizmo');
		oldGizmos.forEach((g) => g.remove());

		// Re-add gizmos for this page
		const overlays = AppState.getOverlays();
		overlays.forEach((overlay, i) => {
			const overlayPage = (overlay.pageIndex || 0) + 1;
			if (overlayPage === pageNum) {
				const label =
					overlay.type === 'date'
						? `${overlay.dateText || 'Today'}`
						: overlay.type === 'text'
							? `Text: ${overlay.text || overlay.dateText}`
							: overlay.type === 'image'
								? 'Image'
								: 'Signature';
				window.GizmoManager?.add(overlay.type, label, overlay.x, overlay.y, i);
			}
		});
	},

	setupInteraction() {
		const previewArea = document.getElementById('previewArea');
		if (!previewArea) return;

		// Remove old listeners by cloning and replacing the element
		const newPreviewArea = previewArea.cloneNode(true);
		previewArea.parentNode.replaceChild(newPreviewArea, previewArea);
		const area = newPreviewArea;

		// Mouse wheel zoom
		area.addEventListener(
			'wheel',
			(e) => {
				e.preventDefault();

				// Smooth zoom with smaller increments
				const delta = e.deltaY < 0 ? 0.15 : -0.15;

				// Get current scroll position
				const scrollLeft = area.scrollLeft;
				const scrollTop = area.scrollTop;
				const oldZoom = window.zoomLevel === 'fit' ? 1.0 : window.zoomLevel;

				// Calculate new zoom level
				const newZoom = Math.max(0.5, Math.min(3.0, oldZoom + delta));

				// Update zoom immediately (no debounce)
				this.setZoom(newZoom);

				// Adjust scroll to zoom toward center
				requestAnimationFrame(() => {
					const zoomRatio = newZoom / oldZoom;
					area.scrollLeft = scrollLeft * zoomRatio;
					area.scrollTop = scrollTop * zoomRatio;
				});
			},
			{ passive: false },
		);

		// Panning functionality
		let isPanning = false;
		let startX = 0;
		let startY = 0;
		let scrollLeft = 0;
		let scrollTop = 0;

		area.addEventListener('mousedown', (e) => {
			// Only pan if clicking on the preview area itself, not on overlays/gizmos
			if (
				e.target === area ||
				e.target.classList.contains('canvas-wrapper') ||
				e.target.id === 'pdfCanvas'
			) {
				isPanning = true;
				startX = e.pageX - area.offsetLeft;
				startY = e.pageY - area.offsetTop;
				scrollLeft = area.scrollLeft;
				scrollTop = area.scrollTop;
				area.classList.add('panning');
			}
		});

		area.addEventListener('mousemove', (e) => {
			if (!isPanning) return;
			e.preventDefault();

			const x = e.pageX - area.offsetLeft;
			const y = e.pageY - area.offsetTop;
			const walkX = (x - startX) * 1.5; // Multiply for faster panning
			const walkY = (y - startY) * 1.5;

			area.scrollLeft = scrollLeft - walkX;
			area.scrollTop = scrollTop - walkY;
		});

		area.addEventListener('mouseup', () => {
			isPanning = false;
			area.classList.remove('panning');
		});

		area.addEventListener('mouseleave', () => {
			isPanning = false;
			area.classList.remove('panning');
		});

		// Click to deselect overlays
		const canvasWrapper = area.querySelector('.canvas-wrapper');
		if (canvasWrapper) {
			canvasWrapper.addEventListener('click', (e) => {
				if (e.target === canvasWrapper || e.target.id === 'pdfCanvas') {
					SelectionManager.deselectOverlay();
				}
			});
		}
	},
};

// Expose to window
window.PreviewController = PreviewController;
