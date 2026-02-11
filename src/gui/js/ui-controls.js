// UI Controls, Layer Manager, and Selection Manager
const UIControls = (() => {
	function showTextEditor() {
		document.getElementById('textEditorSection').style.display = 'block';
		document.getElementById('selectedLayerEditor').style.display = 'none';
		document.getElementById('textContent').focus();
	}

	function closeTextEditor() {
		document.getElementById('textEditorSection').style.display = 'none';
		document.getElementById('textContent').value = '';
		document.getElementById('dateFormatBtn').style.display = 'none';
		if (window.updateAddTextButtonState) {
			window.updateAddTextButtonState();
		}
	}

	function showRectangleEditor() {
		document.getElementById('rectangleEditorSection').style.display = 'block';
		document.getElementById('selectedLayerEditor').style.display = 'none';
		document.getElementById('textEditorSection').style.display = 'none';

		// Reset rectangle editor state
		window.selectedRectangleColor = '#000000';
		window.selectedRectangleBorderFade = 0;

		const fadeSlider = document.getElementById('rectangleBorderFadeSlider');
		const fadeValue = document.getElementById('rectangleBorderFadeValue');
		if (fadeSlider) fadeSlider.value = 0;
		if (fadeValue) fadeValue.textContent = 0;
	}

	function closeRectangleEditor() {
		document.getElementById('rectangleEditorSection').style.display = 'none';
	}

	function updateRectangleBorderFade(fadeWidth) {
		const fadeValue = document.getElementById('rectangleBorderFadeValue');
		if (fadeValue) {
			fadeValue.textContent = fadeWidth;
		}
		window.selectedRectangleBorderFade = Number.parseFloat(fadeWidth);
	}

	function showLayerEditor(overlay, index) {
		const editor = document.getElementById('selectedLayerEditor');
		const textControls = document.getElementById('textLayerControls');
		const titleEl = document.getElementById('selectedLayerTitle');
		const opacitySlider = document.getElementById('opacitySlider');
		const opacityValue = document.getElementById('opacityValue');

		editor.style.display = 'block';
		document.getElementById('textEditorSection').style.display = 'none';
		document.getElementById('rectangleEditorSection').style.display = 'none';

		const isText = overlay.type === 'date' || overlay.type === 'text';
		const isRectangle = overlay.type === 'rectangle';

		if (isRectangle) {
			titleEl.textContent = 'Edit Shape';
		} else {
			titleEl.textContent = isText ? 'Edit Text' : 'Edit Image';
		}

		textControls.style.display = isText ? 'block' : 'none';

		// Handle background removal for images (not text)
		if (!isText && !isRectangle) {
			// Apply background removal preview if enabled and not already processed
			if (
				overlay.removeBackground &&
				!overlay._processedImageData &&
				window.BackgroundRemover
			) {
				applyBackgroundRemovalToPreview(index, overlay);
			}
		}

		const opacity = overlay.opacity || 100;
		opacitySlider.value = opacity;
		opacityValue.textContent = opacity;

		if (isText) {
			document.getElementById('editTextContent').value = overlay.dateText || '';

			// Font family
			const fontFamilySelect = document.getElementById('editFontFamily');
			if (fontFamilySelect) {
				fontFamilySelect.value = overlay.fontFamily || 'Helvetica';
			}

			// Text style button states
			const bold = overlay.bold || false;
			const italic = overlay.italic || false;
			const underline = overlay.underline || false;

			// Update individual toggle button states
			const boldBtn = document.getElementById('boldBtn');
			const italicBtn = document.getElementById('italicBtn');
			const underlineBtn = document.getElementById('underlineBtn');

			if (boldBtn) {
				if (bold) {
					boldBtn.classList.add('active');
				} else {
					boldBtn.classList.remove('active');
				}
			}
			if (italicBtn) {
				if (italic) {
					italicBtn.classList.add('active');
				} else {
					italicBtn.classList.remove('active');
				}
			}
			if (underlineBtn) {
				if (underline) {
					underlineBtn.classList.add('active');
				} else {
					underlineBtn.classList.remove('active');
				}
			}

			// Text style cycling button state (for backwards compatibility)
			const textStyleIcon = document.getElementById('textStyleIcon');
			const textStyleLabel = document.getElementById('textStyleLabel');

			// Determine current style
			const styles = [
				{ bold: false, italic: false, underline: false, icon: 'type', label: 'Regular' },
				{ bold: true, italic: false, underline: false, icon: 'bold', label: 'Bold' },
				{ bold: false, italic: true, underline: false, icon: 'italic', label: 'Italic' },
				{ bold: false, italic: false, underline: true, icon: 'underline', label: 'Underline' },
				{ bold: true, italic: true, underline: false, icon: 'bold', label: 'Bold Italic' },
				{ bold: true, italic: false, underline: true, icon: 'bold', label: 'Bold Underline' },
				{ bold: false, italic: true, underline: true, icon: 'italic', label: 'Italic Underline' },
				{ bold: true, italic: true, underline: true, icon: 'bold', label: 'Bold Italic Underline' },
			];
			const currentStyle = styles.find(
				s => s.bold === bold && s.italic === italic && s.underline === underline
			) || styles[0];

			if (textStyleIcon) {
				textStyleIcon.setAttribute('data-lucide', currentStyle.icon);
				if (window.lucide) window.lucide.createIcons();
			}
			if (textStyleLabel) {
				textStyleLabel.textContent = currentStyle.label;
			}

			if (window.textColorPicker) {
				const textColor = overlay.textColor || '#000000';
				window.textColorPicker.setColor(textColor);
				window.selectedTextColor = textColor;
			}

			if (window.highlightColorPicker) {
				const highlightColor = overlay.highlightColor || '#ffff00';
				window.highlightColorPicker.setColor(highlightColor);
				window.selectedHighlightColor = highlightColor;
			}

			// Show/update highlight blur slider if highlight is enabled
			const highlightBlurGroup = document.getElementById('highlightBlurGroup');
			const highlightBlurSlider = document.getElementById('highlightBlurSlider');
			const highlightBlurValue = document.getElementById('highlightBlurValue');
			if (overlay.highlightColor) {
				if (highlightBlurGroup) highlightBlurGroup.style.display = 'block';
				const blurWidth = overlay.highlightBlur || 0;
				if (highlightBlurSlider) highlightBlurSlider.value = blurWidth;
				if (highlightBlurValue) highlightBlurValue.textContent = blurWidth;
			} else {
				if (highlightBlurGroup) highlightBlurGroup.style.display = 'none';
			}

			if (window.bgColorPicker) {
				const bgColor = overlay.bgColor || '#ffffff';
				window.bgColorPicker.setColor(bgColor);
				window.selectedBgColor = bgColor;
			}

			// Show date format selector for date layers
			const dateFormatGroup = document.getElementById('editDateFormatGroup');
			const dateFormatBtn = document.getElementById('editDateFormatBtn');
			if (overlay.type === 'date') {
				if (dateFormatGroup) dateFormatGroup.style.display = 'block';
				if (dateFormatBtn) {
					// Store the current format in the overlay if not already stored
					if (!overlay.dateFormat) {
						overlay.dateFormat = window.currentDateFormat || 'MM/DD/YYYY';
					}
					dateFormatBtn.textContent = overlay.dateFormat;
				}
			} else {
				if (dateFormatGroup) dateFormatGroup.style.display = 'none';
			}
		} else {
			const dateFormatGroup = document.getElementById('editDateFormatGroup');
			if (dateFormatGroup) dateFormatGroup.style.display = 'none';
		}

		if (window.lucide) lucide.createIcons();
	}

	function toggleLayerTransparency() {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		const isText = overlay.type === 'date' || overlay.type === 'text';
		const checkbox = document.getElementById('layerTransparentCheckbox');

		if (isText) {
			const showBg = checkbox.checked;

			// Default to white if no background color is set
			if (showBg && !window.selectedBgColor) {
				window.selectedBgColor = '#ffffff';
				if (window.bgColorPicker) {
					window.bgColorPicker.setColor('#ffffff');
				}
			}

			// Update overlay state properly via AppState
			AppState.updateOverlay(index, {
				transparentBg: !showBg,
				bgColor: showBg ? window.selectedBgColor : null,
			});

			const gizmo = document.querySelector(
				`.overlay-gizmo[data-overlay-index="${index}"]`,
			);
			if (gizmo) {
				const textEl = gizmo.querySelector('.overlay-gizmo-text');
				if (textEl) {
					textEl.style.backgroundColor = showBg
						? window.selectedBgColor
						: 'transparent';
				}
			}
		} else {
			// Update overlay state properly via AppState
			AppState.updateOverlay(index, {
				removeBackground: checkbox.checked,
			});

			// Apply background removal to preview if enabled
			if (checkbox.checked && window.BackgroundRemover) {
				applyBackgroundRemovalToPreview(index, overlay);
			} else {
				// Restore original image
				restoreOriginalImage(index, overlay);
			}
		}

		if (window.lucide) lucide.createIcons();
	}

	async function applyBackgroundRemovalToPreview(index, overlay) {
		const gizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${index}"]`,
		);
		if (!gizmo) return;

		const img = gizmo.querySelector('img');
		if (!img || !overlay.imageData) return;

		try {
			// Show processing indicator
			gizmo.style.opacity = '0.5';

			// Process image with background removal
			const processedImage = await window.BackgroundRemover.removeBackground(
				overlay.imageData,
				{
					tolerance: 25,
					featherRadius: 3,
					edgeDetection: true,
				},
			);

			// Update overlay with processed image for preview
			overlay._processedImageData = processedImage;
			img.src = processedImage;

			// Restore opacity
			gizmo.style.opacity = (overlay.opacity || 100) / 100;
		} catch (error) {
			console.error('Background removal failed:', error);
			gizmo.style.opacity = (overlay.opacity || 100) / 100;
		}
	}

	function restoreOriginalImage(index, overlay) {
		const gizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${index}"]`,
		);
		if (!gizmo) return;

		const img = gizmo.querySelector('img');
		if (!img || !overlay.imageData) return;

		// Restore original image
		img.src = overlay.imageData;
		delete overlay._processedImageData;
	}

	function updateLayerOpacity(value) {
		document.getElementById('opacityValue').textContent = value;
		const index = AppState.getSelectedIndex();
		if (index !== null) {
			AppState.updateOverlay(index, { opacity: Number.parseInt(value) });
			const gizmo = document.querySelector(
				`.overlay-gizmo[data-overlay-index="${index}"]`,
			);
			if (gizmo) {
				gizmo.style.opacity = Number.parseInt(value) / 100;
			}
		}
	}

	function updateLayerText(newText) {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		AppState.updateOverlay(index, { dateText: newText });

		const label =
			newText.length > 20 ? `${newText.substring(0, 20)}...` : newText;
		const gizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${index}"]`,
		);
		if (gizmo) {
			const labelEl = gizmo.querySelector('.overlay-gizmo-label');
			if (labelEl) labelEl.textContent = label;
			const textEl = gizmo.querySelector('.overlay-gizmo-text');
			if (textEl) textEl.textContent = newText;
		}

		LayerManager.updateLayersList();
	}

	function updateLayerColor(color, isBackground = false, alpha = 1.0) {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		if (isBackground) {
			window.selectedBgColor = color;
			if (!overlay.transparentBg) {
				AppState.updateOverlay(index, { bgColor: color, bgAlpha: alpha });
				const gizmo = document.querySelector(
					`.overlay-gizmo[data-overlay-index="${index}"]`,
				);
				if (gizmo) {
					const textEl = gizmo.querySelector('.overlay-gizmo-text');
					if (textEl) {
						const rgba = hexToRgba(color, alpha);
						textEl.style.backgroundColor = rgba;
					}
				}
			}
		} else {
			window.selectedTextColor = color;
			AppState.updateOverlay(index, { textColor: color, textAlpha: alpha });
			const gizmo = document.querySelector(
				`.overlay-gizmo[data-overlay-index="${index}"]`,
			);
			if (gizmo) {
				const textEl = gizmo.querySelector('.overlay-gizmo-text');
				if (textEl) {
					const rgba = hexToRgba(color, alpha);
					textEl.style.color = rgba;
				}
			}
		}
	}

	// Helper function to convert hex + alpha to rgba
	function hexToRgba(hex, alpha) {
		hex = hex.replace('#', '');
		const r = Number.parseInt(hex.substring(0, 2), 16);
		const g = Number.parseInt(hex.substring(2, 4), 16);
		const b = Number.parseInt(hex.substring(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	function updateLayerFontFamily(fontFamily) {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		AppState.updateOverlay(index, { fontFamily });

		// Update gizmo visual
		const gizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${index}"]`,
		);
		if (gizmo) {
			const textEl = gizmo.querySelector('.overlay-gizmo-text');
			if (textEl) {
				// Load Google Font if needed
				if (!['Helvetica', 'Times', 'Courier'].includes(fontFamily)) {
					const link = document.createElement('link');
					link.rel = 'stylesheet';
					link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, '+')}:wght@400;700&display=swap`;
					document.head.appendChild(link);
				}
				textEl.style.fontFamily =
					fontFamily === 'Times' ? 'Times New Roman' : fontFamily;
			}
		}

		window.PreviewController?.renderPage(window.currentPreviewPage);
	}

	function updateLayerBold(bold) {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		AppState.updateOverlay(index, { bold });

		// Update gizmo visual
		const gizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${index}"]`,
		);
		if (gizmo) {
			const textEl = gizmo.querySelector('.overlay-gizmo-text');
			if (textEl) {
				textEl.style.fontWeight = bold ? 'bold' : 'normal';
			}
		}

		window.PreviewController?.renderPage(window.currentPreviewPage);
	}

	function updateLayerItalic(italic) {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		AppState.updateOverlay(index, { italic });

		// Update gizmo visual
		const gizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${index}"]`,
		);
		if (gizmo) {
			const textEl = gizmo.querySelector('.overlay-gizmo-text');
			if (textEl) {
				textEl.style.fontStyle = italic ? 'italic' : 'normal';
			}
		}

		window.PreviewController?.renderPage(window.currentPreviewPage);
	}

	function updateLayerUnderline(underline) {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		AppState.updateOverlay(index, { underline });

		// Update gizmo visual
		const gizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${index}"]`,
		);
		if (gizmo) {
			const textEl = gizmo.querySelector('.overlay-gizmo-text');
			if (textEl) {
				textEl.style.textDecoration = underline ? 'underline' : 'none';
			}
		}

		window.PreviewController?.renderPage(window.currentPreviewPage);
	}

	function updateLayerHighlight(color) {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		window.selectedHighlightColor = color;
		AppState.updateOverlay(index, { highlightColor: color });

		// Show blur slider if highlight is enabled
		const highlightBlurGroup = document.getElementById('highlightBlurGroup');
		if (highlightBlurGroup) {
			highlightBlurGroup.style.display = color ? 'block' : 'none';
		}

		// Update gizmo visual
		const gizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${index}"]`,
		);
		if (gizmo) {
			const textEl = gizmo.querySelector('.overlay-gizmo-text');
			if (textEl) {
				// Highlight is like a background color on the text itself
				textEl.style.backgroundColor = color;
			}
		}

		window.PreviewController?.renderPage(window.currentPreviewPage);
	}

	function updateHighlightBlur(blurWidth) {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		// Update value display
		const highlightBlurValue = document.getElementById('highlightBlurValue');
		if (highlightBlurValue) {
			highlightBlurValue.textContent = blurWidth;
		}

		// Store blur width in overlay
		AppState.updateOverlay(index, { highlightBlur: Number.parseFloat(blurWidth) });

		window.PreviewController?.renderPage(window.currentPreviewPage);
	}

	function togglePagesPanel() {
		const panel = document.getElementById('thumbnailsPanel');
		const btn = panel?.querySelector('.collapse-btn i');
		if (!panel) return;

		const isCollapsed = panel.classList.toggle('collapsed');

		// Update icon direction
		if (btn) {
			btn.setAttribute('data-lucide', isCollapsed ? 'chevron-right' : 'chevron-left');
			if (window.lucide) lucide.createIcons();
		}
	}

	function toggleBold() {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		const newBoldState = !overlay.bold;
		updateLayerBold(newBoldState);

		// Update button visual state
		const btn = document.getElementById('boldBtn');
		if (btn) {
			if (newBoldState) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		}
	}

	function toggleItalic() {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		const newItalicState = !overlay.italic;
		updateLayerItalic(newItalicState);

		// Update button visual state
		const btn = document.getElementById('italicBtn');
		if (btn) {
			if (newItalicState) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		}
	}

	function toggleUnderline() {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		const newUnderlineState = !overlay.underline;
		updateLayerUnderline(newUnderlineState);

		// Update button visual state
		const btn = document.getElementById('underlineBtn');
		if (btn) {
			if (newUnderlineState) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		}
	}

	function cycleTextStyle() {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		// Get current style state
		const bold = overlay.bold || false;
		const italic = overlay.italic || false;
		const underline = overlay.underline || false;

		// Define style combinations cycle (8 states)
		const styles = [
			{ bold: false, italic: false, underline: false, icon: 'type', label: 'Regular' },
			{ bold: true, italic: false, underline: false, icon: 'bold', label: 'Bold' },
			{ bold: false, italic: true, underline: false, icon: 'italic', label: 'Italic' },
			{ bold: false, italic: false, underline: true, icon: 'underline', label: 'Underline' },
			{ bold: true, italic: true, underline: false, icon: 'bold', label: 'Bold Italic' },
			{ bold: true, italic: false, underline: true, icon: 'bold', label: 'Bold Underline' },
			{ bold: false, italic: true, underline: true, icon: 'italic', label: 'Italic Underline' },
			{ bold: true, italic: true, underline: true, icon: 'bold', label: 'Bold Italic Underline' },
		];

		// Find current style index
		let currentIndex = styles.findIndex(
			s => s.bold === bold && s.italic === italic && s.underline === underline
		);
		if (currentIndex === -1) currentIndex = 0;

		// Move to next style
		const nextIndex = (currentIndex + 1) % styles.length;
		const nextStyle = styles[nextIndex];

		// Update overlay
		AppState.updateOverlay(index, {
			bold: nextStyle.bold,
			italic: nextStyle.italic,
			underline: nextStyle.underline,
		});

		// Update button UI
		const icon = document.getElementById('textStyleIcon');
		const label = document.getElementById('textStyleLabel');
		if (icon) {
			icon.setAttribute('data-lucide', nextStyle.icon);
			if (window.lucide) lucide.createIcons();
		}
		if (label) {
			label.textContent = nextStyle.label;
		}

		// Update gizmo visual
		const gizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${index}"]`,
		);
		if (gizmo) {
			const textEl = gizmo.querySelector('.overlay-gizmo-text');
			if (textEl) {
				textEl.style.fontWeight = nextStyle.bold ? 'bold' : 'normal';
				textEl.style.fontStyle = nextStyle.italic ? 'italic' : 'normal';
				textEl.style.textDecoration = nextStyle.underline ? 'underline' : 'none';
			}
		}

		window.PreviewController?.renderPage(window.currentPreviewPage);
	}

	return {
		showTextEditor,
		closeTextEditor,
		showRectangleEditor,
		closeRectangleEditor,
		updateRectangleBorderFade,
		showLayerEditor,
		toggleLayerTransparency,
		updateLayerOpacity,
		updateLayerText,
		updateLayerColor,
		updateLayerFontFamily,
		updateLayerBold,
		updateLayerItalic,
		updateLayerUnderline,
		updateLayerHighlight,
		updateHighlightBlur,
		togglePagesPanel,
		toggleBold,
		toggleItalic,
		toggleUnderline,
		cycleTextStyle,
	};
})();

const LayerManager = (() => {
	function updateLayersList() {
		const container = document.getElementById('layersList');
		if (!container) return;

		const overlays = AppState.getOverlays();

		if (overlays.length === 0) {
			container.style.display = 'none';
			return;
		}

		// Show layers list when there are overlays
		container.style.display = 'block';

		const layersContainer = document.getElementById('layersContainer');
		if (!layersContainer) return;
		layersContainer.innerHTML = '';

		overlays.forEach((overlay, index) => {
			const item = document.createElement('div');
			item.className = 'layer-item';
			if (AppState.getSelectedIndex() === index) {
				item.classList.add('selected');
			}

			const label = overlay.dateText || overlay.type || 'Layer';
			const displayLabel =
				label.length > 25 ? `${label.substring(0, 25)}...` : label;

			const isFirst = index === 0;
			const isLast = index === overlays.length - 1;

			item.innerHTML = `
                <div class="layer-icon">
                    <i data-lucide="${overlay.type === 'image' || overlay.type === 'signature' ? 'image' : 'type'}"></i>
                </div>
                <div class="layer-name">${displayLabel} <span style="opacity: 0.6; font-size: 11px;">(p${(overlay.pageIndex || 0) + 1})</span></div>
                <div class="layer-controls">
                    <button class="layer-btn" onclick="LayerManager.moveLayerUp(${index})" title="Move up" ${isFirst ? 'disabled' : ''}>
                        <i data-lucide="chevron-up" style="width: 10px; height: 10px;"></i>
                    </button>
                    <button class="layer-btn" onclick="LayerManager.moveLayerDown(${index})" title="Move down" ${isLast ? 'disabled' : ''}>
                        <i data-lucide="chevron-down" style="width: 10px; height: 10px;"></i>
                    </button>
                    <button class="layer-btn" onclick="window.removeOverlay(${index})" title="Delete layer">
                        <i data-lucide="trash-2" style="width: 10px; height: 10px;"></i>
                    </button>
                </div>
            `;

			item.addEventListener('click', (e) => {
				if (!e.target.closest('.layer-btn')) {
					SelectionManager.selectOverlay(index);
				}
			});

			layersContainer.appendChild(item);
		});

		if (window.lucide) lucide.createIcons();
	}

	function moveLayerUp(index) {
		if (index === 0) return;

		const overlays = AppState.getOverlays();
		// Swap overlays in place
		[overlays[index], overlays[index - 1]] = [
			overlays[index - 1],
			overlays[index],
		];

		// Update selected index if needed
		const selectedIndex = AppState.getSelectedIndex();
		if (selectedIndex === index) {
			AppState.setSelectedIndex(index - 1);
		} else if (selectedIndex === index - 1) {
			AppState.setSelectedIndex(index);
		}

		updateLayersList();
		if (window.PreviewController) {
			window.PreviewController.updateGizmosForPage(window.currentPreviewPage || 1);
		}
	}

	function moveLayerDown(index) {
		const overlays = AppState.getOverlays();
		if (index >= overlays.length - 1) return;

		// Swap overlays in place
		[overlays[index], overlays[index + 1]] = [
			overlays[index + 1],
			overlays[index],
		];

		// Update selected index if needed
		const selectedIndex = AppState.getSelectedIndex();
		if (selectedIndex === index) {
			AppState.setSelectedIndex(index + 1);
		} else if (selectedIndex === index + 1) {
			AppState.setSelectedIndex(index);
		}

		updateLayersList();
		if (window.PreviewController) {
			window.PreviewController.updateGizmosForPage(window.currentPreviewPage || 1);
		}
	}

	return { updateLayersList, moveLayerUp, moveLayerDown };
})();

const SelectionManager = (() => {
	function selectOverlay(index) {
		AppState.setSelectedIndex(index);
		LayerManager.updateLayersList();

		// Remove selected class from all gizmos
		document
			.querySelectorAll('.overlay-gizmo')
			.forEach((g) => g.classList.remove('selected'));

		// Add selected class to the selected gizmo
		const selectedGizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${index}"]`,
		);
		if (selectedGizmo) {
			selectedGizmo.classList.add('selected');
		}

		const overlay = AppState.getOverlay(index);
		if (overlay) {
			UIControls.showLayerEditor(overlay, index);
		}
	}

	function deselectOverlay() {
		AppState.setSelectedIndex(null);
		LayerManager.updateLayersList();
		document.getElementById('selectedLayerEditor').style.display = 'none';

		// Remove selected class from all gizmos
		document
			.querySelectorAll('.overlay-gizmo')
			.forEach((g) => g.classList.remove('selected'));
	}

	return { selectOverlay, deselectOverlay };
})();

// Export to global scope
window.UIControls = UIControls;
window.LayerManager = LayerManager;
window.SelectionManager = SelectionManager;

// Export togglePagesPanel as global function for onclick handler
window.togglePagesPanel = UIControls.togglePagesPanel;
