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
		} else if (type === 'text' || type === 'date') {
			// Calculate better initial size based on text content
			const overlay = window.AppState.getOverlay(overlayIndex);
			if (overlay && overlay.dateText) {
				const textLength = overlay.dateText.length;
				const fontSize = overlay.fontSize || 12;
				// Estimate width based on character count and font size
				width = Math.max(60, Math.min(300, textLength * fontSize * 0.7));
				height = Math.max(30, fontSize * 1.8);
			}
		}

		gizmo.style.width = `${width}px`;
		gizmo.style.height = `${height}px`;

		// Inner content
		const isText = type === 'text' || type === 'date';
		const isRectangle = type === 'rectangle';

		// Create resize handles HTML
		const resizeHandles = `
			<div class="overlay-gizmo-handle nw" data-action="resize" data-handle="nw"></div>
			<div class="overlay-gizmo-handle ne" data-action="resize" data-handle="ne"></div>
			<div class="overlay-gizmo-handle sw" data-action="resize" data-handle="sw"></div>
			<div class="overlay-gizmo-handle se" data-action="resize" data-handle="se"></div>
			<div class="overlay-gizmo-handle n" data-action="resize" data-handle="n"></div>
			<div class="overlay-gizmo-handle s" data-action="resize" data-handle="s"></div>
			<div class="overlay-gizmo-handle w" data-action="resize" data-handle="w"></div>
			<div class="overlay-gizmo-handle e" data-action="resize" data-handle="e"></div>
		`;

		if (isText) {
			gizmo.innerHTML = `
				<div class="overlay-gizmo-text">${label}</div>
				<div class="overlay-gizmo-delete" title="Delete (Del)">×</div>
				${resizeHandles}
				<div class="overlay-gizmo-rotate" data-action="rotate" title="Rotate">
					<i data-lucide="refresh-cw" style="width: 10px; height: 10px;"></i>
				</div>
				<div class="rotation-guide" style="display: none;"></div>
			`;
		} else if (isRectangle) {
			gizmo.innerHTML = `
				<div class="overlay-gizmo-rectangle" style="width: 100%; height: 100%; background: rgba(0,0,0,0.1); border: 2px solid rgba(0,0,0,0.3);"></div>
				<div class="overlay-gizmo-delete" title="Delete (Del)">×</div>
				${resizeHandles}
				<div class="overlay-gizmo-rotate" data-action="rotate" title="Rotate">
					<i data-lucide="refresh-cw" style="width: 10px; height: 10px;"></i>
				</div>
				<div class="rotation-guide" style="display: none;"></div>
			`;
		} else {
			gizmo.innerHTML = `
				<div class="overlay-gizmo-image-preview"></div>
				<div class="overlay-gizmo-delete" title="Delete (Del)">×</div>
				${resizeHandles}
				<div class="overlay-gizmo-rotate" data-action="rotate" title="Rotate">
					<i data-lucide="refresh-cw" style="width: 10px; height: 10px;"></i>
				</div>
				<div class="rotation-guide" style="display: none;"></div>
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
		let startX, startY;
		let initialWidth, initialHeight, initialLeft, initialTop;
		let centerX, centerY, startAngle, startRotation;
		let initialAspectRatio = 1;
		let rotationGuide = null;

		gizmo.addEventListener('mousedown', (e) => {
			// Don't start drag on delete button
			if (e.target.classList.contains('overlay-gizmo-delete')) return;

			const targetAction = e.target.dataset.action;
			const canvas = document.getElementById('pdfCanvas');
			const canvasRect = canvas.getBoundingClientRect();

			// If no special action, select this overlay (will navigate to page if needed)
			if (!targetAction) {
				window.SelectionManager.selectOverlay(overlayIndex);
				// Return early if on different page to avoid starting drag during navigation
				const overlay = window.AppState.getOverlay(overlayIndex);
				if (overlay) {
					const overlayPageNumber = (overlay.pageIndex || 0) + 1;
					if (window.currentPreviewPage !== overlayPageNumber) {
						return;
					}
				}
			}

			// Get gizmo's current position in canvas coordinates
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

				// Store mouse start position in canvas coordinates
				startX = e.clientX - canvasRect.left;
				startY = e.clientY - canvasRect.top;

			} else if (targetAction === 'rotate') {
				action = 'rotate';

				// Calculate center in screen coordinates
				centerX = gizmoRect.left + gizmoRect.width / 2;
				centerY = gizmoRect.top + gizmoRect.height / 2;

				// Get current rotation
				startRotation = window.AppState.getOverlay(overlayIndex)?.rotation || 0;

				// Calculate initial angle from center to mouse
				startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

				// Show rotation guide
				rotationGuide = gizmo.querySelector('.rotation-guide');
				if (rotationGuide) {
					const radius = Math.max(gizmoRect.width, gizmoRect.height) / 2 + 30;
					rotationGuide.style.width = `${radius * 2}px`;
					rotationGuide.style.height = `${radius * 2}px`;
					rotationGuide.style.left = `${gizmoRect.width / 2 - radius}px`;
					rotationGuide.style.top = `${gizmoRect.height / 2 - radius}px`;
					rotationGuide.style.display = 'block';
				}

			} else {
				// Move action
				action = 'move';

				// Store start position in canvas coordinates
				startX = e.clientX - canvasRect.left;
				startY = e.clientY - canvasRect.top;

				// Store initial gizmo position
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
			const canvas = document.getElementById('pdfCanvas');
			const canvasRect = canvas ? canvas.getBoundingClientRect() : null;

			if (!canvasRect) return;

			// Current mouse position in canvas coordinates
			const currentX = e.clientX - canvasRect.left;
			const currentY = e.clientY - canvasRect.top;

			if (action === 'move') {
				// Calculate delta from start
				const deltaX = currentX - startX;
				const deltaY = currentY - startY;

				// Apply delta to initial position
				const newLeft = initialLeft + deltaX;
				const newTop = initialTop + deltaY;

				gizmo.style.left = `${newLeft}px`;
				gizmo.style.top = `${newTop}px`;

				// Update state
				window.AppState.updateOverlay(index, {
					x: newLeft,
					y: newTop,
					canvasWidth: canvas.width,
					canvasHeight: canvas.height,
				});

			} else if (action === 'resize') {
				const deltaX = currentX - startX;
				const deltaY = currentY - startY;

				let newWidth = initialWidth;
				let newHeight = initialHeight;
				let newLeft = initialLeft;
				let newTop = initialTop;

				const currentOverlay = window.AppState.getOverlay(index);
				const storedAspectRatio = currentOverlay?.aspectRatio || initialAspectRatio;

				// Corner handles - maintain aspect ratio
				if (resizeHandle === 'nw' || resizeHandle === 'ne' || resizeHandle === 'sw' || resizeHandle === 'se') {
					let scale = 1;

					if (resizeHandle === 'se') {
						const scaleX = (initialWidth + deltaX) / initialWidth;
						const scaleY = (initialHeight + deltaY) / initialHeight;
						scale = Math.max(scaleX, scaleY);
					} else if (resizeHandle === 'sw') {
						const scaleX = (initialWidth - deltaX) / initialWidth;
						const scaleY = (initialHeight + deltaY) / initialHeight;
						scale = Math.max(scaleX, scaleY);
						newLeft = initialLeft + (initialWidth - initialWidth * scale);
					} else if (resizeHandle === 'ne') {
						const scaleX = (initialWidth + deltaX) / initialWidth;
						const scaleY = (initialHeight - deltaY) / initialHeight;
						scale = Math.max(scaleX, scaleY);
						newTop = initialTop + (initialHeight - initialHeight * scale);
					} else if (resizeHandle === 'nw') {
						const scaleX = (initialWidth - deltaX) / initialWidth;
						const scaleY = (initialHeight - deltaY) / initialHeight;
						scale = Math.max(scaleX, scaleY);
						newLeft = initialLeft + (initialWidth - initialWidth * scale);
						newTop = initialTop + (initialHeight - initialHeight * scale);
					}

					newWidth = Math.max(30, initialWidth * scale);
					newHeight = Math.max(20, newWidth / storedAspectRatio);

				// Side handles - free resize
				} else {
					if (resizeHandle === 's') {
						newHeight = Math.max(20, initialHeight + deltaY);
					} else if (resizeHandle === 'n') {
						newHeight = Math.max(20, initialHeight - deltaY);
						newTop = initialTop + (initialHeight - newHeight);
					} else if (resizeHandle === 'e') {
						newWidth = Math.max(30, initialWidth + deltaX);
					} else if (resizeHandle === 'w') {
						newWidth = Math.max(30, initialWidth - deltaX);
						newLeft = initialLeft + (initialWidth - newWidth);
					}
				}

				// Apply new dimensions and position
				gizmo.style.width = `${newWidth}px`;
				gizmo.style.height = `${newHeight}px`;
				gizmo.style.left = `${newLeft}px`;
				gizmo.style.top = `${newTop}px`;

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
						canvasWidth: canvas.width,
						canvasHeight: canvas.height,
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
						canvasWidth: canvas.width,
						canvasHeight: canvas.height,
					});
				}

			} else if (action === 'rotate') {
				// Calculate current angle from center to mouse
				const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

				// Calculate rotation change (reduced sensitivity by factor of 0.7)
				let angleDelta = (currentAngle - startAngle) * 0.7;
				let rotation = startRotation + angleDelta;

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
			// Save to history after drag/resize/rotate is complete
			if (action === 'move' || action === 'resize' || action === 'rotate') {
				window.AppState.saveToHistory();
			}

			if (action === 'move') {
				gizmo.style.cursor = 'grab';
			}
			if (action === 'rotate' && rotationGuide) {
				rotationGuide.style.display = 'none';
			}
			action = null;
			resizeHandle = null;
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

				// Apply text styling (bold, italic, underline)
				textEl.style.fontWeight = overlay.bold ? 'bold' : 'normal';
				textEl.style.fontStyle = overlay.italic ? 'italic' : 'normal';
				textEl.style.textDecoration = overlay.underline ? 'underline' : 'none';

				// Apply font family if set
				if (overlay.fontFamily) {
					if (overlay.fontFamily === 'Times') {
						textEl.style.fontFamily = 'Times New Roman, Times, serif';
					} else if (overlay.fontFamily === 'Courier') {
						textEl.style.fontFamily = 'Courier New, Courier, monospace';
					} else if (overlay.fontFamily === 'Helvetica') {
						textEl.style.fontFamily = 'Helvetica, Arial, sans-serif';
					} else {
						textEl.style.fontFamily = overlay.fontFamily;
					}
				}

				// Apply text blur if set
				if (overlay.textBlur && overlay.textBlur > 0) {
					textEl.style.filter = `blur(${overlay.textBlur}px)`;
				} else {
					textEl.style.filter = 'none';
				}

				// Apply letter spacing if set
				if (overlay.letterSpacing !== undefined && overlay.letterSpacing !== 0) {
					textEl.style.letterSpacing = `${overlay.letterSpacing}px`;
				} else {
					textEl.style.letterSpacing = 'normal';
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
