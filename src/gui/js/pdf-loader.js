// PDF Loader - Handles PDF file loading and initialization

const PDFLoader = {
	async loadInitial() {
		try {
			const response = await fetch('/api/pdf-info');
			if (!response.ok) {
				console.log('No initial PDF loaded');
				return;
			}

			const data = await response.json();
			window.currentPdfPath = data.filePath;
			window.currentPdfFile = data.fileName;
			document.getElementById('fileName').textContent = data.fileName;

			// Enable merge button
			document.getElementById('mergeBtn').disabled = false;

			// Load PDF preview
			const previewArea = document.getElementById('previewArea');
			previewArea.innerHTML = `
				<div class="canvas-wrapper"><canvas id="pdfCanvas"></canvas></div>

				<!-- Hotkeys Display (Bottom Left) -->
				<div class="preview-hotkeys" id="previewHotkeys" onclick="toggleHotkeys()">
					<div class="hotkey-icon">
						<i data-lucide="keyboard" style="width: 16px; height: 16px;"></i>
					</div>
					<div class="hotkey-content">
						<div class="hotkey-item">
							<kbd>Ctrl</kbd><span>+</span><kbd>0</kbd><span>Toggle fit/100%</span>
						</div>
						<div class="hotkey-item">
							<kbd>Ctrl</kbd><span>+</span><kbd>+/-</kbd><span>Zoom in/out</span>
						</div>
						<div class="hotkey-item">
							<kbd>Ctrl</kbd><span>+</span><kbd>Scroll</kbd><span>Zoom</span>
						</div>
						<div class="hotkey-item">
							<kbd>←↑↓→</kbd><span>Move overlay</span>
						</div>
						<div class="hotkey-item">
							<kbd>Del</kbd><span>Delete</span>
						</div>
					</div>
				</div>

				<!-- Zoom Controls (Bottom Right) -->
				<div class="zoom-controls">
					<button class="zoom-btn" onclick="PreviewController.zoomOut()" title="Zoom Out (Ctrl+-)">
						<i data-lucide="minus" style="width: 11px; height: 11px;"></i>
					</button>
					<div class="zoom-display" id="zoomDisplay">100%</div>
					<button class="zoom-btn" onclick="PreviewController.zoomIn()" title="Zoom In (Ctrl++)">
						<i data-lucide="plus" style="width: 11px; height: 11px;"></i>
					</button>
					<button class="zoom-btn" onclick="PreviewController.zoomFit()" title="Fit to Width (Ctrl+0)">
						<i data-lucide="maximize-2" style="width: 11px; height: 11px;"></i>
					</button>
					<div style="width: 1px; height: 20px; background: var(--brd); margin: 0 4px;"></div>
					<button class="zoom-btn" id="darkModeBtn" onclick="PreviewController.toggleDarkMode()" title="Toggle Dark Background">
						<i data-lucide="moon" style="width: 11px; height: 11px;"></i>
					</button>
				</div>

				<!-- Processing Overlay -->
				<div class="processing-overlay" id="processingOverlay" style="display: none;">
					<div class="processing-content">
						<div class="processing-spinner"></div>
						<div class="processing-text" id="processingText">Processing...</div>
					</div>
				</div>
			`;

			// Initialize Lucide icons for toolbar
			if (window.lucide) {
				window.lucide.createIcons();
			}

			// Setup zoom and pan interactions
			if (window.PreviewController) {
				window.PreviewController.setupInteraction();
			}

			// Auto-fit to width on initial load
			window.zoomLevel = 'fit';
			await this.loadThumbnails(data.filePath);
			await window.PreviewController?.renderPage(1);

			// Update zoom display and fit button
			window.PreviewController?.updateZoomDisplay();
		} catch (err) {
			console.error('Failed to load initial PDF:', err);
		}
	},

	openFilePicker() {
		const fileInput = document.getElementById('fileInput');
		fileInput.onchange = async (e) => {
			const file = e.target.files[0];
			if (file && file.name.toLowerCase().endsWith('.pdf')) {
				await this.loadFile(file);
			} else {
				showModal('Invalid File', 'Please select a PDF file');
			}
			fileInput.value = '';
		};
		fileInput.click();
	},

	async loadFile(file) {
		try {
			const objectUrl = URL.createObjectURL(file);
			window.currentPdfFile = file.name;
			document.getElementById('fileName').textContent = file.name;

			// Enable merge button
			document.getElementById('mergeBtn').disabled = false;

			// Clear merged pages data when loading new PDF
			window.mergedPagesData = [];

			// Show preview
			const previewArea = document.getElementById('previewArea');
			previewArea.innerHTML = `
				<div class="canvas-wrapper"><canvas id="pdfCanvas"></canvas></div>
				<!-- Hotkeys Display (Bottom Left) -->
				<div class="preview-hotkeys" id="previewHotkeys" onclick="toggleHotkeys()">
					<div class="hotkey-icon">
						<i data-lucide="keyboard" style="width: 16px; height: 16px;"></i>
					</div>
					<div class="hotkey-content">
						<div class="hotkey-item">
							<kbd>Ctrl</kbd><span>+</span><kbd>0</kbd><span>Toggle fit/100%</span>
						</div>
						<div class="hotkey-item">
							<kbd>Ctrl</kbd><span>+</span><kbd>+/-</kbd><span>Zoom in/out</span>
						</div>
						<div class="hotkey-item">
							<kbd>Ctrl</kbd><span>+</span><kbd>Scroll</kbd><span>Zoom</span>
						</div>
						<div class="hotkey-item">
							<kbd>←↑↓→</kbd><span>Move overlay</span>
						</div>
						<div class="hotkey-item">
							<kbd>Del</kbd><span>Delete</span>
						</div>
					</div>
				</div>
				<!-- Zoom Controls (Bottom Right) -->
				<div class="zoom-controls">
					<button class="zoom-btn" onclick="PreviewController.zoomOut()" title="Zoom Out (Ctrl+-)">
						<i data-lucide="minus" style="width: 11px; height: 11px;"></i>
					</button>
					<div class="zoom-display" id="zoomDisplay">100%</div>
					<button class="zoom-btn" onclick="PreviewController.zoomIn()" title="Zoom In (Ctrl++)">
						<i data-lucide="plus" style="width: 11px; height: 11px;"></i>
					</button>
					<button class="zoom-btn" onclick="PreviewController.zoomFit()" title="Fit to Width (Ctrl+0)">
						<i data-lucide="maximize-2" style="width: 11px; height: 11px;"></i>
					</button>
					<div style="width: 1px; height: 20px; background: var(--brd); margin: 0 4px;"></div>
					<button class="zoom-btn" id="darkModeBtn" onclick="PreviewController.toggleDarkMode()" title="Toggle Dark Background">
						<i data-lucide="moon" style="width: 11px; height: 11px;"></i>
					</button>
				</div>

				<!-- Processing Overlay -->
				<div class="processing-overlay" id="processingOverlay" style="display: none;">
					<div class="processing-content">
						<div class="processing-spinner"></div>
						<div class="processing-text" id="processingText">Processing...</div>
					</div>
				</div>
			`;

			// Create Lucide icons
			lucide.createIcons();

			// Setup zoom and pan interactions
			if (window.PreviewController) {
				window.PreviewController.setupInteraction();
			}

			// Load PDF for thumbnails
			const arrayBuffer = await file.arrayBuffer();
			window.pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer })
				.promise;

			// Auto-fit to width
			window.zoomLevel = 'fit';

			await window.ThumbnailRenderer?.generate();
			await window.PreviewController?.renderPage(1);

			// Update zoom display and fit button
			window.PreviewController?.updateZoomDisplay();
		} catch (err) {
			showModal('Error', `Failed to load PDF: ${err.message}`);
		}
	},

	async loadThumbnails(filePath) {
		try {
			const response = await fetch(
				`/pdf/${encodeURIComponent(window.currentPdfFile)}`,
			);
			const arrayBuffer = await response.arrayBuffer();
			window.pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer })
				.promise;
			await window.ThumbnailRenderer?.generate();
		} catch (err) {
			console.error('Failed to generate thumbnails:', err);
		}
	},
};

// Expose to window
window.PDFLoader = PDFLoader;
