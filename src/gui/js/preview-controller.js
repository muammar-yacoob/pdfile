// Preview Controller - Manages PDF preview rendering, zoom, and pan

const PreviewController = {
	currentRenderTask: null,
	isRendering: false,
	pendingRender: null,

	async getPDFPageDimensions(pageNum) {
		if (!window.pdfDocument) return null;
		try {
			const page = await window.pdfDocument.getPage(pageNum);
			const viewport = page.getViewport({ scale: 1 });
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
		console.log(`[PreviewController.renderPage] Called with pageNum=${pageNum}`);
		if (!window.pdfDocument) return;

		// If already rendering, queue this render
		if (this.isRendering) {
			console.log(`[PreviewController.renderPage] Already rendering, queueing page ${pageNum}`);
			this.pendingRender = pageNum;
			return;
		}

		this.isRendering = true;

		try {
			// Cancel any active render task
			if (this.currentRenderTask) {
				try {
					this.currentRenderTask.cancel();
				} catch (err) {
					// Ignore
				}
			}

			const canvas = document.getElementById('pdfCanvas');
			if (!canvas) {
				this.isRendering = false;
				return;
			}

			window.currentPreviewPage = pageNum;
			console.log(`[PreviewController.renderPage] Set currentPreviewPage to ${pageNum}, about to getPage(${pageNum})`);
			const page = await window.pdfDocument.getPage(pageNum);

			// Calculate scale
			const previewArea = document.getElementById('previewArea');
			const containerWidth = previewArea.clientWidth - 20;
			const pageViewport = page.getViewport({ scale: 1 });
			const baseScale = containerWidth / pageViewport.width;
			const scale = window.zoomLevel === 'fit' ? baseScale : baseScale * window.zoomLevel;
			window.previewScale = scale;

			const viewport = page.getViewport({ scale });

			// Update canvas
			const context = canvas.getContext('2d');
			context.clearRect(0, 0, canvas.width, canvas.height);
			canvas.width = viewport.width;
			canvas.height = viewport.height;

			// Render PDF (store the task so we can cancel it)
			this.currentRenderTask = page.render({ canvasContext: context, viewport });
			await this.currentRenderTask.promise;
			this.currentRenderTask = null;

			// Update overlays
			this.updateGizmosForPage(pageNum);
		} catch (err) {
			if (err.name !== 'RenderingCancelledException') {
				console.error('Error rendering page:', err);
			}
		} finally {
			this.isRendering = false;

			// Process pending render if any
			if (this.pendingRender !== null) {
				const pending = this.pendingRender;
				this.pendingRender = null;
				this.renderPage(pending);
			}
		}
	},

	setZoom(newZoom, mousePos = null) {
		const oldZoom = window.zoomLevel === 'fit' ? 1.0 : window.zoomLevel;

		// Update zoom level
		if (typeof newZoom === 'number') {
			window.zoomLevel = Math.max(0.5, Math.min(3.0, newZoom)); // Clamp between 50% and 300%
		} else if (newZoom === 'fit') {
			window.zoomLevel = 'fit';
		}

		const newZoomValue = window.zoomLevel === 'fit' ? 1.0 : window.zoomLevel;

		// Update zoom display
		this.updateZoomDisplay();

		// Store mouse position and scroll for zoom adjustment
		if (mousePos) {
			const area = document.getElementById('previewArea');
			const scrollLeft = area.scrollLeft;
			const scrollTop = area.scrollTop;

			// Render at new zoom
			this.renderPage(window.currentPreviewPage).then(() => {
				// Adjust scroll to keep mouse position fixed
				const zoomRatio = newZoomValue / oldZoom;
				area.scrollLeft = (scrollLeft + mousePos.x) * zoomRatio - mousePos.x;
				area.scrollTop = (scrollTop + mousePos.y) * zoomRatio - mousePos.y;
			});
		} else {
			this.renderPage(window.currentPreviewPage);
		}
	},

	zoomIn() {
		const currentZoom = window.zoomLevel === 'fit' ? 1.0 : window.zoomLevel;
		this.setZoom(Math.min(3.0, currentZoom + 0.25));
	},

	zoomOut() {
		const currentZoom = window.zoomLevel === 'fit' ? 1.0 : window.zoomLevel;
		this.setZoom(Math.max(0.5, currentZoom - 0.25));
	},

	zoomFit() {
		// Toggle between fit mode and actual size (100%)
		if (window.zoomLevel === 'fit') {
			this.setZoom(1.0); // Go to actual size
		} else {
			this.setZoom('fit'); // Go to fit
		}
	},

	updateZoomDisplay() {
		const display = document.getElementById('zoomDisplay');
		if (!display) return;

		if (window.zoomLevel === 'fit') {
			display.textContent = 'Fit';
		} else {
			const percentage = Math.round(window.zoomLevel * 100);
			display.textContent = `${percentage}%`;
		}

		// Update fit button icon and tooltip
		this.updateFitButton();
	},

	updateFitButton() {
		const fitBtn = document.querySelector('.zoom-controls button:nth-child(4)'); // 4th button is fit
		if (!fitBtn) return;

		const icon = fitBtn.querySelector('i');
		if (!icon) return;

		if (window.zoomLevel === 'fit') {
			// Currently at fit, button should show "go to actual size"
			icon.setAttribute('data-lucide', 'scan');
			fitBtn.setAttribute('title', 'Actual Size (Ctrl+0)');
		} else {
			// Currently at specific zoom, button should show "go to fit"
			icon.setAttribute('data-lucide', 'maximize-2');
			fitBtn.setAttribute('title', 'Fit to Width (Ctrl+0)');
		}

		// Refresh Lucide icons
		if (window.lucide) window.lucide.createIcons();
	},

	toggleDarkMode() {
		const previewArea = document.getElementById('previewArea');
		const darkModeBtn = document.getElementById('darkModeBtn');
		if (!previewArea || !darkModeBtn) return;

		const isDark = previewArea.classList.toggle('dark-mode');

		// Also toggle on body for global dark mode (affects thumbnails)
		document.body.classList.toggle('dark-mode', isDark);

		// Update button icon
		const icon = darkModeBtn.querySelector('i');
		if (icon) {
			icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
			if (window.lucide) window.lucide.createIcons();
		}

		// Store preference
		localStorage.setItem('previewDarkMode', isDark ? 'true' : 'false');
	},

	initDarkMode() {
		const previewArea = document.getElementById('previewArea');
		const darkModeBtn = document.getElementById('darkModeBtn');
		if (!previewArea || !darkModeBtn) return;

		// Restore preference
		const isDark = localStorage.getItem('previewDarkMode') === 'true';
		if (isDark) {
			previewArea.classList.add('dark-mode');
			document.body.classList.add('dark-mode');
			const icon = darkModeBtn.querySelector('i');
			if (icon) {
				icon.setAttribute('data-lucide', 'sun');
				if (window.lucide) window.lucide.createIcons();
			}
		}
	},

	updateGizmosForPage(pageNum) {
		const canvasWrapper = document.querySelector('.canvas-wrapper');
		if (!canvasWrapper) return;

		// Remove existing gizmos
		const oldGizmos = canvasWrapper.querySelectorAll('.overlay-gizmo');
		oldGizmos.forEach((g) => g.remove());

		// Get canvas for scaling
		const canvas = document.getElementById('pdfCanvas');
		if (!canvas) return;

		// Re-add gizmos for this page with scaled positions and sizes
		const overlays = AppState.getOverlays();
		overlays.forEach((overlay, i) => {
			const overlayPage = (overlay.pageIndex || 0) + 1;
			if (overlayPage === pageNum) {
				// Calculate scale based on stored canvas size
				const storedWidth = overlay.canvasWidth || canvas.width;
				const storedHeight = overlay.canvasHeight || canvas.height;
				const scaleX = canvas.width / storedWidth;
				const scaleY = canvas.height / storedHeight;

				// Scale position
				const scaledX = overlay.x * scaleX;
				const scaledY = overlay.y * scaleY;

				// Update overlay with scaled dimensions for gizmo rendering
				const scaledOverlay = {
					...overlay,
					width: (overlay.width || 120) * scaleX,
					height: (overlay.height || 60) * scaleY,
					fontSize: overlay.fontSize ? overlay.fontSize * scaleX : undefined,
				};

				// Temporarily update for gizmo creation
				AppState.updateOverlay(i, scaledOverlay);

				const label =
					overlay.type === 'date'
						? `${overlay.dateText || 'Today'}`
						: overlay.type === 'text'
							? `Text: ${overlay.text || overlay.dateText}`
							: overlay.type === 'image'
								? 'Image'
								: 'Signature';

				// Use correct function name
				if (window.GizmoManager) {
					window.GizmoManager.createGizmo(overlay.type, label, scaledX, scaledY, i);
				}

				// Restore original overlay data
				AppState.updateOverlay(i, overlay);
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

		// Mouse wheel zoom towards cursor (only with Ctrl key)
		area.addEventListener(
			'wheel',
			(e) => {
				// Only zoom if Ctrl key is pressed
				if (!e.ctrlKey) return;

				e.preventDefault();

				// Smooth zoom with smaller increments
				const delta = e.deltaY < 0 ? 0.15 : -0.15;
				const oldZoom = window.zoomLevel === 'fit' ? 1.0 : window.zoomLevel;

				// Calculate new zoom level
				const newZoom = Math.max(0.5, Math.min(3.0, oldZoom + delta));

				// Get mouse position relative to preview area
				const rect = area.getBoundingClientRect();
				const mousePos = {
					x: e.clientX - rect.left,
					y: e.clientY - rect.top,
				};

				// Update zoom with mouse position
				this.setZoom(newZoom, mousePos);
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
