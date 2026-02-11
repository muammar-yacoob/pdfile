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
		addOverlay: (overlay) => pendingOverlays.push(overlay),
		removeOverlay: (index) => pendingOverlays.splice(index, 1),
		updateOverlay: (index, updates) => {
			if (pendingOverlays[index] && updates) {
				Object.assign(pendingOverlays[index], updates);
			}
		},
		clearOverlays: () => {
			pendingOverlays = [];
		},

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
	};
})();

// Expose to window
window.AppState = AppState;
