// Date Utils - Date formatting utilities

const DateUtils = {
	formats: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'Month DD, YYYY'],
	currentFormatIndex: 0,

	cycleFormat() {
		this.currentFormatIndex =
			(this.currentFormatIndex + 1) % this.formats.length;
		const format = this.formats[this.currentFormatIndex];
		const btn = document.getElementById('dateFormatBtn');
		if (btn) {
			btn.textContent = format;
			btn.style.display = 'block';
		}
		window.currentDateFormat = format;
		return format;
	},

	cycleSelectedLayerFormat() {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date') return;

		const formats = this.formats;
		const currentFormat = overlay.dateFormat || window.currentDateFormat || 'MM/DD/YYYY';
		const currentIndex = formats.indexOf(currentFormat);
		const nextIndex = (currentIndex + 1) % formats.length;
		const newFormat = formats[nextIndex];

		// Update the overlay's date format
		AppState.updateOverlay(index, { dateFormat: newFormat });

		// Re-format the date text using the new format
		const date = this.parseFromText(overlay.dateText, currentFormat);
		if (date) {
			const newDateText = this.format(date, newFormat);
			AppState.updateOverlay(index, {
				dateText: newDateText,
				dateFormat: newFormat,
			});

			// Update UI
			document.getElementById('editTextContent').value = newDateText;
		}

		// Update button text
		const btn = document.getElementById('editDateFormatBtn');
		if (btn) btn.textContent = newFormat;

		// Re-render gizmo
		window.PreviewController?.renderPage(window.currentPreviewPage);
	},

	parseFromText(text, format) {
		if (!text || !format) return null;

		let day, month, year;

		if (format === 'MM/DD/YYYY') {
			const parts = text.split('/');
			if (parts.length !== 3) return null;
			month = Number.parseInt(parts[0]) - 1;
			day = Number.parseInt(parts[1]);
			year = Number.parseInt(parts[2]);
		} else if (format === 'DD/MM/YYYY') {
			const parts = text.split('/');
			if (parts.length !== 3) return null;
			day = Number.parseInt(parts[0]);
			month = Number.parseInt(parts[1]) - 1;
			year = Number.parseInt(parts[2]);
		} else if (format === 'YYYY-MM-DD') {
			const parts = text.split('-');
			if (parts.length !== 3) return null;
			year = Number.parseInt(parts[0]);
			month = Number.parseInt(parts[1]) - 1;
			day = Number.parseInt(parts[2]);
		} else if (format === 'Month DD, YYYY') {
			const regex = /(\w+)\s+(\d+),\s+(\d+)/;
			const match = text.match(regex);
			if (!match) return null;

			const monthNames = [
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
			month = monthNames.indexOf(match[1]);
			if (month === -1) return null;

			day = Number.parseInt(match[2]);
			year = Number.parseInt(match[3]);
		}

		if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
		return new Date(year, month, day);
	},

	format(date, format) {
		const day = date.getDate();
		const month = date.getMonth() + 1;
		const year = date.getFullYear();

		const monthNames = [
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

		if (format === 'MM/DD/YYYY') {
			return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
		}
		if (format === 'DD/MM/YYYY') {
			return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
		}
		if (format === 'YYYY-MM-DD') {
			return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		}
		if (format === 'Month DD, YYYY') {
			return `${monthNames[month - 1]} ${day}, ${year}`;
		}

		return date.toLocaleDateString();
	},
};

// Expose to window
window.DateUtils = DateUtils;

// Expose functions for backwards compatibility
window.cycleDateFormat = () => DateUtils.cycleFormat();
window.cycleSelectedLayerDateFormat = () => DateUtils.cycleSelectedLayerFormat();
window.formatDateByFormat = (date, format) => DateUtils.format(date, format);
window.parseDateFromText = (text, format) => DateUtils.parseFromText(text, format);
