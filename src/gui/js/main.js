// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.js';

// ===== STATE (using AppState module) =====
let currentPdfPath = null; // Keep local (not in AppState)
let pageOrder = []; // Keep local (working data)

// Aliases to AppState (for backward compatibility with existing code)
let currentPdfFile = null; // Will sync with AppState
let pdfDocument = null; // Will sync with AppState
let mergedPagesData = []; // Will sync with AppState
let selectedPages = new Set(); // Will sync with AppState

// Expose pdfDocument to window for export functionality
window.pdfDocument = pdfDocument;
let lastSelectedPage = null; // Will sync with AppState

// Expose to window for cross-module access
window.selectedPages = selectedPages;
window.lastSelectedPage = lastSelectedPage;
let pendingOverlays = []; // Will sync with AppState
let selectedOverlayIndex = null; // Will sync with AppState

// Sync local vars with AppState on changes
function syncStateToLocal() {
	currentPdfFile = AppState.getCurrentFile();
	pdfDocument = AppState.getPdfDocument();
	mergedPagesData = AppState.getMergedPagesData();
	selectedPages = AppState.getSelectedPages();
	window.selectedPages = selectedPages; // Keep window reference in sync
	lastSelectedPage = AppState.getLastSelectedPage();
	window.lastSelectedPage = lastSelectedPage; // Keep window reference in sync
	pendingOverlays = AppState.getOverlays();
	selectedOverlayIndex = AppState.getSelectedIndex();
}

function syncStateFromLocal() {
	if (currentPdfFile) AppState.setCurrentFile(currentPdfFile);
	if (pdfDocument) AppState.setPdfDocument(pdfDocument);
	if (mergedPagesData) AppState.setMergedPagesData(mergedPagesData);
	AppState.setSelectedPages(selectedPages);
	if (lastSelectedPage) AppState.setLastSelectedPage(lastSelectedPage);
	AppState.setSelectedIndex(selectedOverlayIndex);
}
let currentDateFormat = 'MM/DD/YYYY';
const dateFormats = [
	'MM/DD/YYYY',
	'DD/MM/YYYY',
	'YYYY-MM-DD',
	'Month DD, YYYY',
];
let lastPickedDate = null;
let recentImages = []; // Store recent images {name, data}
let textContentIsDate = false; // Track if text content is from date picker

// ================================================================
// MODULE: State Management
// Centralized state access and mutations
// ================================================================
async function loadInitialPDF() {
	try {
		const response = await fetch('/api/file');
		const data = await response.json();

		if (data.filePath) {
			currentPdfPath = data.filePath;
			currentPdfFile = data.fileName;
			AppState.setCurrentFile(data.fileName); // Sync to AppState
			window.currentPdfFile = data.fileName; // Expose to window for merge handler
			window.mergedPagesData = []; // Initialize for merge handler
			document.getElementById('fileName').textContent = data.fileName;

			// Enable merge button
			document.getElementById('mergeBtn').disabled = false;

			// Load PDF preview
			const previewArea = document.getElementById('previewArea');
			previewArea.innerHTML = `
				<div class="canvas-wrapper"><canvas id="pdfCanvas"></canvas></div>

				<!-- Hotkeys Display (Bottom Left) -->
				<div class="preview-hotkeys" id="previewHotkeys" onclick="toggleHotkeys(event)">
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
			PreviewController.setupInteraction();

			// Initialize dark mode preference
			PreviewController.initDarkMode();

			// Auto-fit to width on initial load
			zoomLevel = window.zoomLevel = 'fit';
			await generateThumbnails(data.filePath);
			await PreviewController.renderPage(1);
		}
	} catch (err) {
		console.error('Failed to load initial PDF:', err);
	}
}

function loadPDF() {
	const fileInput = document.getElementById('fileInput');
	fileInput.onchange = async (e) => {
		const file = e.target.files[0];
		if (file && file.name.toLowerCase().endsWith('.pdf')) {
			await loadPDFFile(file);
		} else {
			showModal('Invalid File', 'Please select a PDF file');
		}
		fileInput.value = '';
	};
	fileInput.click();
}

async function loadPDFFile(file) {
	try {
		const objectUrl = URL.createObjectURL(file);
		currentPdfFile = file.name;
		AppState.setCurrentFile(file.name); // Sync to AppState
		window.currentPdfFile = file.name; // Expose to window for merge handler
		document.getElementById('fileName').textContent = file.name;

		// Enable merge button
		document.getElementById('mergeBtn').disabled = false;

		// Clear merged pages data when loading new PDF
		mergedPagesData = [];
		window.mergedPagesData = []; // Expose to window for merge handler

		// Show preview
		const previewArea = document.getElementById('previewArea');
		previewArea.innerHTML = `
			<div class="canvas-wrapper"><canvas id="pdfCanvas"></canvas></div>
			<!-- Hotkeys Display (Bottom Left) -->
			<div class="preview-hotkeys" id="previewHotkeys" onclick="toggleHotkeys(event)">
				<div class="hotkey-icon">
					<i data-lucide="alert-circle" style="width: 16px; height: 16px;"></i>
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
					<i data-lucide="minus" style="width: 11px; height: 11px;"></i>
				</button>
				<div class="zoom-display" id="zoomDisplay">100%</div>
				<button class="zoom-btn" onclick="PreviewController.zoomIn()" title="Zoom In (Scroll Up)">
					<i data-lucide="plus" style="width: 11px; height: 11px;"></i>
				</button>
				<button class="zoom-btn" onclick="PreviewController.zoomFit()" title="Fit to Width">
					<i data-lucide="maximize-2" style="width: 11px; height: 11px;"></i>
				</button>
				<button class="zoom-btn" id="darkModeBtn" onclick="PreviewController.toggleDarkMode()" title="Toggle Dark Background">
					<i data-lucide="moon" style="width: 11px; height: 11px;"></i>
				</button>
			</div>
		`;

		// Create Lucide icons
		lucide.createIcons();

		// Setup zoom and pan interactions
		PreviewController.setupInteraction();

		// Load PDF for thumbnails
		const arrayBuffer = await file.arrayBuffer();
		pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
		window.pdfDocument = pdfDocument; // Expose to window
		// Initialize undo/redo history
		AppState.initHistory();

		// Auto-fit to width
		zoomLevel = window.zoomLevel = 'fit';

		await generateThumbnailsFromDoc();

		// Auto-select first page if PDF has only one page
		if (pdfDocument.numPages === 1) {
			handlePageSelection(1, true);
		}

		await PreviewController.renderPage(1);
	} catch (err) {
		showModal('Error', `Failed to load PDF: ${err.message}`);
	}
}

// ===== PREVIEW AREA INTERACTION SETUP =====
// Removed duplicate - using PreviewController.setupInteraction() instead

// ===== THUMBNAIL GENERATION =====
async function generateThumbnails(filePath) {
	try {
		const response = await fetch(`/pdf/${encodeURIComponent(currentPdfFile)}`);
		const arrayBuffer = await response.arrayBuffer();
		pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
		window.pdfDocument = pdfDocument; // Expose to window
		// Initialize undo/redo history
		AppState.initHistory();
		await generateThumbnailsFromDoc();
	} catch (err) {
		console.error('Failed to generate thumbnails:', err);
	}
}

async function generateThumbnailsFromDoc() {
	const thumbnailsList = document.getElementById('thumbnailsList');
	thumbnailsList.innerHTML = '';

	const pageCount = pdfDocument.numPages;
	pageOrder = Array.from({ length: pageCount }, (_, i) => i + 1);

	for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
		const page = await pdfDocument.getPage(pageNum);
		const viewport = page.getViewport({ scale: 0.3 });

		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');
		canvas.width = viewport.width;
		canvas.height = viewport.height;

		await page.render({ canvasContext: context, viewport }).promise;

		const item = document.createElement('div');
		item.className = 'thumbnail-item';
		item.draggable = true;
		item.dataset.pageNum = pageNum;
		item.innerHTML = `
            <canvas class="thumbnail-canvas"></canvas>
            <div class="thumbnail-number">${pageNum}</div>
        `;
		const thumbCanvas = item.querySelector('canvas');
		thumbCanvas.width = canvas.width;
		thumbCanvas.height = canvas.height;
		thumbCanvas.getContext('2d').drawImage(canvas, 0, 0);

		// Click to toggle selection
		item.addEventListener('click', (e) => {
			const currentPageNum = Number.parseInt(e.currentTarget.dataset.pageNum);
			const isSelected = selectedPages.has(currentPageNum);
			handlePageSelection(currentPageNum, !isSelected);
		});

		// Drag and drop for reordering
		item.addEventListener('dragstart', handleDragStart);
		item.addEventListener('dragover', handleDragOver);
		item.addEventListener('drop', handleDrop);
		item.addEventListener('dragend', handleDragEnd);

		thumbnailsList.appendChild(item);
	}
}

// ===== PDF PREVIEW RENDERING =====
let currentPreviewPage = 1;
let previewScale = 1;
let zoomLevel = 1.0; // 1.0 = 100%, 2.0 = 200%

// Expose to window for PreviewController
window.currentPreviewPage = currentPreviewPage;
window.zoomLevel = zoomLevel;

// Helper functions to convert between canvas pixels and PDF points
async function getPDFPageDimensions(pageNum) {
	if (!pdfDocument) return null;
	try {
		const page = await pdfDocument.getPage(pageNum);
		const viewport = page.getViewport({ scale: 1 }); // Unscaled = PDF points
		return { width: viewport.width, height: viewport.height };
	} catch (err) {
		console.error('Error getting PDF page dimensions:', err);
		return null;
	}
}

function canvasToPDFCoords(
	canvasX,
	canvasY,
	canvasWidth,
	canvasHeight,
	pdfWidth,
	pdfHeight,
) {
	const scaleX = pdfWidth / canvasWidth;
	const scaleY = pdfHeight / canvasHeight;
	return {
		x: canvasX * scaleX,
		y: canvasY * scaleY,
	};
}

// Removed duplicate functions - using PreviewController instead

let draggedElement = null;

function handleDragStart(e) {
	draggedElement = e.target.closest('.thumbnail-item');
	draggedElement.classList.add('dragging');
	e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
	if (e.preventDefault) e.preventDefault();
	e.dataTransfer.dropEffect = 'move';

	// Remove dragover from all items first
	document.querySelectorAll('.thumbnail-item.dragover').forEach((item) => {
		item.classList.remove('dragover');
	});

	const target = e.target.closest('.thumbnail-item');
	if (target && target !== draggedElement) {
		target.classList.add('dragover');
	}
	return false;
}

function handleDrop(e) {
	if (e.stopPropagation) e.stopPropagation();
	e.preventDefault();

	const target = e.target.closest('.thumbnail-item');
	if (target && draggedElement && target !== draggedElement) {
		const draggedIndex = Number.parseInt(draggedElement.dataset.pageNum) - 1;
		const targetIndex = Number.parseInt(target.dataset.pageNum) - 1;

		// Swap in pageOrder array
		[pageOrder[draggedIndex], pageOrder[targetIndex]] = [
			pageOrder[targetIndex],
			pageOrder[draggedIndex],
		];

		// Visual swap
		const parent = target.parentNode;
		if (
			draggedElement.compareDocumentPosition(target) &
			Node.DOCUMENT_POSITION_FOLLOWING
		) {
			parent.insertBefore(draggedElement, target);
		} else {
			parent.insertBefore(draggedElement, target.nextSibling);
		}

		// Update page numbers
		updatePageNumbers();

		// Show reorder button
		const reorderBtn = document.getElementById('reorderBtn');
		if (reorderBtn) reorderBtn.style.display = 'block';
	}

	// Clean up drag classes
	document.querySelectorAll('.thumbnail-item').forEach((item) => {
		item.classList.remove('dragover', 'dragging');
	});

	return false;
}

function handleDragEnd() {
	document.querySelectorAll('.thumbnail-item').forEach((item) => {
		item.classList.remove('dragging', 'dragover');
	});
}

// Handle page selection
function handlePageSelection(pageNum, isSelected) {
	if (isSelected) {
		selectedPages.add(pageNum);
		lastSelectedPage = pageNum;
		// Show the selected page in preview (always show the last selected one)
		PreviewController.renderPage(pageNum);
	} else {
		selectedPages.delete(pageNum);
		// If we're unselecting the last selected page, update to another selected page
		if (lastSelectedPage === pageNum) {
			lastSelectedPage =
				selectedPages.size > 0 ? Array.from(selectedPages)[0] : null;
		}
		// If there are still selected pages, show one of them
		if (selectedPages.size > 0 && lastSelectedPage) {
			PreviewController.renderPage(lastSelectedPage);
		}
	}

	// Update visual selection
	const items = document.querySelectorAll('.thumbnail-item');
	items.forEach((item) => {
		const num = Number.parseInt(item.dataset.pageNum);
		const isItemSelected = selectedPages.has(num);
		item.classList.toggle('selected', isItemSelected);

		// Add or remove checkmark
		let checkmark = item.querySelector('.thumbnail-checkmark');
		if (isItemSelected && !checkmark) {
			checkmark = document.createElement('div');
			checkmark.className = 'thumbnail-checkmark';
			checkmark.innerHTML =
				'<i data-lucide="check" style="width: 18px; height: 18px;"></i>';
			item.appendChild(checkmark);
			lucide.createIcons();
		} else if (!isItemSelected && checkmark) {
			checkmark.remove();
		}
	});

	// Update button states
	const hasSelection = selectedPages.size > 0;
	document.getElementById('deleteSelectedBtn').disabled = !hasSelection;
	document.getElementById('rotateLeftBtn').disabled = !hasSelection;
	document.getElementById('rotateRightBtn').disabled = !hasSelection;

	// Smart disable for arrows based on position
	if (hasSelection) {
		const selectedArray = Array.from(selectedPages);
		const minPage = Math.min(...selectedArray);
		const maxPage = Math.max(...selectedArray);
		const totalPages = document.querySelectorAll('.thumbnail-item').length;

		document.getElementById('moveUpBtn').disabled = minPage === 1;
		document.getElementById('moveDownBtn').disabled = maxPage === totalPages;
	} else {
		document.getElementById('moveUpBtn').disabled = true;
		document.getElementById('moveDownBtn').disabled = true;
	}
}

function moveSelectedPagesUp() {
	if (selectedPages.size === 0) return;

	const items = Array.from(document.querySelectorAll('.thumbnail-item'));
	const selectedArray = Array.from(selectedPages).sort((a, b) => a - b);

	// Can't move up if first page is selected
	if (selectedArray[0] === 1) return;

	// Move each selected page up by swapping with the page above
	for (const pageNum of selectedArray) {
		const currentIndex = pageNum - 1;
		const targetIndex = currentIndex - 1;

		if (targetIndex >= 0 && !selectedPages.has(targetIndex + 1)) {
			// Swap in DOM
			const currentItem = items[currentIndex];
			const targetItem = items[targetIndex];
			targetItem.parentNode.insertBefore(currentItem, targetItem);

			// Update items array
			[items[currentIndex], items[targetIndex]] = [
				items[targetIndex],
				items[currentIndex],
			];
		}
	}

	updatePageNumbers();
	lucide.createIcons();
}

function moveSelectedPagesDown() {
	if (selectedPages.size === 0) return;

	const items = Array.from(document.querySelectorAll('.thumbnail-item'));
	const selectedArray = Array.from(selectedPages).sort((a, b) => b - a); // Reverse order

	// Can't move down if last page is selected
	if (selectedArray[0] === items.length) return;

	// Move each selected page down by swapping with the page below
	for (const pageNum of selectedArray) {
		const currentIndex = pageNum - 1;
		const targetIndex = currentIndex + 1;

		if (targetIndex < items.length && !selectedPages.has(targetIndex + 1)) {
			// Swap in DOM
			const currentItem = items[currentIndex];
			const targetItem = items[targetIndex];
			targetItem.parentNode.insertBefore(targetItem, currentItem);

			// Update items array
			[items[currentIndex], items[targetIndex]] = [
				items[targetIndex],
				items[currentIndex],
			];
		}
	}

	updatePageNumbers();
	lucide.createIcons();
}

async function rotateSelectedPages(rotation) {
	if (!currentPdfFile) {
		showModal('No PDF Loaded', 'Please load a PDF first');
		return;
	}

	if (selectedPages.size === 0) {
		showModal('No Pages Selected', 'Please select pages to rotate');
		return;
	}

	const pagesToRotate = Array.from(selectedPages);
	const pageCount = pagesToRotate.length;

	try {
		showProcessing('Rotating pages...');

		const response = await fetch('/api/rotate-pages', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				pages: pagesToRotate,
				rotation: rotation,
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Rotation failed');
		}

		// Get rotated PDF as blob
		const blob = await response.blob();
		const rotatedFile = new File(
			[blob],
			`${currentPdfFile.replace('.pdf', '')}_rotated.pdf`,
			{ type: 'application/pdf' },
		);

		// Convert blob to base64 and update server's working file
		const reader = new FileReader();
		reader.onload = async (e) => {
			const pdfData = e.target.result;
			try {
				await fetch('/api/update-working-file', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ pdfData }),
				});
			} catch (err) {
				console.warn('Failed to update working file on server:', err);
			}

			// Reload the rotated PDF
			await loadPDFFile(rotatedFile);

			// Re-select the rotated pages
			pagesToRotate.forEach((pageNum) => {
				selectedPages.add(pageNum);
			});

			// Update selection UI
			if (window.PageOperations) {
				window.PageOperations.updateSelectionUI();
			}

			AppState.markAsChanged(); // Track unsaved changes

			hideProcessing();
		};
		reader.readAsDataURL(blob);
	} catch (error) {
		hideProcessing();
		showModal('Error', error.message || 'Failed to rotate pages');
	}
}

function updatePageNumbers() {
	const items = document.querySelectorAll('.thumbnail-item');
	const oldToNew = new Map();

	items.forEach((item, index) => {
		const oldPageNum = Number.parseInt(item.dataset.pageNum);
		// Preserve original page number on first reorder
		if (!item.dataset.originalPage) {
			item.dataset.originalPage = oldPageNum;
		}
		const newPageNum = index + 1;
		item.querySelector('.thumbnail-number').textContent = newPageNum;
		item.dataset.pageNum = newPageNum;
		oldToNew.set(oldPageNum, newPageNum);
	});

	// Update selectedPages set with new page numbers
	const newSelectedPages = new Set();
	selectedPages.forEach((oldNum) => {
		if (oldToNew.has(oldNum)) {
			newSelectedPages.add(oldToNew.get(oldNum));
		}
	});
	selectedPages = newSelectedPages;

	// Update lastSelectedPage with new page number
	if (lastSelectedPage && oldToNew.has(lastSelectedPage)) {
		lastSelectedPage = oldToNew.get(lastSelectedPage);
	}

	// Refresh visual selection with checkmarks
	items.forEach((item) => {
		const num = Number.parseInt(item.dataset.pageNum);
		const isSelected = selectedPages.has(num);
		item.classList.toggle('selected', isSelected);

		// Add or remove checkmark
		let checkmark = item.querySelector('.thumbnail-checkmark');
		if (isSelected && !checkmark) {
			checkmark = document.createElement('div');
			checkmark.className = 'thumbnail-checkmark';
			checkmark.innerHTML =
				'<i data-lucide="check" style="width: 18px; height: 18px;"></i>';
			item.appendChild(checkmark);
			lucide.createIcons();
		} else if (!isSelected && checkmark) {
			checkmark.remove();
		}
	});

	// Update button states after reordering
	if (selectedPages.size > 0) {
		const selectedArray = Array.from(selectedPages);
		const minPage = Math.min(...selectedArray);
		const maxPage = Math.max(...selectedArray);
		const totalPages = items.length;

		document.getElementById('moveUpBtn').disabled = minPage === 1;
		document.getElementById('moveDownBtn').disabled = maxPage === totalPages;
	}

	// Update overlay page indices based on new page order
	pendingOverlays.forEach((overlay) => {
		// Convert 0-indexed pageIndex to 1-indexed page number
		const oldPageNum = overlay.pageIndex + 1;

		// Get new page number from mapping
		if (oldToNew.has(oldPageNum)) {
			const newPageNum = oldToNew.get(oldPageNum);
			// Convert back to 0-indexed
			overlay.pageIndex = newPageNum - 1;
		}
	});

	// Rebuild pageOrder array from current DOM order
	pageOrder = Array.from(items).map((item, index) => index + 1);

	// Re-render the preview page to show overlays in new positions
	if (lastSelectedPage) {
		PreviewController.renderPage(lastSelectedPage);
	} else if (currentPreviewPage) {
		PreviewController.renderPage(currentPreviewPage);
	}
}

async function applyReorder() {
	if (!currentPdfFile) {
		showModal('No PDF Loaded', 'Please load a PDF first');
		return;
	}

	// Get current page order from thumbnails
	const items = document.querySelectorAll('.thumbnail-item');
	const pageOrder = Array.from(items).map((item) =>
		Number.parseInt(item.dataset.pageNum),
	);

	showConfirmModal(
		'Apply Reorder',
		'Apply the new page order? This will download a reordered PDF file.',
		async () => {
			try {
				showProcessing('Reordering pages...');

				const response = await fetch('/api/reorder-pages', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ order: pageOrder }),
				});

				if (!response.ok) throw new Error('Reorder failed');

				const blob = await response.blob();
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `${currentPdfFile.replace('.pdf', '')}_reordered.pdf`;
				document.body.appendChild(a);
				a.click();
				window.URL.revokeObjectURL(url);
				document.body.removeChild(a);

				hideProcessing();
				document.getElementById('reorderBtn').style.display = 'none';
			} catch (err) {
				hideProcessing();
				showModal('Error', `Failed to reorder pages: ${err.message}`);
			}
		},
	);
}

// ===== TOOL FUNCTIONS ===== (moved to tool-manager.js)

function browseImage() {
	document.getElementById('imageFile').click();
}

// toggleOverlayTransparent removed - now using UIControls.toggleLayerTransparency from panel

function loadRecentImages() {
	try {
		const stored = localStorage.getItem('pdfile_recent_images');
		if (stored) {
			recentImages = JSON.parse(stored);
			updateRecentImagesList();
		}
	} catch (e) {
		console.error('Failed to load recent images:', e);
	}
}

function saveRecentImages() {
	try {
		localStorage.setItem('pdfile_recent_images', JSON.stringify(recentImages));
	} catch (e) {
		console.error('Failed to save recent images:', e);
	}
}

function addToRecentImages(name, data) {
	// Remove if already exists
	recentImages = recentImages.filter((img) => img.name !== name);

	// Add to beginning
	recentImages.unshift({ name, data });

	// Keep only last 5
	if (recentImages.length > 5) {
		recentImages = recentImages.slice(0, 5);
	}

	saveRecentImages();
	updateRecentImagesList();
}

function updateRecentImagesList() {
	const listEl = document.getElementById('recentImagesList');
	const groupEl = document.getElementById('recentImagesGroup');

	if (recentImages.length === 0) {
		groupEl.style.display = 'none';
		return;
	}

	groupEl.style.display = 'block';
	listEl.innerHTML = '';

	recentImages.forEach((img, index) => {
		const item = document.createElement('div');
		item.className = 'recent-image-item';
		item.innerHTML = `
            <img src="${img.data}" alt="${img.name}">
            <span class="name">${img.name}</span>
            <button class="insert-btn" onclick="insertRecentImage(${index})">Insert</button>
        `;
		listEl.appendChild(item);
	});
}

function insertRecentImage(index) {
	if (!currentPdfFile) return;

	const img = recentImages[index];
	if (!img) return;

	// Load image to get actual dimensions and aspect ratio
	const imgElement = new Image();
	imgElement.onload = () => {
		const overlayIndex = AppState.getOverlays().length;

		const canvas = document.getElementById('pdfCanvas');
		const canvasWidth = canvas ? canvas.width : 1;
		const canvasHeight = canvas ? canvas.height : 1;

		// Calculate size maintaining aspect ratio
		const aspectRatio = imgElement.width / imgElement.height;
		let width, height;

		if (aspectRatio > 1) {
			// Wider than tall
			width = 150;
			height = width / aspectRatio;
		} else {
			// Taller than wide
			height = 150;
			width = height * aspectRatio;
		}

		// Calculate center position for initial placement
		const centerX = Math.max(0, (canvasWidth - width) / 2);
		const centerY = Math.max(0, (canvasHeight - height) / 2);

		AppState.addOverlay({
			type: 'image',
			imageData: img.data,
			x: centerX,
			y: centerY,
			width: width,
			height: height,
			aspectRatio: aspectRatio,
			opacity: 100,
			removeBackground: false,
			pageIndex: window.currentPreviewPage - 1,
			canvasWidth,
			canvasHeight,
		});

		AppState.markAsChanged(); // Track unsaved changes

		window.GizmoManager.createGizmo('image', 'Image', centerX, centerY, overlayIndex);
		LayerManager.updateLayersList();

		// Auto-select the newly added overlay
		if (window.SelectionManager) {
			window.SelectionManager.selectOverlay(overlayIndex);
		}
	};

	imgElement.src = img.data;
}

function openDatePicker() {
	if (datePicker) {
		datePicker.open();
	}
}

function addTextOverlay() {
	const textInput = document.getElementById('textContent');
	const text = textInput.value;
	if (!text.trim()) return;

	const textColor = selectedTextColor;

	// Add new overlay (default to transparent background)
	const overlayIndex = AppState.getOverlays().length;

	const canvas = document.getElementById('pdfCanvas');
	const canvasWidth = canvas ? canvas.width : 1;
	const canvasHeight = canvas ? canvas.height : 1;

	// Calculate center position for initial placement
	const baseFontSize = 12;
	const estimatedWidth = baseFontSize * text.length * 0.6; // Rough estimate
	const estimatedHeight = baseFontSize * 1.5;
	const centerX = Math.max(0, (canvasWidth - estimatedWidth) / 2);
	const centerY = Math.max(0, (canvasHeight - estimatedHeight) / 2);

	AppState.addOverlay({
		type: 'date', // Using date type since it handles text rendering
		dateText: text,
		dateFormat: textContentIsDate ? currentDateFormat : undefined, // Store format if it's a date
		x: centerX,
		y: centerY,
		fontSize: 12, // Base font size, will be scaled by gizmo
		baseFontSize: 12, // Store base font size for scaling
		textColor: textColor,
		bgColor: null, // Default to transparent
		transparentBg: true, // Default to transparent
		opacity: 100,
		scale: 1,
		pageIndex: window.currentPreviewPage - 1,
		// Font styling
		fontFamily: 'Helvetica',
		bold: false,
		italic: false,
		underline: false,
		// Text highlight
		highlightColor: null,
		highlightBlur: 0,
		canvasWidth,
		canvasHeight,
	});

	AppState.markAsChanged(); // Track unsaved changes

	// Add visual gizmo to preview
	const label = text.length > 20 ? `${text.substring(0, 20)}...` : text;
	window.GizmoManager.createGizmo('text', label, centerX, centerY, overlayIndex);

	LayerManager.updateLayersList();
	UIControls.closeTextEditor();

	// Reset date flags
	textContentIsDate = false;

	// Auto-select the newly added overlay
	if (window.SelectionManager) {
		window.SelectionManager.selectOverlay(overlayIndex);
	}
}

async function convertToWord() {
	if (!currentPdfFile) {
		showModal('No PDF Loaded', 'Please load a PDF file first');
		return;
	}

	try {
		showProcessing('Converting PDF to Word document...');

		const response = await fetch('/api/convert-to-word', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
		});

		if (!response.ok) throw new Error('Conversion failed');

		const blob = await response.blob();
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${currentPdfFile.replace('.pdf', '')}.docx`;
		document.body.appendChild(a);
		a.click();
		window.URL.revokeObjectURL(url);
		document.body.removeChild(a);

		hideProcessing();
	} catch (err) {
		hideProcessing();
		showModal('Error', `Failed to convert: ${err.message}`);
	}
}

async function removeSelectedPages() {
	if (selectedPages.size === 0) {
		showModal('No Pages Selected', 'Click pages to select them for removal');
		return;
	}

	if (!currentPdfFile) {
		showModal('No PDF Loaded', 'Please load a PDF first');
		return;
	}

	const pageCount = selectedPages.size;

	showConfirmModal(
		'Remove Pages',
		`Are you sure you want to remove ${pageCount} page(s)?`,
		async () => {
			try {
				showProcessing(`Removing ${pageCount} page(s)...`);

				const response = await fetch('/api/remove-pages', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ pages: Array.from(selectedPages) }),
				});

				if (!response.ok) throw new Error('Remove failed');

				const blob = await response.blob();

				// Create a file object from the blob
				const modifiedFile = new File(
					[blob],
					`${currentPdfFile.replace('.pdf', '')}_removed.pdf`,
					{ type: 'application/pdf' },
				);

				// Convert blob to base64 and update server's working file
				const reader = new FileReader();
				reader.onload = async (e) => {
					const pdfData = e.target.result;
					try {
						await fetch('/api/update-working-file', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ pdfData }),
						});
					} catch (err) {
						console.warn('Failed to update working file on server:', err);
					}

					// Load the modified PDF
					await loadPDFFile(modifiedFile);

					// Clear selection
					selectedPages.clear();
					document.getElementById('removePageBtn').style.display = 'none';

					hideProcessing();
				};
				reader.readAsDataURL(blob);
			} catch (err) {
				hideProcessing();
				showModal('Error', `Failed to remove pages: ${err.message}`);
			}
		},
		null,
		true,
	);
}

// ===== SHARE MODAL (using ShareModal module) =====
function shareApp() {
	ShareModal.show();
}
function closeShareModal() {
	ShareModal.close();
}
function handleSocialShare(platform) {
	ShareModal.handleSocialShare(platform);
}
function handleCopyLink() {
	ShareModal.handleCopyLink();
}
function handleEmailShare() {
	ShareModal.handleEmailShare();
}

// ===== GIZMO & MERGE FUNCTIONS ===== (moved to gizmo-manager.js and merge-handler.js)
// Functions are available via window.GizmoManager.createGizmo, window.GizmoManager.removeOverlay, window.mergeFiles, etc.

// ===== LAYERS MANAGEMENT =====
// Old functions removed - now using LayerManager and SelectionManager modules

// ===== EXPORT PDF (using PDFExport module) =====
// exportPDF is already globally exported from pdf-export.js
// Sync state before export
function syncBeforeExport() {
	syncStateFromLocal();
}

// ===== IMAGE DROP HANDLER =====
async function handleImageDrop(file) {
	if (!currentPdfFile) {
		showModal('No PDF Loaded', 'Please load a PDF file first');
		return;
	}

	try {
		const reader = new FileReader();
		reader.onload = async (event) => {
			const imageData = event.target.result;

			// Create an image element to get dimensions
			const img = new Image();
			img.onload = () => {
				// Get canvas dimensions for centering
				const canvas = document.getElementById('pdfCanvas');
				const canvasWidth = canvas?.width || 800;
				const canvasHeight = canvas?.height || 1000;

				// Determine if image is large enough to be used as a page
				const isLargeImage = img.width >= 300 || img.height >= 300;

				let width, height, x, y;

				if (isLargeImage) {
					// Calculate dimensions to fit the page while maintaining aspect ratio
					const pageAspect = canvasWidth / canvasHeight;
					const imgAspect = img.width / img.height;

					if (imgAspect > pageAspect) {
						// Image is wider - fit to width
						width = canvasWidth * 0.9;
						height = width / imgAspect;
					} else {
						// Image is taller - fit to height
						height = canvasHeight * 0.9;
						width = height * imgAspect;
					}

					// Center on page
					x = (canvasWidth - width) / 2;
					y = (canvasHeight - height) / 2;
				} else {
					// Small image - use original size and center
					width = img.width;
					height = img.height;
					x = (canvasWidth - width) / 2;
					y = (canvasHeight - height) / 2;
				}

				// Add to recent images
				addToRecentImages(file.name, imageData);

				// Add to pending overlays with proper aspect ratio
				const overlayIndex = pendingOverlays.length;

				// Store original aspect ratio for this image
				const aspectRatio = width / height;

				// canvasWidth and canvasHeight already available from above

				pendingOverlays.push({
					type: 'image',
					imageData: imageData,
					x: Math.max(0, x),
					y: Math.max(0, y),
					width: width,
					height: height,
					aspectRatio: aspectRatio, // Store for resize operations
					opacity: 100,
					removeBackground: false,
					pageIndex: window.currentPreviewPage - 1,
					canvasWidth,
					canvasHeight,
				});

				AppState.markAsChanged(); // Track unsaved changes

				// Add visual gizmo to preview
				const label = isLargeImage ? 'Image (Full Page)' : 'Image';
				window.GizmoManager.createGizmo(
					'image',
					label,
					Math.max(0, x),
					Math.max(0, y),
					overlayIndex,
				);
				window.LayerManager.updateLayersList();
			};

			img.onerror = () => {
				showModal('Error', 'Failed to load image');
			};

			img.src = imageData;
		};

		reader.onerror = () => {
			showModal('Error', 'Failed to read image file');
		};

		reader.readAsDataURL(file);
	} catch (err) {
		showModal('Error', `Failed to process image: ${err.message}`);
	}
}

// ===== INITIALIZATION =====
// Initialize window size and position
(function initWindow() {
	const html = document.documentElement;
	const w = Number.parseInt(html.getAttribute('data-width')) || 700;
	const h = Number.parseInt(html.getAttribute('data-height')) || 590;

	// Center window on available screen
	const x = Math.round((screen.availWidth - w) / 2) + (screen.availLeft || 0);
	const y = Math.round((screen.availHeight - h) / 2) + (screen.availTop || 0);

	if (typeof window.moveTo === 'function') {
		window.moveTo(x, y);
	}
	if (typeof window.resizeTo === 'function') {
		window.resizeTo(w, h);
	}

	// Reset zoom
	html.style.zoom = '100%';
})();

document.addEventListener('contextmenu', (e) => e.preventDefault());
// Initialize components
let datePicker, textColorPicker, bgColorPicker, highlightColorPicker;
let selectedTextColor = '#000000';
let selectedBgColor = '#ffffff';
let selectedHighlightColor = null;

// Expose to window for UI controls
window.selectedTextColor = selectedTextColor;
window.selectedBgColor = selectedBgColor;
window.selectedHighlightColor = selectedHighlightColor;

// Processing overlay utilities
function showProcessing(message = 'Processing...') {
	const overlay = document.getElementById('processingOverlay');
	const text = document.getElementById('processingText');
	if (overlay && text) {
		text.textContent = message;
		overlay.style.display = 'flex';
	}
}

function hideProcessing() {
	const overlay = document.getElementById('processingOverlay');
	if (overlay) {
		overlay.style.display = 'none';
	}
}

// Export processing utilities
window.showProcessing = showProcessing;
window.hideProcessing = hideProcessing;

// Export edited PDF with changes
async function exportEditedPDF() {
	if (!currentPdfFile) {
		showModal('No PDF Loaded', 'Please load a PDF first');
		return;
	}

	try {
		showProcessing('Exporting edited PDF...');

		// Create the export request
		const response = await fetch('/api/export-pdf', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				overlays: pendingOverlays,
				mergedPages: AppState.getSerializableMergedPages(),
			}),
		});

		if (!response.ok) throw new Error('Export failed');

		const blob = await response.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;

		// Add " - Edited.pdf" suffix
		const baseName = currentPdfFile.replace(/\.pdf$/i, '');
		a.download = `${baseName} - Edited.pdf`;

		document.body.appendChild(a);
		a.click();
		URL.revokeObjectURL(url);
		document.body.removeChild(a);

		// Mark as saved
		AppState.markAsSaved();

		hideProcessing();
	} catch (err) {
		hideProcessing();
		showModal('Error', `Failed to export: ${err.message}`);
	}
}

window.exportEditedPDF = exportEditedPDF;

document.addEventListener('DOMContentLoaded', () => {
	// Initialize modules
	ShareModal.init();
	KeyboardHandler.init();

	loadInitialPDF();
	lucide.createIcons();

	// Initialize zoom display
	if (window.PreviewController) {
		window.PreviewController.updateZoomDisplay();
	}

	// Load recent images from localStorage
	loadRecentImages();

	// Set up file input change listener
	document.getElementById('imageFile').addEventListener('change', (e) => {
		const file = e.target.files[0];
		if (!file || !currentPdfFile) return;

		// Read file as base64
		const reader = new FileReader();
		reader.onload = (event) => {
			const imageData = event.target.result;

			// Add to recent images
			addToRecentImages(file.name, imageData);

			// Add to pending overlays
			const overlayIndex = AppState.getOverlays().length;

			const canvas = document.getElementById('pdfCanvas');
			const canvasWidth = canvas ? canvas.width : 1;
			const canvasHeight = canvas ? canvas.height : 1;

			// Calculate center position for initial placement
			const imgWidth = 150;
			const imgHeight = 150;
			const centerX = Math.max(0, (canvasWidth - imgWidth) / 2);
			const centerY = Math.max(0, (canvasHeight - imgHeight) / 2);

			const overlayData = {
				type: 'image',
				imageData: imageData,
				x: centerX,
				y: centerY,
				width: imgWidth,
				height: imgHeight,
				opacity: 100,
				removeBackground: false,
				pageIndex: window.currentPreviewPage - 1,
				canvasWidth,
				canvasHeight,
			};

			AppState.addOverlay(overlayData);
			AppState.markAsChanged(); // Track unsaved changes

			// Add visual gizmo to preview
			window.GizmoManager.createGizmo('image', 'Image', centerX, centerY, overlayIndex);
			LayerManager.updateLayersList();

			// Clear file input
			e.target.value = '';
		};
		reader.readAsDataURL(file);
	});

	// Initialize Flatpickr date picker (hidden input)
	const hiddenDateInput = document.createElement('input');
	hiddenDateInput.type = 'text';
	hiddenDateInput.style.display = 'none';
	document.body.appendChild(hiddenDateInput);

	datePicker = flatpickr(hiddenDateInput, {
		defaultDate: 'today',
		dateFormat: 'Y-m-d',
		allowInput: false,
		theme: 'dark',
		positionElement: document.getElementById('textContent'), // Position relative to text input
		position: 'below', // Show below the input
		onReady: (selectedDates, dateStr, instance) => {
			const todayBtn = document.createElement('button');
			todayBtn.textContent = 'Today';
			todayBtn.className = 'flatpickr-today-button';
			todayBtn.style.cssText =
				'margin: 8px; padding: 6px 12px; background: #7fa5df; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;';
			todayBtn.onclick = (e) => {
				e.preventDefault();
				instance.setDate(new Date(), true);
				instance.close(); // Close the picker after applying today's date
			};
			instance.calendarContainer.appendChild(todayBtn);
		},
		onChange: (selectedDates, dateStr, instance) => {
			if (selectedDates.length > 0) {
				lastPickedDate = selectedDates[0];
				const textInput = document.getElementById('textContent');
				textInput.value = formatDateByFormat(lastPickedDate, currentDateFormat);

				// Mark as date content and show format toggle button
				textContentIsDate = true;
				document.getElementById('dateFormatBtn').style.display = 'block';

				// Enable Add Text button
				updateAddTextButtonState();
			}
		},
	});

	// Add listener to text content input
	const textContentInput = document.getElementById('textContent');
	textContentInput.addEventListener('input', () => {
		textContentIsDate = false; // User is typing, not from date picker
		onTextContentChange();
	});

	// Initialize color pickers
	textColorPicker = new ColorPicker({
		container: '#textColorPicker',
		default: '#000000',
		label: 'Text Color',
		swatches: [
			'#000000',
			'#ffffff',
			'#ff0000',
			'#00ff00',
			'#0000ff',
			'#ffff00',
			'#ff00ff',
			'#00ffff',
		],
		onChange: (color, alpha) => {
			selectedTextColor = color;
			window.selectedTextColor = color;
			UIControls.updateLayerColor(color, false, alpha);
		},
	});

	// Initialize selected color
	selectedTextColor = textColorPicker.getColor();
	window.selectedTextColor = selectedTextColor;
	window.textColorPicker = textColorPicker;

	// Highlight Color Picker
	highlightColorPicker = new ColorPicker({
		container: '#highlightColorPicker',
		default: '#ffff00',
		label: 'Text Highlight',
		swatches: [
			'#ffff00',
			'#00ff00',
			'#00ffff',
			'#ff00ff',
			'#ffa500',
			'#ff69b4',
			'#add8e6',
			'#90ee90',
		],
		onChange: (color, alpha) => {
			selectedHighlightColor = color;
			window.selectedHighlightColor = color;
			// Update current layer's highlight color
			const index = AppState.getSelectedIndex();
			if (index !== null) {
				AppState.updateOverlay(index, {
					highlightColor: color,
					highlightAlpha: alpha,
				});
				// Update gizmo visual to show highlight
				if (window.GizmoManager) {
					window.GizmoManager.updateGizmoFromOverlay(index);
				}
			}
		},
	});

	// Initialize selected highlight color
	selectedHighlightColor = null; // Default: no highlight
	window.selectedHighlightColor = selectedHighlightColor;
	window.highlightColorPicker = highlightColorPicker;

	// Show drop options dialog
	function showDropOptionsDialog(file, isPdf, isImage) {
		const modal = document.getElementById('modalOverlay');
		const header = document.getElementById('modalHeader');
		const body = document.getElementById('modalBody');
		const footer = document.getElementById('modalFooter');

		const fileTypeLabel = isPdf ? 'PDF' : 'Image';

		header.textContent = `What would you like to do with "${file.name}"?`;

		if (isPdf) {
			body.innerHTML = `
				<p style="margin-bottom: 12px;">Choose how to handle this PDF file:</p>
			`;
		} else {
			body.innerHTML = `
				<p style="margin-bottom: 12px;">Choose how to handle this image:</p>
			`;
		}

		footer.innerHTML = `
			<button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button>
			<button class="modal-btn modal-btn-secondary" onclick="closeModal(); handleDropOption('replace')">Replace Current File</button>
			<button class="modal-btn modal-btn-secondary" onclick="closeModal(); handleDropOption('beginning')">Merge to Beginning</button>
			<button class="modal-btn modal-btn-primary" onclick="closeModal(); handleDropOption('end')">Merge to End</button>
		`;

		// Store file for later use
		window.pendingDropFile = file;
		window.pendingDropIsPdf = isPdf;
		window.pendingDropIsImage = isImage;

		modal.classList.add('active');
	}

	// Handle drop option selection
	async function handleDropOption(option) {
		const file = window.pendingDropFile;
		const isPdf = window.pendingDropIsPdf;
		const isImage = window.pendingDropIsImage;

		if (!file) return;

		if (option === 'replace') {
			// Load as new file (replace current)
			await loadPDFFile(file);
		} else if (option === 'beginning' || option === 'end') {
			// Merge to beginning or end
			window.pendingMergeFile = file;
			if (isImage || isPdf) {
				await MergeHandler.mergeFiles(option, file.name);
			}
		}

		// Clear pending file
		window.pendingDropFile = null;
		window.pendingDropIsPdf = false;
		window.pendingDropIsImage = false;
	}

	// Expose to window for onclick handlers
	window.handleDropOption = handleDropOption;

	// Set up drag & drop for PDF, image, and document files
	const thumbnailsPanel = document.getElementById('thumbnailsPanel');
	const previewArea = document.getElementById('previewArea');

	// Thumbnails panel - always merge as page
	thumbnailsPanel.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = 'copy';

		// Only highlight if dragging files (not thumbnail reordering)
		if (e.dataTransfer.types.includes('Files')) {
			thumbnailsPanel.classList.add('drop-zone-active');
		}
	});

	thumbnailsPanel.addEventListener('dragleave', (e) => {
		// Check if we're actually leaving the thumbnailsPanel element
		// relatedTarget is where the mouse is going
		if (!thumbnailsPanel.contains(e.relatedTarget)) {
			thumbnailsPanel.classList.remove('drop-zone-active');
		}
	});

	thumbnailsPanel.addEventListener('drop', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		thumbnailsPanel.classList.remove('drop-zone-active');

		const files = e.dataTransfer.files;
		if (files.length > 0) {
			const file = files[0];
			const fileType = file.type.toLowerCase();
			const fileName = file.name.toLowerCase();

			const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');
			const isImage =
				fileType.startsWith('image/') ||
				fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);

			if (isPdf || isImage) {
				// Merge as page
				window.pendingMergeFile = file;
				showMergeDialog(file);
			} else {
				showModal('Invalid File', 'Please drop a PDF or image file');
			}
		}
	});

	// Preview area - show options dialog
	previewArea.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = 'copy';

		// Only highlight if dragging files
		if (e.dataTransfer.types.includes('Files')) {
			previewArea.classList.add('drop-zone-active');
		}
	});

	previewArea.addEventListener('dragleave', (e) => {
		e.preventDefault();
		e.stopPropagation();

		// Only remove highlight if leaving the preview area entirely
		const rect = previewArea.getBoundingClientRect();
		if (
			e.clientX < rect.left ||
			e.clientX >= rect.right ||
			e.clientY < rect.top ||
			e.clientY >= rect.bottom
		) {
			previewArea.classList.remove('drop-zone-active');
		}
	});

	previewArea.addEventListener('drop', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		previewArea.classList.remove('drop-zone-active');

		const files = e.dataTransfer.files;
		if (files.length > 0) {
			const file = files[0];
			const fileType = file.type.toLowerCase();
			const fileName = file.name.toLowerCase();

			const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');
			const isImage =
				fileType.startsWith('image/') ||
				fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);

			if (isPdf || isImage) {
				// Show options dialog
				showDropOptionsDialog(file, isPdf, isImage);
			} else {
				showModal('Invalid File', 'Please drop a PDF or image file');
			}
		}
	});

	// Warn before closing with unsaved changes
	window.addEventListener('beforeunload', (e) => {
		if (AppState.hasUnsavedChanges()) {
			e.preventDefault();
			e.returnValue = ''; // Modern browsers ignore custom message
			return '';
		}
	});
});

// ===== HOTKEYS TOGGLE =====
function toggleHotkeys(e) {
	if (e) e.stopPropagation();
	const hotkeysElement = document.getElementById('previewHotkeys');
	if (hotkeysElement) {
		hotkeysElement.classList.toggle('expanded');
	}
}

// Close hotkeys when clicking outside
document.addEventListener('click', (e) => {
	const hotkeysElement = document.getElementById('previewHotkeys');
	if (hotkeysElement && !hotkeysElement.contains(e.target)) {
		hotkeysElement.classList.remove('expanded');
	}
});
