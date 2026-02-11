// ColorPicker - Compact color picker with popover dialogue
// Uses native HTML5 color input and EyeDropper API

class ColorPicker {
	constructor(options = {}) {
		this.container = options.container; // Element or selector
		this.defaultColor = options.default || '#000000';
		this.onChange = options.onChange || (() => {});
		this.label = options.label || 'Color';
		this.swatches = options.swatches || [
			'#000000',
			'#ffffff',
			'#ff0000',
			'#00ff00',
			'#0000ff',
			'#ffff00',
			'#ff00ff',
			'#00ffff',
		];
		this.currentColor = this.defaultColor;
		this.isOpen = false;
		this.popover = null;

		this.init();
	}

	init() {
		// Get container element
		const container =
			typeof this.container === 'string'
				? document.querySelector(this.container)
				: this.container;

		if (!container) {
			console.error('ColorPicker: Container not found');
			return;
		}

		// Build compact UI - just the color box
		container.innerHTML = `
			<div class="color-picker-compact">
				<div class="color-picker-box" style="background-color: ${this.currentColor};" title="Click to pick color"></div>
			</div>
		`;

		// Get elements
		this.colorBox = container.querySelector('.color-picker-box');

		// Set up event listeners
		this.setupEvents();
	}

	setupEvents() {
		// Color box click opens popover
		this.colorBox.addEventListener('click', (e) => {
			e.stopPropagation();
			if (this.isOpen) {
				this.closePopover();
			} else {
				this.openPopover();
			}
		});
	}

	openPopover() {
		if (this.isOpen) return;

		// Create popover
		this.popover = document.createElement('div');
		this.popover.className = 'color-picker-popover';
		this.popover.innerHTML = `
			<div class="color-picker-popover-content">
				<div class="color-picker-preview" style="background-color: ${this.currentColor};" data-role="preview"></div>
				<input type="color" class="color-picker-input" value="${this.currentColor}" data-role="input" />
				<button class="color-picker-eyedropper" title="Pick color from screen" data-role="eyedropper">
					<i data-lucide="pipette" style="width: 14px; height: 14px;"></i>
				</button>
				<div class="color-picker-swatches" data-role="swatches">
					${this.swatches.map((color) => `<button class="color-swatch" style="background-color: ${color};" data-color="${color}" title="${color}"></button>`).join('')}
				</div>
			</div>
		`;

		// Add to body
		document.body.appendChild(this.popover);

		// Initialize Lucide icons
		if (window.lucide) {
			lucide.createIcons();
		}

		// Position popover near the color box
		this.positionPopover();

		// Get popover elements
		this.popoverElements = {
			preview: this.popover.querySelector('[data-role="preview"]'),
			input: this.popover.querySelector('[data-role="input"]'),
			eyedropper: this.popover.querySelector('[data-role="eyedropper"]'),
			swatches: this.popover.querySelectorAll('.color-swatch'),
		};

		// Set up popover event listeners
		this.setupPopoverEvents();

		// Check if EyeDropper is supported
		if (!('EyeDropper' in window)) {
			this.popoverElements.eyedropper.style.display = 'none';
		}

		// Close popover when clicking outside
		setTimeout(() => {
			document.addEventListener('click', this.handleOutsideClick);
		}, 0);

		this.isOpen = true;
	}

	closePopover() {
		if (!this.isOpen || !this.popover) return;

		document.removeEventListener('click', this.handleOutsideClick);
		this.popover.remove();
		this.popover = null;
		this.isOpen = false;
	}

	handleOutsideClick = (e) => {
		if (this.popover && !this.popover.contains(e.target) && !this.colorBox.contains(e.target)) {
			this.closePopover();
		}
	};

	positionPopover() {
		const boxRect = this.colorBox.getBoundingClientRect();
		const popoverHeight = 180; // Approximate height
		const popoverWidth = 220;

		// Position below the color box
		let top = boxRect.bottom + 8;
		let left = boxRect.left;

		// Check if popover would go off-screen
		if (top + popoverHeight > window.innerHeight) {
			// Position above instead
			top = boxRect.top - popoverHeight - 8;
		}

		if (left + popoverWidth > window.innerWidth) {
			// Align to right
			left = window.innerWidth - popoverWidth - 8;
		}

		this.popover.style.top = `${top}px`;
		this.popover.style.left = `${left}px`;
	}

	setupPopoverEvents() {
		// Preview click opens native color picker
		this.popoverElements.preview.addEventListener('click', () => {
			this.popoverElements.input.click();
		});

		// Color input change
		this.popoverElements.input.addEventListener('input', (e) => {
			this.setColor(e.target.value);
		});

		// Eyedropper click
		this.popoverElements.eyedropper.addEventListener('click', async () => {
			await this.openEyeDropper();
		});

		// Swatch clicks
		this.popoverElements.swatches.forEach((swatch) => {
			swatch.addEventListener('click', () => {
				const color = swatch.dataset.color;
				this.setColor(color);
			});
		});

		// Prevent popover clicks from closing it
		this.popover.addEventListener('click', (e) => {
			e.stopPropagation();
		});
	}

	async openEyeDropper() {
		if (!('EyeDropper' in window)) {
			console.warn('EyeDropper API not supported');
			return;
		}

		try {
			const eyeDropper = new EyeDropper();
			const result = await eyeDropper.open();
			this.setColor(result.sRGBHex);
		} catch (err) {
			// User cancelled or error occurred
			console.log('EyeDropper cancelled or error:', err);
		}
	}

	setColor(color) {
		// Normalize color to hex
		const hexColor = this.normalizeColor(color);

		this.currentColor = hexColor;
		this.colorBox.style.backgroundColor = hexColor;

		// Update popover if open
		if (this.isOpen && this.popoverElements) {
			this.popoverElements.preview.style.backgroundColor = hexColor;
			this.popoverElements.input.value = hexColor;
		}

		// Trigger onChange callback
		this.onChange(hexColor);
	}

	getColor() {
		return this.currentColor;
	}

	normalizeColor(color) {
		// Ensure color is in #RRGGBB format
		if (color.length === 9 && color.startsWith('#')) {
			// Remove alpha channel if present (#RRGGBBAA -> #RRGGBB)
			return color.substring(0, 7);
		}
		return color;
	}

	destroy() {
		// Clean up
		this.closePopover();
		const container =
			typeof this.container === 'string'
				? document.querySelector(this.container)
				: this.container;
		if (container) {
			container.innerHTML = '';
		}
	}
}

// Export for use in other scripts
window.ColorPicker = ColorPicker;
