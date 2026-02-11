// FontStyleDialog - Font selection and styling component with Google Fonts

class FontStyleDialog {
	constructor() {
		this.isOpen = false;
		this.dialog = null;
		this.currentFont = 'Helvetica';
		this.currentSize = 16;
		this.currentBold = false;
		this.currentItalic = false;
		this.currentUnderline = false;
		this.onChange = null;
		this.loadedFonts = new Set();

		// Popular Google Fonts to offer
		this.googleFonts = [
			'Roboto',
			'Open Sans',
			'Lato',
			'Montserrat',
			'Oswald',
			'Raleway',
			'PT Sans',
			'Merriweather',
			'Nunito',
			'Playfair Display',
			'Ubuntu',
			'Poppins',
			'Work Sans',
			'Noto Sans',
			'Fira Sans',
		];

		// System fonts (always available)
		this.systemFonts = ['Helvetica', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'];
	}

	open(options = {}) {
		if (this.isOpen) return;

		// Load current values from options
		this.currentFont = options.fontFamily || this.currentFont;
		this.currentSize = options.fontSize || this.currentSize;
		this.currentBold = options.bold || false;
		this.currentItalic = options.italic || false;
		this.currentUnderline = options.underline || false;
		this.onChange = options.onChange || (() => {});

		// Create dialog
		this.dialog = document.createElement('div');
		this.dialog.className = 'font-style-dialog';
		this.dialog.innerHTML = `
			<div class="font-style-dialog-content">
				<div class="font-style-header">
					<h3>Font Style</h3>
					<button class="font-style-close" data-action="close">
						<i data-lucide="x" style="width: 16px; height: 16px;"></i>
					</button>
				</div>

				<div class="font-style-section">
					<label class="font-style-label">Font Family</label>
					<select class="font-style-select" data-prop="fontFamily">
						<optgroup label="System Fonts">
							${this.systemFonts.map((font) => `<option value="${font}" ${this.currentFont === font ? 'selected' : ''}>${font}</option>`).join('')}
						</optgroup>
						<optgroup label="Google Fonts">
							${this.googleFonts.map((font) => `<option value="${font}" ${this.currentFont === font ? 'selected' : ''}>${font}</option>`).join('')}
						</optgroup>
					</select>
				</div>

				<div class="font-style-section">
					<label class="font-style-label">Font Size</label>
					<div class="font-size-controls">
						<input type="number" class="font-size-input" data-prop="fontSize" min="8" max="72" value="${this.currentSize}" />
						<span class="font-size-unit">px</span>
					</div>
				</div>

				<div class="font-style-section">
					<label class="font-style-label">Text Style</label>
					<div class="font-style-toggles">
						<button class="font-style-toggle ${this.currentBold ? 'active' : ''}" data-prop="bold" title="Bold">
							<i data-lucide="bold" style="width: 16px; height: 16px;"></i>
						</button>
						<button class="font-style-toggle ${this.currentItalic ? 'active' : ''}" data-prop="italic" title="Italic">
							<i data-lucide="italic" style="width: 16px; height: 16px;"></i>
						</button>
						<button class="font-style-toggle ${this.currentUnderline ? 'active' : ''}" data-prop="underline" title="Underline">
							<i data-lucide="underline" style="width: 16px; height: 16px;"></i>
						</button>
					</div>
				</div>

				<div class="font-style-preview-section">
					<label class="font-style-label">Preview</label>
					<div class="font-style-preview" data-role="preview">
						The quick brown fox jumps over the lazy dog
					</div>
				</div>
			</div>
		`;

		// Add to body
		document.body.appendChild(this.dialog);

		// Initialize Lucide icons
		if (window.lucide) {
			lucide.createIcons();
		}

		// Get elements
		this.elements = {
			fontSelect: this.dialog.querySelector('[data-prop="fontFamily"]'),
			sizeInput: this.dialog.querySelector('[data-prop="fontSize"]'),
			boldBtn: this.dialog.querySelector('[data-prop="bold"]'),
			italicBtn: this.dialog.querySelector('[data-prop="italic"]'),
			underlineBtn: this.dialog.querySelector('[data-prop="underline"]'),
			preview: this.dialog.querySelector('[data-role="preview"]'),
			closeBtn: this.dialog.querySelector('[data-action="close"]'),
		};

		// Set up event listeners
		this.setupEvents();

		// Update preview
		this.updatePreview();

		// Close dialog when clicking outside
		setTimeout(() => {
			document.addEventListener('click', this.handleOutsideClick);
		}, 0);

		this.isOpen = true;
	}

	close() {
		if (!this.isOpen || !this.dialog) return;

		document.removeEventListener('click', this.handleOutsideClick);
		this.dialog.remove();
		this.dialog = null;
		this.isOpen = false;
	}

	handleOutsideClick = (e) => {
		if (this.dialog && !this.dialog.contains(e.target)) {
			this.close();
		}
	};

	setupEvents() {
		// Close button
		this.elements.closeBtn.addEventListener('click', () => {
			this.close();
		});

		// Font family change
		this.elements.fontSelect.addEventListener('change', (e) => {
			this.currentFont = e.target.value;
			this.loadGoogleFont(this.currentFont);
			this.updatePreview();
			this.triggerChange();
		});

		// Font size change
		this.elements.sizeInput.addEventListener('input', (e) => {
			this.currentSize = Number.parseInt(e.target.value) || 16;
			this.updatePreview();
			this.triggerChange();
		});

		// Bold toggle
		this.elements.boldBtn.addEventListener('click', () => {
			this.currentBold = !this.currentBold;
			this.elements.boldBtn.classList.toggle('active', this.currentBold);
			this.updatePreview();
			this.triggerChange();
		});

		// Italic toggle
		this.elements.italicBtn.addEventListener('click', () => {
			this.currentItalic = !this.currentItalic;
			this.elements.italicBtn.classList.toggle('active', this.currentItalic);
			this.updatePreview();
			this.triggerChange();
		});

		// Underline toggle
		this.elements.underlineBtn.addEventListener('click', () => {
			this.currentUnderline = !this.currentUnderline;
			this.elements.underlineBtn.classList.toggle('active', this.currentUnderline);
			this.updatePreview();
			this.triggerChange();
		});

		// Prevent dialog clicks from closing it
		this.dialog.addEventListener('click', (e) => {
			e.stopPropagation();
		});
	}

	loadGoogleFont(fontName) {
		// Skip if system font or already loaded
		if (this.systemFonts.includes(fontName) || this.loadedFonts.has(fontName)) {
			return;
		}

		// Load from Google Fonts
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;700&display=swap`;
		document.head.appendChild(link);

		this.loadedFonts.add(fontName);
	}

	updatePreview() {
		if (!this.elements.preview) return;

		// Apply styles to preview
		const fontFamily = this.systemFonts.includes(this.currentFont) ? this.currentFont : `'${this.currentFont}', sans-serif`;

		this.elements.preview.style.fontFamily = fontFamily;
		this.elements.preview.style.fontSize = `${this.currentSize}px`;
		this.elements.preview.style.fontWeight = this.currentBold ? 'bold' : 'normal';
		this.elements.preview.style.fontStyle = this.currentItalic ? 'italic' : 'normal';
		this.elements.preview.style.textDecoration = this.currentUnderline ? 'underline' : 'none';
	}

	triggerChange() {
		if (this.onChange) {
			this.onChange({
				fontFamily: this.currentFont,
				fontSize: this.currentSize,
				bold: this.currentBold,
				italic: this.currentItalic,
				underline: this.currentUnderline,
			});
		}
	}

	getCurrentStyle() {
		return {
			fontFamily: this.currentFont,
			fontSize: this.currentSize,
			bold: this.currentBold,
			italic: this.currentItalic,
			underline: this.currentUnderline,
		};
	}
}

// Create global instance
window.FontStyleDialog = new FontStyleDialog();
