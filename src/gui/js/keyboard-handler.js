// Keyboard Handler - Manages all keyboard shortcuts for overlay manipulation

const KeyboardHandler = (() => {
	let isAltPressed = false;

	/**
	 * Initialize keyboard event listeners
	 */
	function init() {
		document.addEventListener('keydown', handleKeyDown);
		document.addEventListener('keyup', handleKeyUp);
	}

	/**
	 * Handle key down events
	 */
	function handleKeyDown(e) {
		// Track Alt key state
		if (e.key === 'Alt') {
			isAltPressed = true;
			return;
		}

		// Zoom shortcuts (work globally)
		if (e.ctrlKey || e.metaKey) {
			// Ctrl+0 or Ctrl+F: Fit to width
			if (e.key === '0' || e.key.toLowerCase() === 'f') {
				e.preventDefault();
				window.PreviewController?.zoomFit();
				return;
			}
			// Ctrl++ or Ctrl+=: Zoom in
			if (e.key === '+' || e.key === '=') {
				e.preventDefault();
				window.PreviewController?.zoomIn();
				return;
			}
			// Ctrl+-: Zoom out
			if (e.key === '-' || e.key === '_') {
				e.preventDefault();
				window.PreviewController?.zoomOut();
				return;
			}
		}

		// Only handle arrow keys when an overlay is selected
		const selectedIndex = window.AppState?.getSelectedIndex();
		if (selectedIndex === null || selectedIndex === undefined) return;

		// Arrow key movement
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
			e.preventDefault(); // Prevent page scroll

			const overlay = window.AppState.getOverlay(selectedIndex);
			if (!overlay) return;

			// Movement step: 1px with Alt (precise), 10px without (fast)
			const step = isAltPressed ? 1 : 10;

			let newX = overlay.x || 0;
			let newY = overlay.y || 0;

			switch (e.key) {
				case 'ArrowUp':
					newY -= step;
					break;
				case 'ArrowDown':
					newY += step;
					break;
				case 'ArrowLeft':
					newX -= step;
					break;
				case 'ArrowRight':
					newX += step;
					break;
			}

			// Update overlay position
			window.AppState.updateOverlay(selectedIndex, { x: newX, y: newY });

			// Update gizmo visual position
			const gizmo = document.querySelector(
				`.overlay-gizmo[data-overlay-index="${selectedIndex}"]`,
			);
			if (gizmo) {
				gizmo.style.left = `${newX}px`;
				gizmo.style.top = `${newY}px`;
			}
		}

		// Delete key to remove selected overlay
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (
				!e.target.matches('input, textarea') &&
				selectedIndex !== null &&
				selectedIndex !== undefined
			) {
				e.preventDefault();
				if (window.GizmoManager) {
					window.GizmoManager.removeOverlay(selectedIndex);
				}
			}
		}

		// Escape key to deselect overlay
		if (e.key === 'Escape') {
			if (selectedIndex !== null && selectedIndex !== undefined) {
				window.SelectionManager?.deselectOverlay();
			}
		}
	}

	/**
	 * Handle key up events
	 */
	function handleKeyUp(e) {
		if (e.key === 'Alt') {
			isAltPressed = false;
		}
	}

	/**
	 * Get current Alt key state
	 */
	function isAltKeyPressed() {
		return isAltPressed;
	}

	return {
		init,
		isAltKeyPressed,
	};
})();

// Export to window
window.KeyboardHandler = KeyboardHandler;
