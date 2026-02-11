// ColorPicker - Wrapper around Pickr library for consistent color picking
// Uses @simonwep/pickr with eyedropper and alpha support

class ColorPicker {
	constructor(options = {}) {
		this.container = options.container; // Element or selector
		this.defaultColor = options.default || '#000000';
		this.defaultAlpha = options.alpha !== undefined ? options.alpha : 1.0;
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
		this.currentAlpha = this.defaultAlpha;
		this.pickr = null;

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

		// Clear container
		container.innerHTML = '';

		// Initialize Pickr - it will create a button inside the container
		this.pickr = Pickr.create({
			el: container,
			theme: 'nano', // Minimal theme
			default: this.hexToRgba(this.currentColor, this.currentAlpha),
			swatches: this.swatches,
			useAsButton: false, // Let Pickr create its own button
			components: {
				// Main components
				preview: true,
				opacity: true, // Alpha channel support
				hue: true,

				// Input / output Options
				interaction: {
					hex: true,
					rgba: true,
					input: true,
					save: false,
					clear: false,
				},
			},
		});

		// Set up event listeners
		this.setupEvents();

		// Add eyedropper button after Pickr app is created
		this.pickr.on('init', () => {
			this.addEyedropperButton();
		});
	}

	setupEvents() {
		// When color changes
		this.pickr.on('change', (color) => {
			const rgba = color.toRGBA();
			const hex = this.rgbToHex(rgba[0], rgba[1], rgba[2]);
			const alpha = rgba[3];

			this.currentColor = hex;
			this.currentAlpha = alpha;

			// Trigger onChange callback
			this.onChange(hex, alpha);
		});

		// Update on init
		this.pickr.on('init', () => {
			// Set initial color
			const rgba = this.hexToRgba(this.currentColor, this.currentAlpha);
			this.pickr.setColor(rgba, true);
		});
	}

	addEyedropperButton() {
		// Only add if EyeDropper API is supported
		if (!('EyeDropper' in window)) return;

		// Find the Pickr interaction container
		const pickrApp = this.pickr.getRoot().app;
		const interactionSection = pickrApp.querySelector('.pcr-interaction');

		if (!interactionSection) return;

		// Create eyedropper button
		const eyedropperBtn = document.createElement('button');
		eyedropperBtn.type = 'button';
		eyedropperBtn.className = 'pcr-eyedropper-btn';
		eyedropperBtn.innerHTML = '💧'; // Droplet emoji or you can use an icon
		eyedropperBtn.title = 'Pick color from screen';
		eyedropperBtn.style.cssText = `
			background: var(--bg3);
			border: 1px solid var(--brd);
			border-radius: 4px;
			padding: 6px 12px;
			cursor: pointer;
			margin-top: 8px;
			width: 100%;
			color: var(--txt2);
			font-size: 14px;
		`;

		eyedropperBtn.addEventListener('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			await this.openEyeDropper();
		});

		interactionSection.appendChild(eyedropperBtn);
	}

	async openEyeDropper() {
		if (!('EyeDropper' in window)) {
			console.warn('EyeDropper API not supported');
			return;
		}

		try {
			const eyeDropper = new EyeDropper();
			const result = await eyeDropper.open();

			// Extract RGB values from the result
			const color = result.sRGBHex;
			this.setColor(color, this.currentAlpha);
		} catch (err) {
			// User cancelled or error occurred - silently ignore
		}
	}

	setColor(color, alpha = this.currentAlpha) {
		this.currentColor = color;
		this.currentAlpha = alpha;

		if (this.pickr) {
			const rgba = this.hexToRgba(color, alpha);
			this.pickr.setColor(rgba, true);
		}
	}

	getColor() {
		return this.currentColor;
	}

	getAlpha() {
		return this.currentAlpha;
	}

	getRGBA() {
		return this.hexToRgba(this.currentColor, this.currentAlpha);
	}

	hexToRgb(hex) {
		hex = hex.replace('#', '');
		const r = Number.parseInt(hex.substring(0, 2), 16);
		const g = Number.parseInt(hex.substring(2, 4), 16);
		const b = Number.parseInt(hex.substring(4, 6), 16);
		return { r, g, b };
	}

	hexToRgba(hex, alpha) {
		const { r, g, b } = this.hexToRgb(hex);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	rgbToHex(r, g, b) {
		const toHex = (n) => {
			const hex = Math.round(n).toString(16);
			return hex.length === 1 ? '0' + hex : hex;
		};
		return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
	}

	destroy() {
		if (this.pickr) {
			this.pickr.destroyAndRemove();
			this.pickr = null;
		}
	}
}

// Export for use in other scripts
window.ColorPicker = ColorPicker;
