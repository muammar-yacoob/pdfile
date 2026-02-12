// Tool Manager - Handles tool panel UI, tab switching, and date formatting

const ToolManager = {
	/**
	 * Toggle a tool panel open/closed
	 * @param {string} toolId - ID of the tool to toggle
	 */
	toggleTool(toolId) {
		const tools = document.querySelectorAll('.tool');
		const clickedTool = document.getElementById(toolId);

		tools.forEach((tool) => {
			if (tool.id === toolId) {
				tool.classList.toggle('active');
			} else {
				tool.classList.remove('active');
			}
		});
	},

	/**
	 * Switch between overlay tabs (text/image)
	 * @param {string} tabName - Name of tab to activate
	 */
	switchOverlayTab(tabName) {
		document.querySelectorAll('.tabs .tab').forEach((tab, i) => {
			tab.classList.toggle('active', ['text', 'image'][i] === tabName);
		});
		document.querySelectorAll('.tab-content').forEach((content, i) => {
			content.classList.toggle('active', ['text', 'image'][i] === tabName);
		});
	},

	/**
	 * Cycle through date formats for new date overlay
	 */
	cycleDateFormat() {
		const dateFormats = [
			'MM/DD/YYYY',
			'DD/MM/YYYY',
			'YYYY-MM-DD',
			'Month DD, YYYY',
		];

		const currentDateFormat =
			window.currentDateFormat || dateFormats[0];
		const currentIndex = dateFormats.indexOf(currentDateFormat);
		const nextIndex = (currentIndex + 1) % dateFormats.length;
		window.currentDateFormat = dateFormats[nextIndex];
		document.getElementById('dateFormatBtn').textContent =
			window.currentDateFormat;

		// If a date was already picked, update the text field with new format
		if (window.lastPickedDate) {
			const textInput = document.getElementById('textContent');
			textInput.value = this.formatDateByFormat(
				window.lastPickedDate,
				window.currentDateFormat,
			);
			window.textContentIsDate = true; // Mark as date content
		}
	},

	/**
	 * Cycle through date formats for selected layer
	 */
	cycleSelectedLayerDateFormat() {
		const index = window.AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = window.AppState.getOverlay(index);
		if (!overlay || overlay.type !== 'date') return;

		const dateFormats = [
			'MM/DD/YYYY',
			'DD/MM/YYYY',
			'YYYY-MM-DD',
			'Month DD, YYYY',
		];

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
				date = this.parseDateFromText(dateText, currentFormat);
			}
		} catch (e) {
			console.warn('Could not parse date:', e);
		}

		// If we have a valid date, reformat it; otherwise keep the original text
		let newDateText = overlay.dateText;
		if (date && !Number.isNaN(date.getTime())) {
			newDateText = this.formatDateByFormat(date, newFormat);
		}

		// Update the overlay
		window.AppState.updateOverlay(index, {
			dateFormat: newFormat,
			dateText: newDateText,
		});

		// Update the UI
		document.getElementById('editDateFormatBtn').textContent = newFormat;
		document.getElementById('editTextContent').value = newDateText;

		// Update the gizmo
		window.UIControls.updateLayerText(newDateText);
	},

	/**
	 * Parse date from text string based on format
	 * @param {string} text - Date text to parse
	 * @param {string} format - Date format
	 * @returns {Date|null} Parsed date or null
	 */
	parseDateFromText(text, format) {
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
			case 'Month DD, YYYY': {
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
			}
			default:
				return null;
		}

		return new Date(year, month, day);
	},

	/**
	 * Format date according to specified format
	 * @param {Date} date - Date to format
	 * @param {string} format - Format string
	 * @returns {string} Formatted date
	 */
	formatDateByFormat(date, format) {
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
	},

	/**
	 * Update state of add text button based on input
	 */
	updateAddTextButtonState() {
		const textInput = document.getElementById('textContent');
		const addTextBtn = document.getElementById('addTextBtn');
		const hasContent = textInput.value.trim().length > 0;
		addTextBtn.disabled = !hasContent;
	},

	/**
	 * Handle text content changes
	 */
	onTextContentChange() {
		this.updateAddTextButtonState();

		// If manually edited, hide date format button (user typed custom text)
		if (!window.textContentIsDate) {
			document.getElementById('dateFormatBtn').style.display = 'none';
		}
	},
};

// Export to window
window.ToolManager = ToolManager;

// Backward compatibility
window.toggleTool = (toolId) => ToolManager.toggleTool(toolId);
window.switchOverlayTab = (tabName) => ToolManager.switchOverlayTab(tabName);
window.cycleDateFormat = () => ToolManager.cycleDateFormat();
window.cycleSelectedLayerDateFormat = () =>
	ToolManager.cycleSelectedLayerDateFormat();
window.parseDateFromText = (text, format) =>
	ToolManager.parseDateFromText(text, format);
window.formatDateByFormat = (date, format) =>
	ToolManager.formatDateByFormat(date, format);
window.updateAddTextButtonState = () => ToolManager.updateAddTextButtonState();
window.onTextContentChange = () => ToolManager.onTextContentChange();
