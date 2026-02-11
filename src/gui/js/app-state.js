// Application State Management
const AppState = (() => {
	// Private state
	let currentPdfFile = null;
	let pdfDocument = null;
	let pendingOverlays = [];
	let selectedOverlayIndex = null;
	let selectedPages = new Set();
	let lastSelectedPage = null;
	let mergedPagesData = []; // Stores PDF.js docs - NOT serializable!
	let currentPreviewPage = 1;
	let hasUnsavedChanges = false;

	// Undo/Redo history
	let history = [];
	let historyIndex = -1;
	const MAX_HISTORY = 50;

	// Helper: Deep clone overlays (without circular refs)
	function cloneOverlays(overlays) {
		return JSON.parse(JSON.stringify(overlays));
	}

	// Save current state to history
	function saveToHistory() {
		// Remove any redo history after current index
		history = history.slice(0, historyIndex + 1);

		// Add current state
		history.push(cloneOverlays(pendingOverlays));

		// Limit history size
		if (history.length > MAX_HISTORY) {
			history.shift();
		} else {
			historyIndex++;
		}
	}

	// Undo last action
	function undo() {
		if (historyIndex <= 0) {
			console.log('Nothing to undo');
			return false;
		}

		historyIndex--;
		pendingOverlays = cloneOverlays(history[historyIndex]);
		return true;
	}

	// Redo last undone action
	function redo() {
		if (historyIndex >= history.length - 1) {
			console.log('Nothing to redo');
			return false;
		}

		historyIndex++;
		pendingOverlays = cloneOverlays(history[historyIndex]);
		return true;
	}

	// Check if undo is available
	function canUndo() {
		return historyIndex > 0;
	}

	// Check if redo is available
	function canRedo() {
		return historyIndex < history.length - 1;
	}

	return {
		// File State
		getCurrentFile: () => currentPdfFile,
		setCurrentFile: (file) => {
			currentPdfFile = file;
		},

		// PDF Document
		getPdfDocument: () => pdfDocument,
		setPdfDocument: (doc) => {
			pdfDocument = doc;
		},

		// Overlay State
		getOverlays: () => pendingOverlays,
		getOverlay: (index) => pendingOverlays[index],
		addOverlay: (overlay) => {
			pendingOverlays.push(overlay);
			saveToHistory();
		},
		removeOverlay: (index) => {
			pendingOverlays.splice(index, 1);
			saveToHistory();
		},
		updateOverlay: (index, updates) => {
			if (pendingOverlays[index] && updates) {
				Object.assign(pendingOverlays[index], updates);
				// Don't auto-save history - caller should do it explicitly
			}
		},
		clearOverlays: () => {
			pendingOverlays = [];
			saveToHistory();
		},
		saveToHistory: () => saveToHistory(),

		// Selection State
		getSelectedIndex: () => selectedOverlayIndex,
		setSelectedIndex: (index) => {
			selectedOverlayIndex = index;
		},

		// Page State
		getSelectedPages: () => selectedPages,
		setSelectedPages: (pages) => {
			selectedPages = pages;
		},
		getLastSelectedPage: () => lastSelectedPage,
		setLastSelectedPage: (page) => {
			lastSelectedPage = page;
		},

		// Merged Pages (contains PDF.js documents - circular refs)
		getMergedPagesData: () => mergedPagesData,
		setMergedPagesData: (data) => {
			mergedPagesData = data;
		},
		clearMergedPagesData: () => {
			mergedPagesData = [];
		},

		// Serialize merged pages WITHOUT circular references (for export)
		getSerializableMergedPages: () => {
			return mergedPagesData.map((page, index) => ({
				pageNum: page.pageNum,
				source: page.source,
				displayOrder: index + 1,
			}));
		},

		// Current preview page
		getCurrentPreviewPage: () => currentPreviewPage,
		setCurrentPreviewPage: (page) => {
			currentPreviewPage = page;
		},

		// Unsaved changes tracking
		hasUnsavedChanges: () => hasUnsavedChanges,
		markAsChanged: () => {
			hasUnsavedChanges = true;
		},
		markAsSaved: () => {
			hasUnsavedChanges = false;
		},

		// Undo/Redo functions
		undo: () => {
			if (undo()) {
				// Deselect current overlay as it might not exist anymore
				selectedOverlayIndex = null;
				return true;
			}
			return false;
		},
		redo: () => {
			if (redo()) {
				// Deselect current overlay as it might not exist anymore
				selectedOverlayIndex = null;
				return true;
			}
			return false;
		},
		canUndo: () => canUndo(),
		canRedo: () => canRedo(),
		initHistory: () => {
			// Initialize history with current state (empty or loaded overlays)
			history = [cloneOverlays(pendingOverlays)];
			historyIndex = 0;
		},
	};
})();

// Expose to window
window.AppState = AppState;
