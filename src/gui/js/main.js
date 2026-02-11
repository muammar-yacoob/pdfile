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
let pendingOverlays = []; // Will sync with AppState
let selectedOverlayIndex = null; // Will sync with AppState

// Sync local vars with AppState on changes
function syncStateToLocal() {
	currentPdfFile = AppState.getCurrentFile();
	pdfDocument = AppState.getPdfDocument();
	mergedPagesData = AppState.getMergedPagesData();
	selectedPages = AppState.getSelectedPages();
	lastSelectedPage = AppState.getLastSelectedPage();
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
			document.getElementById('fileName').textContent = data.fileName;

			// Enable merge button
			document.getElementById('mergeBtn').disabled = false;

			// Load PDF preview
			const previewArea = document.getElementById('previewArea');
			previewArea.innerHTML = `<div class="canvas-wrapper"><canvas id="pdfCanvas"></canvas></div>`;

			// Setup zoom and pan interactions
			setupPreviewInteraction();

			// Auto-fit to width on initial load
			zoomLevel = 'fit';
			await generateThumbnails(data.filePath);
			await renderPreviewPage(1);
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
		document.getElementById('fileName').textContent = file.name;

		// Enable merge button
		document.getElementById('mergeBtn').disabled = false;

		// Clear merged pages data when loading new PDF
		mergedPagesData = [];

		// Show preview
		const previewArea = document.getElementById('previewArea');
		previewArea.innerHTML = `<div class="canvas-wrapper"><canvas id="pdfCanvas"></canvas></div>`;

		// Setup zoom and pan interactions
		setupPreviewInteraction();

		// Load PDF for thumbnails
		const arrayBuffer = await file.arrayBuffer();
		pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
		window.pdfDocument = pdfDocument; // Expose to window

		// Auto-fit to width
		zoomLevel = 'fit';

		await generateThumbnailsFromDoc();
		await renderPreviewPage(1);

		showModal('Success', `Loaded: ${file.name}`);
	} catch (err) {
		showModal('Error', `Failed to load PDF: ${err.message}`);
	}
}

// ===== PREVIEW AREA INTERACTION SETUP =====
function setupPreviewInteraction() {
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
			const oldZoom = zoomLevel === 'fit' ? 1.0 : zoomLevel;

			// Calculate new zoom level
			const newZoom = Math.max(0.5, Math.min(3.0, oldZoom + delta));

			// Update zoom immediately (no debounce)
			setZoomLevel(newZoom);

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
		if (e.target === area || e.target.classList.contains('canvas-wrapper') || e.target.id === 'pdfCanvas') {
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
}

// ===== THUMBNAIL GENERATION =====
async function generateThumbnails(filePath) {
	try {
		const response = await fetch(`/pdf/${encodeURIComponent(currentPdfFile)}`);
		const arrayBuffer = await response.arrayBuffer();
		pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
		window.pdfDocument = pdfDocument; // Expose to window
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

async function renderPreviewPage(pageNum) {
	if (!pdfDocument) return;

	try {
		currentPreviewPage = pageNum;
		const canvas = document.getElementById('pdfCanvas');
		if (!canvas) return;

		// CRITICAL FIX: Get the ORIGINAL page number from thumbnail data
		// This handles page reordering correctly
		const thumbnails = document.querySelectorAll('.thumbnail-item');
		const thumbnail = Array.from(thumbnails).find(
			(t) => Number.parseInt(t.dataset.pageNum) === pageNum,
		);
		const originalPageNum = thumbnail
			? Number.parseInt(
					thumbnail.dataset.originalPage || thumbnail.dataset.pageNum,
				)
			: pageNum;

		const page = await pdfDocument.getPage(originalPageNum);

		// Calculate base scale to fill width
		const previewArea = document.getElementById('previewArea');
		const containerWidth = previewArea.clientWidth - 20;
		const pageViewport = page.getViewport({ scale: 1 });

		const baseScale = containerWidth / pageViewport.width; // Fill width

		// Apply zoom level - if 'fit', use baseScale; otherwise apply zoom multiplier
		const scale = zoomLevel === 'fit' ? baseScale : baseScale * zoomLevel;
		previewScale = scale;

		const viewport = page.getViewport({ scale });

		canvas.width = viewport.width;
		canvas.height = viewport.height;

		const context = canvas.getContext('2d');
		await page.render({ canvasContext: context, viewport }).promise;

		// Update gizmos visibility for current page (overlays are only rendered server-side on export)
		updateGizmosForPage(pageNum);
	} catch (err) {
		console.error('Error rendering preview page:', err);
	}
}

function setZoomLevel(newZoom) {
	// Convert 'fit' to 1.0 if transitioning from fit mode
	if (zoomLevel === 'fit') {
		zoomLevel = 1.0;
	}

	// If newZoom is a delta adjustment, add it to current zoom
	if (typeof newZoom === 'number') {
		zoomLevel = Math.max(0.5, Math.min(3.0, newZoom)); // Clamp between 50% and 300%
	} else if (newZoom === 'fit') {
		zoomLevel = 'fit';
	}

	renderPreviewPage(currentPreviewPage);
}

function updateGizmosForPage(pageNum) {
	// Remove all existing gizmos
	document.querySelectorAll('.overlay-gizmo').forEach((g) => g.remove());

	// Recreate gizmos only for the current page (use AppState!)
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
			addOverlayGizmo(overlay.type, label, overlay.x, overlay.y, i);
		}
	});
}

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
		renderPreviewPage(pageNum);
	} else {
		selectedPages.delete(pageNum);
		// If we're unselecting the last selected page, update to another selected page
		if (lastSelectedPage === pageNum) {
			lastSelectedPage =
				selectedPages.size > 0 ? Array.from(selectedPages)[0] : null;
		}
		// If there are still selected pages, show one of them
		if (selectedPages.size > 0 && lastSelectedPage) {
			renderPreviewPage(lastSelectedPage);
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
		showModal('Processing', 'Rotating pages...');

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

			// Clear selection
			selectedPages.clear();

			closeModal();
		};
		reader.readAsDataURL(blob);
	} catch (error) {
		closeModal();
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
		renderPreviewPage(lastSelectedPage);
	} else if (currentPreviewPage) {
		renderPreviewPage(currentPreviewPage);
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
				showModal('Processing', 'Reordering pages...');

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

				closeModal();
				showModal('Success', 'Pages reordered successfully!');
				document.getElementById('reorderBtn').style.display = 'none';
			} catch (err) {
				closeModal();
				showModal('Error', `Failed to reorder pages: ${err.message}`);
			}
		},
	);
}

// ===== TOOL FUNCTIONS =====
function toggleTool(toolId) {
	const tools = document.querySelectorAll('.tool');
	const clickedTool = document.getElementById(toolId);

	tools.forEach((tool) => {
		if (tool.id === toolId) {
			tool.classList.toggle('active');
		} else {
			tool.classList.remove('active');
		}
	});
}

function switchOverlayTab(tabName) {
	document.querySelectorAll('.tabs .tab').forEach((tab, i) => {
		tab.classList.toggle('active', ['text', 'image'][i] === tabName);
	});
	document.querySelectorAll('.tab-content').forEach((content, i) => {
		content.classList.toggle('active', ['text', 'image'][i] === tabName);
	});
}

function cycleDateFormat() {
	const currentIndex = dateFormats.indexOf(currentDateFormat);
	const nextIndex = (currentIndex + 1) % dateFormats.length;
	currentDateFormat = dateFormats[nextIndex];
	document.getElementById('dateFormatBtn').textContent = currentDateFormat;

	// If a date was already picked, update the text field with new format
	if (lastPickedDate) {
		const textInput = document.getElementById('textContent');
		textInput.value = formatDateByFormat(lastPickedDate, currentDateFormat);
		textContentIsDate = true; // Mark as date content
	}
}

function cycleSelectedLayerDateFormat() {
	const index = AppState.getSelectedIndex();
	if (index === null) return;

	const overlay = AppState.getOverlay(index);
	if (!overlay || overlay.type !== 'date') return;

	// Get current format or default
	const currentFormat = overlay.dateFormat || 'MM/DD/YYYY';
	const currentIndex = dateFormats.indexOf(currentFormat);
	const nextIndex = (currentIndex + 1) % dateFormats.length;
	const newFormat = dateFormats[nextIndex];

	// Parse the current date text to extract the date
	let date;
	try {
		// Try to parse the existing date text
		const dateText = overlay.dateText || '';
		if (dateText) {
			// Simple parsing - try multiple formats
			date = parseDateFromText(dateText, currentFormat);
		}
	} catch (e) {
		console.warn('Could not parse date:', e);
	}

	// If we have a valid date, reformat it; otherwise keep the original text
	let newDateText = overlay.dateText;
	if (date && !isNaN(date.getTime())) {
		newDateText = formatDateByFormat(date, newFormat);
	}

	// Update the overlay
	AppState.updateOverlay(index, {
		dateFormat: newFormat,
		dateText: newDateText,
	});

	// Update the UI
	document.getElementById('editDateFormatBtn').textContent = newFormat;
	document.getElementById('editTextContent').value = newDateText;

	// Update the gizmo
	UIControls.updateLayerText(newDateText);
}

function parseDateFromText(text, format) {
	// Remove common separators and extract numbers
	const parts = text.match(/\d+/g);
	if (!parts || parts.length < 3) return null;

	let year, month, day;

	switch (format) {
		case 'MM/DD/YYYY':
			month = Number.parseInt(parts[0]) - 1;
			day = Number.parseInt(parts[1]);
			year = Number.parseInt(parts[2]);
			break;
		case 'DD/MM/YYYY':
			day = Number.parseInt(parts[0]);
			month = Number.parseInt(parts[1]) - 1;
			year = Number.parseInt(parts[2]);
			break;
		case 'YYYY-MM-DD':
			year = Number.parseInt(parts[0]);
			month = Number.parseInt(parts[1]) - 1;
			day = Number.parseInt(parts[2]);
			break;
		case 'Month DD, YYYY':
			// For month name format, try to parse differently
			const monthNames = [
				'january',
				'february',
				'march',
				'april',
				'may',
				'june',
				'july',
				'august',
				'september',
				'october',
				'november',
				'december',
			];
			const textLower = text.toLowerCase();
			month = monthNames.findIndex((m) => textLower.includes(m));
			if (month === -1) return null;
			day = Number.parseInt(parts[0]);
			year = Number.parseInt(parts[1]);
			break;
		default:
			return null;
	}

	return new Date(year, month, day);
}

function updateAddTextButtonState() {
	const textInput = document.getElementById('textContent');
	const addTextBtn = document.getElementById('addTextBtn');
	const hasContent = textInput.value.trim().length > 0;
	addTextBtn.disabled = !hasContent;
}

function onTextContentChange() {
	updateAddTextButtonState();

	// If manually edited, hide date format button (user typed custom text)
	if (!textContentIsDate) {
		document.getElementById('dateFormatBtn').style.display = 'none';
	}
}

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

	const overlayIndex = AppState.getOverlays().length;

	AppState.addOverlay({
		type: 'image',
		imageData: img.data,
		x: 100,
		y: 100,
		width: 150,
		height: 150,
		opacity: 100,
		removeBackground: false,
		pageIndex: currentPreviewPage - 1,
	});

	addOverlayGizmo('image', 'Image', 100, 100, overlayIndex);
	LayerManager.updateLayersList();
}

function openDatePicker() {
	if (datePicker) {
		datePicker.open();
	}
}

function openFontStyleDialog() {
	const index = AppState.getSelectedIndex();
	if (index === null) return;

	const overlay = AppState.getOverlay(index);
	if (!overlay || overlay.type !== 'date') return;

	// Open font style dialog with current values
	window.FontStyleDialog.open({
		fontFamily: overlay.fontFamily || 'Helvetica',
		fontSize: overlay.baseFontSize || 12,
		bold: overlay.bold || false,
		italic: overlay.italic || false,
		underline: overlay.underline || false,
		onChange: (style) => {
			// Update overlay with new font style
			AppState.updateOverlay(index, {
				fontFamily: style.fontFamily,
				baseFontSize: style.fontSize,
				fontSize: style.fontSize, // Update both
				bold: style.bold,
				italic: style.italic,
				underline: style.underline,
			});

			// Re-render gizmo with new style
			const gizmo = document.querySelector(`.overlay-gizmo[data-overlay-index="${index}"]`);
			if (gizmo) {
				const textElement = gizmo.querySelector('.overlay-gizmo-text');
				if (textElement) {
					// Apply font family
					const fontFamily = style.fontFamily === 'Helvetica' || style.fontFamily === 'Arial' ||
									   style.fontFamily === 'Times New Roman' || style.fontFamily === 'Courier New' ||
									   style.fontFamily === 'Georgia' || style.fontFamily === 'Verdana'
						? style.fontFamily
						: `'${style.fontFamily}', sans-serif`;
					textElement.style.fontFamily = fontFamily;

					// Apply styles
					textElement.style.fontWeight = style.bold ? 'bold' : 'normal';
					textElement.style.fontStyle = style.italic ? 'italic' : 'normal';
					textElement.style.textDecoration = style.underline ? 'underline' : 'none';
				}
			}

			// Re-render preview
			window.PreviewController?.renderPage(window.currentPreviewPage);
		},
	});
}

function openMergePDF() {
	if (!currentPdfFile) return;

	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.pdf,image/*';
	input.onchange = (e) => {
		const file = e.target.files[0];
		if (file) {
			showMergeDialog(file);
		}
	};
	input.click();
}

function showMergeDialog(file) {
	const modal = document.getElementById('modalOverlay');
	const header = document.getElementById('modalHeader');
	const body = document.getElementById('modalBody');
	const footer = document.getElementById('modalFooter');

	// Determine file type
	const fileType = file.type.toLowerCase();
	const fileName = file.name.toLowerCase();
	const isImage =
		fileType.startsWith('image/') ||
		fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);
	const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');

	let fileTypeLabel = 'file';
	if (isImage) fileTypeLabel = 'image';
	else if (isPdf) fileTypeLabel = 'PDF';

	header.textContent = `Merge ${fileTypeLabel.charAt(0).toUpperCase() + fileTypeLabel.slice(1)}`;
	body.innerHTML = `
        <p>How would you like to merge "${file.name}"?</p>
        ${isImage ? '<p style="font-size: 10px; color: var(--txt3); margin-top: 8px;">Image will be added as a full page.</p>' : ''}
    `;
	footer.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="modal-btn modal-btn-secondary" onclick="closeModal(); mergeFiles('beginning', '${file.name}')">Add to Beginning</button>
        <button class="modal-btn modal-btn-primary" onclick="closeModal(); mergeFiles('end', '${file.name}')">Add to End</button>
    `;

	// Store file for merge
	window.pendingMergeFile = file;
	modal.classList.add('active');
}

function formatDateByFormat(date, format) {
	const months = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	];

	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	const yyyy = date.getFullYear();

	switch (format) {
		case 'MM/DD/YYYY':
			return `${mm}/${dd}/${yyyy}`;
		case 'DD/MM/YYYY':
			return `${dd}/${mm}/${yyyy}`;
		case 'YYYY-MM-DD':
			return `${yyyy}-${mm}-${dd}`;
		case 'Month DD, YYYY':
			return `${months[date.getMonth()]} ${dd}, ${yyyy}`;
		default:
			return `${mm}/${dd}/${yyyy}`;
	}
}

function addTextOverlay() {
	const textInput = document.getElementById('textContent');
	const text = textInput.value;
	if (!text.trim()) return;

	const textColor = selectedTextColor;

	// Add new overlay (default to transparent background)
	const overlayIndex = AppState.getOverlays().length;
	AppState.addOverlay({
		type: 'date', // Using date type since it handles text rendering
		dateText: text,
		dateFormat: textContentIsDate ? currentDateFormat : undefined, // Store format if it's a date
		x: 100,
		y: 100,
		fontSize: 12, // Base font size, will be scaled by gizmo
		baseFontSize: 12, // Store base font size for scaling
		textColor: textColor,
		bgColor: null, // Default to transparent
		transparentBg: true, // Default to transparent
		opacity: 100,
		scale: 1,
		pageIndex: currentPreviewPage - 1,
		// Font styling
		fontFamily: 'Helvetica',
		bold: false,
		italic: false,
		underline: false,
		// Text border
		borderColor: null,
		borderWidth: 0,
	});

	// Add visual gizmo to preview
	const label = text.length > 20 ? `${text.substring(0, 20)}...` : text;
	addOverlayGizmo('text', label, 100, 100, overlayIndex);

	LayerManager.updateLayersList();
	UIControls.closeTextEditor();

	// Reset date flags
	textContentIsDate = false;
}

async function convertToWord() {
	if (!currentPdfFile) {
		showModal('No PDF Loaded', 'Please load a PDF file first');
		return;
	}

	try {
		showModal('Processing', 'Converting PDF to Word document...');

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

		closeModal();
		showModal('Success', `Converted "${currentPdfFile}" to Word successfully!`);
	} catch (err) {
		closeModal();
		showModal('Error', `Failed to convert: ${err.message}`);
	}
}

async function mergeFiles(position, fileName) {
	if (!currentPdfFile) {
		showModal('Error', 'Please load a PDF file first');
		return;
	}

	// Use the pending merge file
	const file = window.pendingMergeFile;
	if (!file) return;

	try {
		const fileNameLower = file.name.toLowerCase();
		const fileType = file.type.toLowerCase();
		const isPdf =
			fileNameLower.endsWith('.pdf') || fileType === 'application/pdf';
		const isImage =
			fileType.startsWith('image/') ||
			fileNameLower.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);

		if (!isPdf && !isImage) {
			showModal('Invalid File', 'Please select a PDF or image file');
			return;
		}

		// If it's an image, convert to PDF via backend first
		if (isImage) {
			showModal('Processing', 'Converting image to PDF...');

			const reader = new FileReader();
			reader.onload = async (e) => {
				const imageData = e.target.result;

				try {
					const response = await fetch('/api/merge-pdfs', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							pdfData: imageData,
							position: position,
							isImage: true,
						}),
					});

					if (!response.ok) {
						throw new Error('Failed to merge image');
					}

					// Download the merged PDF
					const blob = await response.blob();

					// Create a file object from the blob
					const mergedFile = new File(
						[blob],
						`${currentPdfFile.replace('.pdf', '')}_merged.pdf`,
						{ type: 'application/pdf' },
					);

					// Convert blob to base64 and update server's working file
					const reader2 = new FileReader();
					reader2.onload = async (e2) => {
						const pdfData = e2.target.result;
						try {
							await fetch('/api/update-working-file', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ pdfData }),
							});
						} catch (err) {
							console.warn('Failed to update working file on server:', err);
						}

						// Load the merged PDF
						await loadPDFFile(mergedFile);

						// Clear merged pages data since PDF is now merged
						mergedPagesData = [];

						closeModal();
						showModal('Success', 'Image merged successfully!', 2000);
					};
					reader2.readAsDataURL(blob);
				} catch (error) {
					console.error('Merge error:', error);
					showModal('Error', `Failed to merge image: ${error.message}`);
				}
			};
			reader.readAsDataURL(file);
			return;
		}

		showModal('Processing', 'Merging PDF pages...');

		// Load the new PDF using PDF.js
		const arrayBuffer = await file.arrayBuffer();
		const newPdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
		const newPageCount = newPdfDoc.numPages;

		// Load current PDF if not already loaded
		if (!pdfDocument) {
			const response = await fetch(
				`/pdf/${encodeURIComponent(currentPdfFile)}`,
			);
			const currentArrayBuffer = await response.arrayBuffer();
			pdfDocument = await pdfjsLib.getDocument({ data: currentArrayBuffer })
				.promise;
			window.pdfDocument = pdfDocument; // Expose to window
		}

		// Get current state: either existing merged pages or create from thumbnails
		let currentPages = [];
		if (mergedPagesData.length > 0) {
			// Already have merged pages - use them in current order
			const thumbnails = document.querySelectorAll('.thumbnail-item');
			currentPages = Array.from(thumbnails).map((item, idx) => {
				const pageNum = Number.parseInt(item.dataset.pageNum);
				const source = item.dataset.source || 'current';
				const originalPage =
					Number.parseInt(item.dataset.originalPage) || pageNum;

				// Find the page info from mergedPagesData
				const pageInfo = mergedPagesData.find((p, i) => i + 1 === pageNum) || {
					doc: pdfDocument,
					pageNum: originalPage,
					source,
				};
				return pageInfo;
			});
		} else {
			// No merged pages yet - use original document
			for (let i = 1; i <= pdfDocument.numPages; i++) {
				currentPages.push({ doc: pdfDocument, pageNum: i, source: 'original' });
			}
		}

		// Create merged pages array
		const mergedPages = [];

		if (position === 'beginning') {
			// Add new pages first, then current pages
			for (let i = 1; i <= newPageCount; i++) {
				mergedPages.push({ doc: newPdfDoc, pageNum: i, source: 'new' });
			}
			mergedPages.push(...currentPages);
		} else {
			// 'end' or default
			// Add current pages first, then new pages
			mergedPages.push(...currentPages);
			for (let i = 1; i <= newPageCount; i++) {
				mergedPages.push({ doc: newPdfDoc, pageNum: i, source: 'new' });
			}
		}

		// Generate thumbnails for all pages
		const thumbnailsList = document.getElementById('thumbnailsList');
		thumbnailsList.innerHTML = '';

		for (let i = 0; i < mergedPages.length; i++) {
			const pageInfo = mergedPages[i];
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');

			// Render PDF page
			const page = await pageInfo.doc.getPage(pageInfo.pageNum);
			const viewport = page.getViewport({ scale: 0.3 });
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			await page.render({ canvasContext: context, viewport }).promise;

			const item = document.createElement('div');
			item.className = 'thumbnail-item';
			item.draggable = true;
			item.dataset.pageNum = i + 1;
			item.dataset.source = pageInfo.source;
			item.dataset.originalPage = pageInfo.pageNum;
			item.innerHTML = `
                <canvas class="thumbnail-canvas"></canvas>
                <div class="thumbnail-number">${i + 1}</div>
            `;

			if (pageInfo.source === 'new') {
				item.style.borderColor = '#4CAF50'; // Green border for new pages
			}

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

			// Drag events for reordering
			item.addEventListener('dragstart', handleDragStart);
			item.addEventListener('dragover', handleDragOver);
			item.addEventListener('drop', handleDrop);
			item.addEventListener('dragend', handleDragEnd);

			thumbnailsList.appendChild(item);
		}

		// Store merged pages data for export
		mergedPagesData = mergedPages;

		// Update page order
		pageOrder = Array.from({ length: mergedPages.length }, (_, i) => i + 1);

		// Store merged state
		window.mergedPdfData = { mergedPages, arrayBuffer };

		closeModal();
		showModal('Success', `Merged ${newPageCount} pages successfully!`);
	} catch (err) {
		closeModal();
		showModal('Error', `Failed to merge: ${err.message}`);
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
				showModal('Processing', `Removing ${pageCount} page(s)...`);

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

					closeModal();
					showModal(
						'Success',
						`Removed ${pageCount} page(s) successfully!`,
						2000,
					);
				};
				reader.readAsDataURL(blob);
			} catch (err) {
				closeModal();
				showModal('Error', `Failed to remove pages: ${err.message}`);
			}
		},
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

// ===== OVERLAY GIZMO =====
function addOverlayGizmo(type, label, x, y, overlayIndex) {
	const canvasWrapper = document.querySelector('.canvas-wrapper');
	if (!canvasWrapper) return; // Canvas not loaded yet

	const overlay = AppState.getOverlay(overlayIndex);

	// Create gizmo element
	const gizmo = document.createElement('div');
	gizmo.className = 'overlay-gizmo';

	// Add selected class if this is the currently selected overlay
	if (AppState.getSelectedIndex() === overlayIndex) {
		gizmo.classList.add('selected');
	}

	gizmo.style.left = x + 'px';
	gizmo.style.top = y + 'px';
	gizmo.style.opacity = (overlay.opacity || 100) / 100;
	gizmo.dataset.overlayIndex = overlayIndex;

	// Set gizmo size based on overlay dimensions
	if (overlay && (type === 'image' || type === 'signature')) {
		gizmo.style.width = (overlay.width || 120) + 'px';
		gizmo.style.height = (overlay.height || 60) + 'px';
	}

	// Build inner HTML based on type
	let content = '';
	if (type === 'image' || type === 'signature') {
		// Show image preview
		content =
			overlay && overlay.imageData
				? `<img src="${overlay.imageData}" alt="${label}">`
				: `<div class="overlay-gizmo-text">${label}</div>`;
	} else {
		// Show text label for date/text overlays with colors
		const textColor = overlay.textColor || '#000000';
		const bgColor = overlay.transparentBg
			? 'transparent'
			: overlay.bgColor || '#ffffff';

		// Calculate font size to fit the gizmo
		// Available area after padding: width - 4px, height - 12px
		const availableWidth = (overlay.width || 120) - 20; // Remove padding + some margin
		const availableHeight = (overlay.height || 60) - 20;

		// Estimate font size based on text length and available space
		const textLength = label.length;
		const estimatedFontSize = Math.min(
			Math.floor(availableHeight * 0.6), // 60% of height
			Math.floor(availableWidth / (textLength * 0.5)), // Based on character width
			overlay.fontSize || 48, // Cap at stored font size or 48px
		);
		const fontSize = Math.max(8, Math.min(estimatedFontSize, 48));

		content = `<div class="overlay-gizmo-text" style="color: ${textColor}; background-color: ${bgColor}; font-size: ${fontSize}px;">${label}</div>`;
	}

	// Add background removal indicator badge if applicable
	const bgRemovalBadge =
		overlay && overlay.removeBackground
			? `<div class="bg-removal-badge" title="Background removal enabled">BG-</div>`
			: '';

	// Create resize handles (6 total: 2 corners + 4 sides)
	// Upper corners reserved for rotate (left) and delete (right)
	// Bottom corners lock aspect ratio, sides allow free resize
	const resizeHandles = `
        <div class="overlay-gizmo-handle n" data-action="resize" data-handle="n" title="Resize height"></div>
        <div class="overlay-gizmo-handle e" data-action="resize" data-handle="e" title="Resize width"></div>
        <div class="overlay-gizmo-handle se" data-action="resize" data-handle="se" title="Resize (locked ratio)"></div>
        <div class="overlay-gizmo-handle s" data-action="resize" data-handle="s" title="Resize height"></div>
        <div class="overlay-gizmo-handle sw" data-action="resize" data-handle="sw" title="Resize (locked ratio)"></div>
        <div class="overlay-gizmo-handle w" data-action="resize" data-handle="w" title="Resize width"></div>
    `;

	gizmo.innerHTML = `
        <div class="overlay-gizmo-label">${label}</div>
        <div class="overlay-gizmo-rotate" data-action="rotate" title="Rotate">⟳</div>
        <button class="overlay-gizmo-delete" onclick="removeOverlay(${overlayIndex})" title="Delete">✕</button>
        ${resizeHandles}
        ${bgRemovalBadge}
        ${content}
    `;

	// Handle drag, resize, and rotate
	let action = null;
	let resizeHandle = null;
	let startX, startY, initialLeft, initialTop, initialWidth, initialHeight;
	let centerX, centerY, initialAngle;
	let initialAspectRatio = 1;

	gizmo.addEventListener('mousedown', (e) => {
		if (e.target.classList.contains('overlay-gizmo-delete')) return;

		const targetAction = e.target.dataset.action;

		// If no special action, select this overlay (unless starting drag/resize/rotate)
		if (!targetAction) {
			SelectionManager.selectOverlay(overlayIndex);
		}

		if (targetAction === 'resize') {
			action = 'resize';
			resizeHandle = e.target.dataset.handle; // Store which handle (nw, n, ne, e, se, s, sw, w)
			startX = e.clientX;
			startY = e.clientY;
			initialWidth = gizmo.offsetWidth;
			initialHeight = gizmo.offsetHeight;
			initialLeft = Number.parseInt(gizmo.style.left) || 0;
			initialTop = Number.parseInt(gizmo.style.top) || 0;
			initialAspectRatio = initialWidth / initialHeight;
		} else if (targetAction === 'rotate') {
			action = 'rotate';
			const rect = gizmo.getBoundingClientRect();
			centerX = rect.left + rect.width / 2;
			centerY = rect.top + rect.height / 2;
			initialAngle =
				Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
			const currentRotation = AppState.getOverlay(overlayIndex)?.rotation || 0;
			initialAngle = initialAngle - currentRotation;
		} else {
			action = 'move';
			startX = e.clientX;
			startY = e.clientY;
			initialLeft = Number.parseInt(gizmo.style.left) || 0;
			initialTop = Number.parseInt(gizmo.style.top) || 0;
			gizmo.style.cursor = 'grabbing';
		}
		e.preventDefault();
		e.stopPropagation();
	});

	document.addEventListener('mousemove', (e) => {
		if (!action) return;

		const index = Number.parseInt(gizmo.dataset.overlayIndex);

		if (action === 'move') {
			const deltaX = e.clientX - startX;
			const deltaY = e.clientY - startY;

			// Allow movement outside page bounds
			const newLeft = initialLeft + deltaX;
			const newTop = initialTop + deltaY;

			gizmo.style.left = newLeft + 'px';
			gizmo.style.top = newTop + 'px';

			AppState.updateOverlay(index, { x: newLeft, y: newTop });
		} else if (action === 'resize') {
			const deltaX = e.clientX - startX;
			const deltaY = e.clientY - startY;

			let newWidth = initialWidth;
			let newHeight = initialHeight;
			let newLeft = initialLeft;
			let newTop = initialTop;

			// Determine if this is a corner (aspect-ratio locked) or side handle (free resize)
			const isCorner = ['sw', 'se'].includes(resizeHandle);

			if (isCorner) {
				// Corner handles: maintain aspect ratio
				let scale;
				if (resizeHandle === 'se') {
					// Bottom-right: expand from top-left anchor
					scale = Math.max(
						(initialWidth + deltaX) / initialWidth,
						(initialHeight + deltaY) / initialHeight,
					);
				} else if (resizeHandle === 'sw') {
					// Bottom-left: expand from top-right anchor
					scale = Math.max(
						(initialWidth - deltaX) / initialWidth,
						(initialHeight + deltaY) / initialHeight,
					);
					newLeft = initialLeft + (initialWidth - initialWidth * scale);
				}

				newWidth = Math.max(30, initialWidth * scale);
				newHeight = Math.max(20, initialHeight * scale);
			} else {
				// Side handles: free resize (only one dimension changes)
				if (resizeHandle === 'e') {
					newWidth = Math.max(30, initialWidth + deltaX);
				} else if (resizeHandle === 'w') {
					newWidth = Math.max(30, initialWidth - deltaX);
					newLeft = initialLeft + (initialWidth - newWidth);
				} else if (resizeHandle === 's') {
					newHeight = Math.max(20, initialHeight + deltaY);
				} else if (resizeHandle === 'n') {
					newHeight = Math.max(20, initialHeight - deltaY);
					newTop = initialTop + (initialHeight - newHeight);
				}
			}

			// Apply new dimensions and position
			gizmo.style.width = newWidth + 'px';
			gizmo.style.height = newHeight + 'px';
			gizmo.style.left = newLeft + 'px';
			gizmo.style.top = newTop + 'px';

			const currentOverlay = AppState.getOverlay(index);
			if (currentOverlay) {
				const updates = {
					width: newWidth,
					height: newHeight,
					x: newLeft,
					y: newTop,
				};

				// Scale font size for text overlays
				if (currentOverlay.type === 'date' || currentOverlay.type === 'text') {
					const scale = newWidth / initialWidth;
					const baseFontSize = currentOverlay.baseFontSize || 12;
					const newFontSize = Math.max(8, Math.round(baseFontSize * scale));
					updates.fontSize = newFontSize;

					// Update visual text size in gizmo
					const textElement = gizmo.querySelector('.overlay-gizmo-text');
					if (textElement) {
						textElement.style.fontSize = newFontSize + 'px';
					}

					// Store the initial base font size
					if (!currentOverlay.baseFontSize) {
						updates.baseFontSize = 12;
					}
				}

				AppState.updateOverlay(index, updates);
			}
		} else if (action === 'rotate') {
			const currentAngle =
				Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
			const rotation = currentAngle - initialAngle;

			gizmo.style.transform = `rotate(${rotation}deg)`;

			AppState.updateOverlay(index, { rotation });
		}
	});

	document.addEventListener('mouseup', () => {
		if (action) {
			action = null;
			gizmo.style.cursor = 'move';
		}
	});

	canvasWrapper.appendChild(gizmo);

	// Initialize Lucide icons in the gizmo
	lucide.createIcons();
}

function removeOverlay(index) {
	const overlay = AppState.getOverlay(index);
	if (!overlay) return;

	const label = overlay.dateText || overlay.type || 'overlay';

	showConfirmModal(
		'Remove Overlay',
		`Remove this ${overlay.type === 'signature' ? 'signature' : overlay.type}?`,
		() => {
			AppState.removeOverlay(index);

			// Deselect if this was selected
			const selectedIndex = AppState.getSelectedIndex();
			if (selectedIndex === index) {
				SelectionManager.deselectOverlay();
			} else if (selectedIndex > index) {
				AppState.setSelectedIndex(selectedIndex - 1);
			}

			// Remove all gizmos and recreate them with updated indices for current page
			updateGizmosForPage(currentPreviewPage);
			LayerManager.updateLayersList();
		},
	);
}

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
					pageIndex: currentPreviewPage - 1,
				});

				// Add visual gizmo to preview
				const label = isLargeImage ? 'Image (Full Page)' : 'Image';
				addOverlayGizmo(
					'image',
					label,
					Math.max(0, x),
					Math.max(0, y),
					overlayIndex,
				);
				updateLayersList();

				console.log(
					`Image dropped: ${file.name} (${img.width}x${img.height}) - ${isLargeImage ? 'large' : 'small'} - centered at (${x}, ${y})`,
				);
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
let datePicker, textColorPicker, bgColorPicker, borderColorPicker;
let selectedTextColor = '#000000';
let selectedBgColor = '#ffffff';
let selectedBorderColor = null;

// Expose to window for UI controls
window.selectedTextColor = selectedTextColor;
window.selectedBgColor = selectedBgColor;
window.selectedBorderColor = selectedBorderColor;

document.addEventListener('DOMContentLoaded', () => {
	// Initialize modules
	ShareModal.init();

	loadInitialPDF();
	lucide.createIcons();

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

			const overlayData = {
				type: 'image',
				imageData: imageData,
				x: 100,
				y: 100,
				width: 150,
				height: 150,
				opacity: 100,
				removeBackground: false,
				pageIndex: currentPreviewPage - 1,
			};

			AppState.addOverlay(overlayData);

			// Add visual gizmo to preview
			addOverlayGizmo('image', 'Image', 100, 100, overlayIndex);
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
		onChange: (color) => {
			selectedTextColor = color;
			window.selectedTextColor = color;
			UIControls.updateLayerColor(color, false);
		},
	});

	// Initialize selected color
	selectedTextColor = textColorPicker.getColor();
	window.selectedTextColor = selectedTextColor;
	window.textColorPicker = textColorPicker;

	bgColorPicker = new ColorPicker({
		container: '#bgColorPicker',
		default: '#ffffff',
		label: 'Background Color',
		swatches: [
			'#ffffff',
			'#000000',
			'#ffff00',
			'#00ffff',
			'#ff00ff',
			'#c0c0c0',
			'#808080',
		],
		onChange: (color) => {
			selectedBgColor = color;
			window.selectedBgColor = color;
			UIControls.updateLayerColor(color, true);
		},
	});

	// Initialize selected color
	selectedBgColor = bgColorPicker.getColor();
	window.selectedBgColor = selectedBgColor;
	window.bgColorPicker = bgColorPicker;

	// Border Color Picker
	borderColorPicker = new ColorPicker({
		container: '#borderColorPicker',
		default: '#000000',
		label: 'Text Border',
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
		onChange: (color) => {
			selectedBorderColor = color;
			window.selectedBorderColor = color;
			// Update current layer's border color
			const index = AppState.getSelectedIndex();
			if (index !== null) {
				AppState.updateOverlay(index, {
					borderColor: color,
					borderWidth: 2, // Default border width
				});
				window.PreviewController?.renderPage(window.currentPreviewPage);
			}
		},
	});

	// Initialize selected border color
	selectedBorderColor = null; // Default: no border
	window.selectedBorderColor = selectedBorderColor;
	window.borderColorPicker = borderColorPicker;

	// Set up drag & drop for PDF, image, and document files
	const thumbnailsPanel = document.getElementById('thumbnailsPanel');
	const previewArea = document.getElementById('previewArea');

	// Thumbnails panel - always merge as page
	thumbnailsPanel.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.stopPropagation();
		thumbnailsPanel.style.opacity = '0.7';
		thumbnailsPanel.style.backgroundColor = 'rgba(127, 165, 223, 0.1)';
	});

	thumbnailsPanel.addEventListener('dragleave', (e) => {
		e.preventDefault();
		e.stopPropagation();
		thumbnailsPanel.style.opacity = '';
		thumbnailsPanel.style.backgroundColor = '';
	});

	thumbnailsPanel.addEventListener('drop', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		thumbnailsPanel.style.opacity = '';
		thumbnailsPanel.style.backgroundColor = '';

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

	// Preview area - images as overlay, PDFs as merge
	previewArea.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.stopPropagation();
		previewArea.style.opacity = '0.7';
		previewArea.style.backgroundColor = 'rgba(127, 165, 223, 0.1)';
	});

	previewArea.addEventListener('dragleave', (e) => {
		e.preventDefault();
		e.stopPropagation();
		previewArea.style.opacity = '';
		previewArea.style.backgroundColor = '';
	});

	previewArea.addEventListener('drop', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		previewArea.style.opacity = '';
		previewArea.style.backgroundColor = '';

		const files = e.dataTransfer.files;
		if (files.length > 0) {
			const file = files[0];
			const fileType = file.type.toLowerCase();
			const fileName = file.name.toLowerCase();

			const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');
			const isImage =
				fileType.startsWith('image/') ||
				fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);

			if (isPdf) {
				// Merge as page
				window.pendingMergeFile = file;
				showMergeDialog(file);
			} else if (isImage) {
				// Add as overlay
				await handleImageDrop(file);
			} else {
				showModal('Invalid File', 'Please drop a PDF or image file');
			}
		}
	});
});
