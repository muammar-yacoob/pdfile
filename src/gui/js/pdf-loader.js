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
			previewArea.innerHTML = `<div class="canvas-wrapper"><canvas id="pdfCanvas"></canvas></div>`;

			// Setup zoom and pan interactions
			if (window.PreviewController) {
				window.PreviewController.setupInteraction();
			}

			// Auto-fit to width on initial load
			window.zoomLevel = 'fit';
			await this.loadThumbnails(data.filePath);
			await window.PreviewController?.renderPage(1);
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
				<div class="preview-hotkeys">
					<div class="hotkey-icon">
						<i data-lucide="info" style="width: 16px; height: 16px;"></i>
					</div>
					<div class="hotkey-content">
						<div class="hotkey-item">
							<kbd>←↑↓→</kbd><span>Move overlay</span>
						</div>
						<div class="hotkey-item">
							<kbd>Alt</kbd><span>+</span><kbd>←↑↓→</kbd><span>Precise move</span>
						</div>
						<div class="hotkey-item">
							<kbd>Del</kbd><span>Delete overlay</span>
						</div>
						<div class="hotkey-item">
							<kbd>Esc</kbd><span>Deselect</span>
						</div>
					</div>
				</div>
				<!-- Zoom Controls (Bottom Right) -->
				<div class="zoom-controls">
					<button class="zoom-btn" onclick="PreviewController.zoomOut()" title="Zoom Out (Scroll Down)">
						<i data-lucide="minus" style="width: 14px; height: 14px;"></i>
					</button>
					<div class="zoom-display" id="zoomDisplay">100%</div>
					<button class="zoom-btn" onclick="PreviewController.zoomIn()" title="Zoom In (Scroll Up)">
						<i data-lucide="plus" style="width: 14px; height: 14px;"></i>
					</button>
					<button class="zoom-btn" onclick="PreviewController.zoomFit()" title="Fit to Width">
						<i data-lucide="maximize-2" style="width: 14px; height: 14px;"></i>
					</button>
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
