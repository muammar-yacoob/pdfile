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

	function showLayerEditor(overlay, index) {
		const editor = document.getElementById('selectedLayerEditor');
		const textControls = document.getElementById('textLayerControls');
		const transparentCheckbox = document.getElementById(
			'layerTransparentCheckbox',
		);
		const transparentBtnText = document.getElementById('transparentBtnText');
		const transparentHelpText = document.getElementById('transparentHelpText');
		const titleEl = document.getElementById('selectedLayerTitle');
		const opacitySlider = document.getElementById('opacitySlider');
		const opacityValue = document.getElementById('opacityValue');

		editor.style.display = 'block';
		document.getElementById('textEditorSection').style.display = 'none';

		const isText = overlay.type === 'date' || overlay.type === 'text';
		titleEl.textContent = isText ? 'Edit Text' : 'Edit Image';
		textControls.style.display = isText ? 'block' : 'none';

		if (isText) {
			transparentBtnText.textContent = 'Background Box';
			transparentHelpText.textContent = 'Show colored background box';
			const hasBg = !overlay.transparentBg && overlay.bgColor;
			transparentCheckbox.checked = hasBg;
		} else {
			transparentBtnText.textContent = 'Remove Background';
			transparentHelpText.textContent = 'Remove image background (uses AI)';
			transparentCheckbox.checked = overlay.removeBackground || false;

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

			if (window.textColorPicker) {
				const textColor = overlay.textColor || '#000000';
				window.textColorPicker.setColor(textColor);
				window.selectedTextColor = textColor;
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

	function updateLayerColor(color, isBackground = false) {
		const index = AppState.getSelectedIndex();
		if (index === null) return;

		const overlay = AppState.getOverlay(index);
		if (overlay.type !== 'date' && overlay.type !== 'text') return;

		if (isBackground) {
			window.selectedBgColor = color;
			if (!overlay.transparentBg) {
				AppState.updateOverlay(index, { bgColor: color });
				const gizmo = document.querySelector(
					`.overlay-gizmo[data-overlay-index="${index}"]`,
				);
				if (gizmo) {
					const textEl = gizmo.querySelector('.overlay-gizmo-text');
					if (textEl) textEl.style.backgroundColor = color;
				}
			}
		} else {
			window.selectedTextColor = color;
			AppState.updateOverlay(index, { textColor: color });
			const gizmo = document.querySelector(
				`.overlay-gizmo[data-overlay-index="${index}"]`,
			);
			if (gizmo) {
				const textEl = gizmo.querySelector('.overlay-gizmo-text');
				if (textEl) textEl.style.color = color;
			}
		}
	}

	return {
		showTextEditor,
		closeTextEditor,
		showLayerEditor,
		toggleLayerTransparency,
		updateLayerOpacity,
		updateLayerText,
		updateLayerColor,
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
                <div class="layer-name">${displayLabel}</div>
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
		if (window.updateGizmosForPage) {
			window.updateGizmosForPage(window.currentPreviewPage || 1);
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
		if (window.updateGizmosForPage) {
			window.updateGizmosForPage(window.currentPreviewPage || 1);
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
