// Gizmo Manager - Handles overlay gizmo creation, manipulation, and deletion

const GizmoManager = {
	/**
	 * Add a visual gizmo to the preview area
	 * @param {string} type - Type of overlay (text, image, signature, date)
	 * @param {string} label - Display label
	 * @param {number} x - X position in pixels
	 * @param {number} y - Y position in pixels
	 * @param {number} overlayIndex - Index in overlays array
	 */
	addOverlayGizmo(type, label, x, y, overlayIndex) {
		const canvasWrapper = document.querySelector('.canvas-wrapper');
		if (!canvasWrapper) return; // Canvas not loaded yet

		const overlay = window.AppState.getOverlay(overlayIndex);

		// Create gizmo element
		const gizmo = document.createElement('div');
		gizmo.className = 'overlay-gizmo';

		// Add selected class if this is the currently selected overlay
		if (window.AppState.getSelectedIndex() === overlayIndex) {
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
			const highlightColor = overlay.highlightColor || null;

			// Calculate font size to fit the gizmo
			const availableWidth = (overlay.width || 120) - 20;
			const availableHeight = (overlay.height || 60) - 20;

			const textLength = label.length;
			const estimatedFontSize = Math.min(
				Math.floor(availableHeight * 0.6),
				Math.floor(availableWidth / (textLength * 0.5)),
				overlay.fontSize || 48,
			);
			const fontSize = Math.max(8, Math.min(estimatedFontSize, 48));

			// Apply highlight if set (inline style for text background)
			const textStyle = highlightColor
				? `color: ${textColor}; background: linear-gradient(${highlightColor}, ${highlightColor}); font-size: ${fontSize}px; padding: 2px 4px; display: inline;`
				: `color: ${textColor}; font-size: ${fontSize}px;`;

			const containerStyle = `background-color: ${bgColor}; padding: 4px; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;`;

			content = `<div class="overlay-gizmo-text" style="${containerStyle}"><span style="${textStyle}">${label}</span></div>`;
		}

		// Add background removal indicator badge if applicable
		const bgRemovalBadge =
			overlay && overlay.removeBackground
				? `<div class="bg-removal-badge" title="Background removal enabled">BG-</div>`
				: '';

		// Create resize handles
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
            <button class="overlay-gizmo-delete" onclick="GizmoManager.removeOverlay(${overlayIndex})" title="Delete">✕</button>
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

			// If no special action, select this overlay
			if (!targetAction) {
				window.SelectionManager.selectOverlay(overlayIndex);
			}

			if (targetAction === 'resize') {
				action = 'resize';
				resizeHandle = e.target.dataset.handle;
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
				const currentRotation =
					window.AppState.getOverlay(overlayIndex)?.rotation || 0;
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

				const newLeft = initialLeft + deltaX;
				const newTop = initialTop + deltaY;

				gizmo.style.left = newLeft + 'px';
				gizmo.style.top = newTop + 'px';

				// Store canvas dimensions for scaling
				const canvas = document.getElementById('pdfCanvas');
				const canvasWidth = canvas ? canvas.width : 1;
				const canvasHeight = canvas ? canvas.height : 1;

				window.AppState.updateOverlay(index, {
					x: newLeft,
					y: newTop,
					canvasWidth,
					canvasHeight,
				});
			} else if (action === 'resize') {
				const deltaX = e.clientX - startX;
				const deltaY = e.clientY - startY;

				let newWidth = initialWidth;
				let newHeight = initialHeight;
				let newLeft = initialLeft;
				let newTop = initialTop;

				const isCorner = ['sw', 'se'].includes(resizeHandle);

				if (isCorner) {
					// Corner handles: maintain aspect ratio
					let scale;
					if (resizeHandle === 'se') {
						scale = Math.max(
							(initialWidth + deltaX) / initialWidth,
							(initialHeight + deltaY) / initialHeight,
						);
					} else if (resizeHandle === 'sw') {
						scale = Math.max(
							(initialWidth - deltaX) / initialWidth,
							(initialHeight + deltaY) / initialHeight,
						);
						newLeft = initialLeft + (initialWidth - initialWidth * scale);
					}

					newWidth = Math.max(30, initialWidth * scale);
					newHeight = Math.max(20, initialHeight * scale);
				} else {
					// Side handles: free resize
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

				const currentOverlay = window.AppState.getOverlay(index);
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

						// Update visual text size in gizmo (text is in the span element)
						const textElement = gizmo.querySelector('.overlay-gizmo-text span');
						if (textElement) {
							textElement.style.fontSize = newFontSize + 'px';
						}

						if (!currentOverlay.baseFontSize) {
							updates.baseFontSize = 12;
						}
					}

					window.AppState.updateOverlay(index, updates);
				}
			} else if (action === 'rotate') {
				const currentAngle =
					Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
				const rotation = currentAngle - initialAngle;

				gizmo.style.transform = `rotate(${rotation}deg)`;

				window.AppState.updateOverlay(index, { rotation });
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
		if (window.lucide) {
			window.lucide.createIcons();
		}
	},

	/**
	 * Remove an overlay with confirmation
	 * @param {number} index - Index of overlay to remove
	 */
	removeOverlay(index) {
		const overlay = window.AppState.getOverlay(index);
		if (!overlay) return;

		// Get overlay type label
		let typeLabel = overlay.type;
		if (overlay.type === 'date' && overlay.dateText) {
			typeLabel = overlay.dateFormat ? 'date' : 'text';
		} else if (overlay.type === 'signature') {
			typeLabel = 'signature';
		} else if (overlay.type === 'image') {
			typeLabel = 'image';
		}

		window.showConfirmModal(
			'Remove?',
			`Remove this ${typeLabel}?`,
			() => {
				window.AppState.removeOverlay(index);

				// Deselect if this was selected
				const selectedIndex = window.AppState.getSelectedIndex();
				if (selectedIndex === index) {
					window.SelectionManager.deselectOverlay();
				} else if (selectedIndex > index) {
					window.AppState.setSelectedIndex(selectedIndex - 1);
				}

				// Remove all gizmos and recreate them with updated indices for current page
				if (window.PreviewController && window.currentPreviewPage) {
					window.PreviewController.updateGizmosForPage(window.currentPreviewPage);
				}
				if (window.LayerManager) {
					window.LayerManager.updateLayersList();
				}
			},
		);
	},
};

// Export to window
window.GizmoManager = GizmoManager;

// Backward compatibility
window.addOverlayGizmo = (type, label, x, y, overlayIndex) =>
	GizmoManager.addOverlayGizmo(type, label, x, y, overlayIndex);
window.removeOverlay = (index) => GizmoManager.removeOverlay(index);
