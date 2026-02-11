// Gizmo Manager - Handles overlay gizmos (draggable, resizable, rotatable elements)
const GizmoManager = {
	/**
	 * Create and add an overlay gizmo to the preview
	 * @param {string} type - Type of overlay (text, image, signature, date)
	 * @param {string} label - Display label for the gizmo
	 * @param {number} x - X position in canvas pixels
	 * @param {number} y - Y position in canvas pixels
	 * @param {number} overlayIndex - Index in the overlays array
	 */
	createGizmo(type, label, x, y, overlayIndex) {
		const canvasWrapper = document.querySelector('.canvas-wrapper');
		if (!canvasWrapper) {
			console.error('Canvas wrapper not found');
			return;
		}

		// Remove existing gizmo for this overlay index if any
		const existingGizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${overlayIndex}"]`,
		);
		if (existingGizmo) {
			existingGizmo.remove();
		}

		// Create gizmo element
		const gizmo = document.createElement('div');
		gizmo.className = 'overlay-gizmo';
		gizmo.dataset.overlayIndex = overlayIndex;
		gizmo.dataset.type = type;
		gizmo.style.left = `${x}px`;
		gizmo.style.top = `${y}px`;

		// Default size based on type
		let width = 150;
		let height = 50;

		if (type === 'image' || type === 'signature') {
			width = 150;
			height = 150;
		} else if (type === 'rectangle') {
			width = 200;
			height = 150;
		}

		gizmo.style.width = `${width}px`;
		gizmo.style.height = `${height}px`;

		// Inner content
		const isText = type === 'text' || type === 'date';
		const isRectangle = type === 'rectangle';

		if (isText) {
			gizmo.innerHTML = `
				<div class="overlay-gizmo-text">${label}</div>
				<div class="overlay-gizmo-delete" title="Delete (Del)">×</div>
				<div class="overlay-gizmo-resize" data-action="resize" data-handle="se" title="Resize">
					<i data-lucide="maximize-2" style="width: 10px; height: 10px;"></i>
				</div>
				<div class="overlay-gizmo-rotate" data-action="rotate" title="Rotate">
					<i data-lucide="refresh-cw" style="width: 10px; height: 10px;"></i>
				</div>
			`;
		} else if (isRectangle) {
			gizmo.innerHTML = `
				<div class="overlay-gizmo-rectangle" style="width: 100%; height: 100%; background: rgba(0,0,0,0.1); border: 2px solid rgba(0,0,0,0.3);"></div>
				<div class="overlay-gizmo-delete" title="Delete (Del)">×</div>
				<div class="overlay-gizmo-resize" data-action="resize" data-handle="se" title="Resize">
					<i data-lucide="maximize-2" style="width: 10px; height: 10px;"></i>
				</div>
				<div class="overlay-gizmo-rotate" data-action="rotate" title="Rotate">
					<i data-lucide="refresh-cw" style="width: 10px; height: 10px;"></i>
				</div>
			`;
		} else {
			gizmo.innerHTML = `
				<div class="overlay-gizmo-image-preview"></div>
				<div class="overlay-gizmo-delete" title="Delete (Del)">×</div>
				<div class="overlay-gizmo-resize" data-action="resize" data-handle="se" title="Resize">
					<i data-lucide="maximize-2" style="width: 10px; height: 10px;"></i>
				</div>
				<div class="overlay-gizmo-rotate" data-action="rotate" title="Rotate">
					<i data-lucide="refresh-cw" style="width: 10px; height: 10px;"></i>
				</div>
			`;
		}

		canvasWrapper.appendChild(gizmo);

		// Initialize Lucide icons for the new gizmo
		if (window.lucide) {
			window.lucide.createIcons();
		}

		// Set up interaction handlers
		this.setupGizmoInteraction(gizmo, overlayIndex);

		return gizmo;
	},

	/**
	 * Set up drag, resize, and rotate interactions for a gizmo
	 */
	setupGizmoInteraction(gizmo, overlayIndex) {
		let action = null;
		let resizeHandle = null;
		let offsetX, offsetY; // Mouse offset from gizmo top-left
		let initialWidth, initialHeight, initialLeft, initialTop;
		let centerX, centerY, initialAngle;
		let initialAspectRatio = 1;

		gizmo.addEventListener('mousedown', (e) => {
			// Don't start drag on delete button
			if (e.target.classList.contains('overlay-gizmo-delete')) return;

			const targetAction = e.target.dataset.action;

			// If no special action, select this overlay
			if (!targetAction) {
				window.SelectionManager.selectOverlay(overlayIndex);
			}

			// Get gizmo's current position
			const gizmoRect = gizmo.getBoundingClientRect();

			if (targetAction === 'resize') {
				action = 'resize';
				resizeHandle = e.target.dataset.handle;

				// Store initial state
				initialWidth = gizmo.offsetWidth;
				initialHeight = gizmo.offsetHeight;
				initialLeft = Number.parseInt(gizmo.style.left) || 0;
				initialTop = Number.parseInt(gizmo.style.top) || 0;
				initialAspectRatio = initialWidth / initialHeight;

				// Store mouse start position
				offsetX = e.clientX;
				offsetY = e.clientY;
			} else if (targetAction === 'rotate') {
				action = 'rotate';
				centerX = gizmoRect.left + gizmoRect.width / 2;
				centerY = gizmoRect.top + gizmoRect.height / 2;
				initialAngle =
					Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
				const currentRotation =
					window.AppState.getOverlay(overlayIndex)?.rotation || 0;
				initialAngle = initialAngle - currentRotation;
			} else {
				// Move action - simple and clean
				action = 'move';

				// Calculate offset from gizmo's top-left corner
				offsetX = e.clientX - gizmoRect.left;
				offsetY = e.clientY - gizmoRect.top;

				gizmo.style.cursor = 'grabbing';
			}

			e.preventDefault();
			e.stopPropagation();
		});

		document.addEventListener('mousemove', (e) => {
			if (!action) return;

			const index = Number.parseInt(gizmo.dataset.overlayIndex);
			const canvas = document.getElementById('pdfCanvas');
			const canvasRect = canvas ? canvas.getBoundingClientRect() : null;

			if (!canvasRect) return;

			if (action === 'move') {
				// Simple: position gizmo so mouse is at the same offset point
				const newLeft = e.clientX - canvasRect.left - offsetX;
				const newTop = e.clientY - canvasRect.top - offsetY;

				gizmo.style.left = `${newLeft}px`;
				gizmo.style.top = `${newTop}px`;

				// Store position in overlay data
				// These are canvas pixel coordinates that will be scaled on export
				const canvasWidth = canvas.width;
				const canvasHeight = canvas.height;

				window.AppState.updateOverlay(index, {
					x: newLeft,
					y: newTop,
					canvasWidth,
					canvasHeight,
				});
			} else if (action === 'resize') {
				const deltaX = e.clientX - offsetX;
				const deltaY = e.clientY - offsetY;

				let newWidth = initialWidth;
				let newHeight = initialHeight;
				let newLeft = initialLeft;
				let newTop = initialTop;

				const isCorner = resizeHandle === 'se' || resizeHandle === 'sw';

				if (isCorner) {
					// Corner handles: maintain aspect ratio
					const currentOverlay = window.AppState.getOverlay(index);
					const storedAspectRatio = currentOverlay?.aspectRatio || initialAspectRatio;

					let scale;
					if (resizeHandle === 'se') {
						// Use the dominant axis for scaling
						const scaleX = (initialWidth + deltaX) / initialWidth;
						const scaleY = (initialHeight + deltaY) / initialHeight;
						scale = Math.max(scaleX, scaleY);
					} else if (resizeHandle === 'sw') {
						const scaleX = (initialWidth - deltaX) / initialWidth;
						const scaleY = (initialHeight + deltaY) / initialHeight;
						scale = Math.max(scaleX, scaleY);
					}

					newWidth = Math.max(30, initialWidth * scale);
					newHeight = Math.max(20, newWidth / storedAspectRatio);

					// Adjust left position for SW handle
					if (resizeHandle === 'sw') {
						newLeft = initialLeft + (initialWidth - newWidth);
					}
				}

				// Apply new dimensions and position
				gizmo.style.width = `${newWidth}px`;
				gizmo.style.height = `${newHeight}px`;
				gizmo.style.left = `${newLeft}px`;
				gizmo.style.top = `${newTop}px`;

				const currentOverlay = window.AppState.getOverlay(index);
				const canvasWidth = canvas.width;
				const canvasHeight = canvas.height;

				// For text overlays, scale font size
				if (currentOverlay.type === 'date' || currentOverlay.type === 'text') {
					const scale = newWidth / initialWidth;
					const baseFontSize = currentOverlay.baseFontSize || 12;
					const newFontSize = baseFontSize * scale;

					window.AppState.updateOverlay(index, {
						x: newLeft,
						y: newTop,
						width: newWidth,
						height: newHeight,
						fontSize: newFontSize,
						scale: scale,
						canvasWidth,
						canvasHeight,
					});

					// Update gizmo text size
					const textEl = gizmo.querySelector('.overlay-gizmo-text');
					if (textEl) {
						textEl.style.fontSize = `${Math.min(newFontSize, 24)}px`;
					}
				} else {
					// For images, just update dimensions
					window.AppState.updateOverlay(index, {
						x: newLeft,
						y: newTop,
						width: newWidth,
						height: newHeight,
						canvasWidth,
						canvasHeight,
					});
				}
			} else if (action === 'rotate') {
				const currentAngle =
					Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
				let rotation = currentAngle - initialAngle;

				// Snap to 15 degree increments if shift is held
				if (e.shiftKey) {
					rotation = Math.round(rotation / 15) * 15;
				}

				// Normalize to 0-360
				rotation = ((rotation % 360) + 360) % 360;

				gizmo.style.transform = `rotate(${rotation}deg)`;
				window.AppState.updateOverlay(index, { rotation });
			}
		});

		document.addEventListener('mouseup', () => {
			if (action === 'move') {
				gizmo.style.cursor = 'grab';
			}
			action = null;
		});

		// Delete button handler
		const deleteBtn = gizmo.querySelector('.overlay-gizmo-delete');
		if (deleteBtn) {
			deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.removeOverlay(overlayIndex);
			});
		}
	},

	/**
	 * Update gizmo position and size from overlay data
	 * This is called when zoom changes or page is rendered
	 */
	updateGizmoFromOverlay(overlayIndex) {
		const overlay = window.AppState.getOverlay(overlayIndex);
		if (!overlay) return;

		const gizmo = document.querySelector(
			`.overlay-gizmo[data-overlay-index="${overlayIndex}"]`,
		);
		if (!gizmo) return;

		const canvas = document.getElementById('pdfCanvas');
		if (!canvas) return;

		// Calculate uniform scale factor to maintain aspect ratio
		// Use width scale as the primary scale (canvas maintains aspect ratio)
		const scale = overlay.canvasWidth ? canvas.width / overlay.canvasWidth : 1;

		// Scale position
		const x = overlay.x * scale;
		const y = overlay.y * scale;

		gizmo.style.left = `${x}px`;
		gizmo.style.top = `${y}px`;

		// Scale size uniformly to maintain aspect ratio
		if (overlay.width && overlay.height) {
			gizmo.style.width = `${overlay.width * scale}px`;
			gizmo.style.height = `${overlay.height * scale}px`;
		}

		// Update rotation
		if (overlay.rotation) {
			gizmo.style.transform = `rotate(${overlay.rotation}deg)`;
		}

		// Update text content and styling for text overlays
		if (overlay.type === 'date' || overlay.type === 'text') {
			const textEl = gizmo.querySelector('.overlay-gizmo-text');
			if (textEl) {
				textEl.textContent = overlay.dateText || 'Text';

				if (overlay.textColor) {
					textEl.style.color = overlay.textColor;
				}

				// Apply highlight color as background (text highlight)
				if (overlay.highlightColor) {
					const alpha = overlay.highlightAlpha !== undefined ? overlay.highlightAlpha : 1;
					// Convert hex to rgba
					const r = parseInt(overlay.highlightColor.slice(1, 3), 16);
					const g = parseInt(overlay.highlightColor.slice(3, 5), 16);
					const b = parseInt(overlay.highlightColor.slice(5, 7), 16);
					textEl.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;

					// Add padding for highlight box effect
					textEl.style.padding = '2px 4px';
					textEl.style.display = 'inline-block';
				} else {
					textEl.style.backgroundColor = 'transparent';
					textEl.style.padding = '0';
					textEl.style.display = 'inline-block';
				}

				if (overlay.fontSize) {
					const displayFontSize = Math.min(overlay.fontSize * scale, 24);
					textEl.style.fontSize = `${displayFontSize}px`;
				}
			}
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
			null,
			true,
		);
	},
};

// Export to window
window.GizmoManager = GizmoManager;
