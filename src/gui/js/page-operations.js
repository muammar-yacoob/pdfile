// Page Operations - Handles page selection, moving, rotating, and reordering

const PageOperations = {
	draggedElement: null,

	selectPage(pageNum, isSelected) {
		if (isSelected) {
			window.selectedPages.add(pageNum);
			window.lastSelectedPage = pageNum;
			// Show the selected page in preview (always show the last selected one)
			window.PreviewController?.renderPage(pageNum);
		} else {
			window.selectedPages.delete(pageNum);
			window.lastSelectedPage =
				window.selectedPages.size > 0
					? Array.from(window.selectedPages)[0]
					: null;
		}

		// If we have a selection, preview the last selected page
		if (window.selectedPages.size > 0 && window.lastSelectedPage) {
			window.PreviewController?.renderPage(window.lastSelectedPage);
		}

		this.updateSelectionUI();
	},

	updateSelectionUI() {
		const items = document.querySelectorAll('.thumbnail-item');
		items.forEach((item) => {
			const num = Number.parseInt(item.dataset.pageNum);
			const isItemSelected = window.selectedPages.has(num);
			item.classList.toggle('selected', isItemSelected);

			// Add or remove checkmark
			let checkmark = item.querySelector('.thumbnail-checkmark');
			if (isItemSelected && !checkmark) {
				checkmark = document.createElement('div');
				checkmark.className = 'thumbnail-checkmark';
				checkmark.innerHTML =
					'<i data-lucide="check" style="width: 18px; height: 18px;"></i>';
				item.appendChild(checkmark);
				lucide.createIcons();
			} else if (!isItemSelected && checkmark) {
				checkmark.remove();
			}
		});

		// Update button states
		const hasSelection = window.selectedPages.size > 0;
		document.getElementById('deleteSelectedBtn').disabled = !hasSelection;
		document.getElementById('rotateLeftBtn').disabled = !hasSelection;
		document.getElementById('rotateRightBtn').disabled = !hasSelection;

		// Smart disable for arrows based on position
		if (hasSelection) {
			const selectedArray = Array.from(window.selectedPages);
			const minPage = Math.min(...selectedArray);
			const maxPage = Math.max(...selectedArray);
			const totalPages = document.querySelectorAll('.thumbnail-item').length;

			document.getElementById('moveUpBtn').disabled = minPage === 1;
			document.getElementById('moveDownBtn').disabled = maxPage === totalPages;
		} else {
			document.getElementById('moveUpBtn').disabled = true;
			document.getElementById('moveDownBtn').disabled = true;
		}
	},

	moveUp() {
		if (window.selectedPages.size === 0) return;

		const items = Array.from(document.querySelectorAll('.thumbnail-item'));
		const selectedArray = Array.from(window.selectedPages).sort((a, b) => a - b);

		// Can't move up if first page is selected
		if (selectedArray[0] === 1) return;

		// Move each selected page up by swapping with the page above
		for (const pageNum of selectedArray) {
			const currentIndex = pageNum - 1;
			const targetIndex = currentIndex - 1;

			if (targetIndex >= 0 && !window.selectedPages.has(targetIndex + 1)) {
				// Swap in DOM
				const currentItem = items[currentIndex];
				const targetItem = items[targetIndex];
				targetItem.parentNode.insertBefore(currentItem, targetItem);

				// Update items array
				[items[currentIndex], items[targetIndex]] = [
					items[targetIndex],
					items[currentIndex],
				];
			}
		}

		this.updatePageNumbers();
		lucide.createIcons();
	},

	moveDown() {
		if (window.selectedPages.size === 0) return;

		const items = Array.from(document.querySelectorAll('.thumbnail-item'));
		const selectedArray = Array.from(window.selectedPages).sort(
			(a, b) => b - a,
		); // Reverse order

		// Can't move down if last page is selected
		if (selectedArray[0] === items.length) return;

		// Move each selected page down by swapping with the page below
		for (const pageNum of selectedArray) {
			const currentIndex = pageNum - 1;
			const targetIndex = currentIndex + 1;

			if (targetIndex < items.length && !window.selectedPages.has(targetIndex + 1)) {
				// Swap in DOM
				const currentItem = items[currentIndex];
				const targetItem = items[targetIndex];
				targetItem.parentNode.insertBefore(targetItem, currentItem);

				// Update items array
				[items[currentIndex], items[targetIndex]] = [
					items[targetIndex],
					items[currentIndex],
				];
			}
		}

		this.updatePageNumbers();
		lucide.createIcons();
	},

	async rotate(rotation) {
		if (!window.currentPdfFile) {
			showModal('No PDF Loaded', 'Please load a PDF first');
			return;
		}

		if (window.selectedPages.size === 0) {
			showModal('No Pages Selected', 'Please select pages to rotate');
			return;
		}

		const pagesToRotate = Array.from(window.selectedPages);
		const pageCount = pagesToRotate.length;

		try {
			showModal('Processing', 'Rotating pages...');

			const response = await fetch('/api/rotate-pages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					pages: pagesToRotate,
					rotation: rotation,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Rotation failed');
			}

			// Get rotated PDF as blob
			const blob = await response.blob();
			const rotatedFile = new File(
				[blob],
				`${window.currentPdfFile.replace('.pdf', '')}_rotated.pdf`,
				{ type: 'application/pdf' },
			);

			// Convert blob to base64 and update server's working file
			const reader = new FileReader();
			reader.onload = async (e) => {
				const pdfData = e.target.result;
				try {
					await fetch('/api/update-working-file', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ pdfData }),
					});
				} catch (err) {
					console.warn('Failed to update working file on server:', err);
				}

				// Reload the rotated PDF
				await window.PDFLoader?.loadFile(rotatedFile);

				// Re-select the rotated pages
				pagesToRotate.forEach((pageNum) => {
					window.selectedPages.add(pageNum);
				});
				this.updateSelectionUI();

				closeModal();
			};
			reader.readAsDataURL(blob);
		} catch (error) {
			closeModal();
			showModal('Error', error.message || 'Failed to rotate pages');
		}
	},

	updatePageNumbers() {
		const items = document.querySelectorAll('.thumbnail-item');
		const oldToNew = new Map();

		items.forEach((item, index) => {
			const oldPageNum = Number.parseInt(item.dataset.pageNum);
			// Preserve original page number on first reorder
			if (!item.dataset.originalPage) {
				item.dataset.originalPage = oldPageNum;
			}
			const newPageNum = index + 1;
			item.querySelector('.thumbnail-number').textContent = newPageNum;
			item.dataset.pageNum = newPageNum;
			oldToNew.set(oldPageNum, newPageNum);
		});

		// Update selectedPages set with new page numbers
		const newSelectedPages = new Set();
		window.selectedPages.forEach((oldNum) => {
			if (oldToNew.has(oldNum)) {
				newSelectedPages.add(oldToNew.get(oldNum));
			}
		});
		window.selectedPages = newSelectedPages;

		// Update lastSelectedPage with new page number
		if (window.lastSelectedPage && oldToNew.has(window.lastSelectedPage)) {
			window.lastSelectedPage = oldToNew.get(window.lastSelectedPage);
		}

		// Refresh visual selection with checkmarks
		const items2 = document.querySelectorAll('.thumbnail-item');
		items2.forEach((item) => {
			const num = Number.parseInt(item.dataset.pageNum);
			const isSelected = window.selectedPages.has(num);
			item.classList.toggle('selected', isSelected);

			let checkmark = item.querySelector('.thumbnail-checkmark');
			if (isSelected && !checkmark) {
				checkmark = document.createElement('div');
				checkmark.className = 'thumbnail-checkmark';
				checkmark.innerHTML =
					'<i data-lucide="check" style="width: 18px; height: 18px;"></i>';
				item.appendChild(checkmark);
			} else if (!isSelected && checkmark) {
				checkmark.remove();
			}
		});

		// Update button states
		const hasSelection = window.selectedPages.size > 0;
		document.getElementById('deleteSelectedBtn').disabled = !hasSelection;

		// Smart disable for arrows based on position
		if (hasSelection) {
			const selectedArray = Array.from(window.selectedPages);
			const minPage = Math.min(...selectedArray);
			const maxPage = Math.max(...selectedArray);
			const totalPages = items.length;

			document.getElementById('moveUpBtn').disabled = minPage === 1;
			document.getElementById('moveDownBtn').disabled = maxPage === totalPages;
		}

		// Update overlay page indices based on new page order
		window.pendingOverlays.forEach((overlay) => {
			if (oldToNew.has((overlay.pageIndex || 0) + 1)) {
				overlay.pageIndex = oldToNew.get((overlay.pageIndex || 0) + 1) - 1;
			}
		});

		lucide.createIcons();
	},

	async applyReorder() {
		if (!window.currentPdfFile) {
			showModal('No PDF Loaded', 'Please load a PDF first');
			return;
		}

		// Get current page order from thumbnails
		const items = document.querySelectorAll('.thumbnail-item');
		const pageOrder = Array.from(items).map((item) =>
			Number.parseInt(item.dataset.pageNum),
		);

		showConfirmModal(
			'Apply Reorder',
			'Apply the new page order? This will download a reordered PDF file.',
			async () => {
				try {
					showModal('Processing', 'Reordering pages...');

					const response = await fetch('/api/reorder-pages', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ order: pageOrder }),
					});

					if (!response.ok) throw new Error('Reorder failed');

					const blob = await response.blob();
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `${window.currentPdfFile.replace('.pdf', '')}_reordered.pdf`;
					a.click();
					URL.revokeObjectURL(url);

					closeModal();
					showModal('Success', 'Pages reordered successfully!', 2000);
				} catch (err) {
					closeModal();
					showModal('Error', `Failed to reorder pages: ${err.message}`);
				}
			},
		);
	},

	// Drag and drop handlers
	handleDragStart(e) {
		PageOperations.draggedElement = e.target.closest('.thumbnail-item');
		e.dataTransfer.effectAllowed = 'move';
		e.target.style.opacity = '0.4';
	},

	handleDragOver(e) {
		if (e.preventDefault) e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		return false;
	},

	handleDrop(e) {
		if (e.stopPropagation) e.stopPropagation();

		const target = e.target.closest('.thumbnail-item');
		if (
			target &&
			PageOperations.draggedElement &&
			target !== PageOperations.draggedElement
		) {
			const draggedIndex =
				Number.parseInt(PageOperations.draggedElement.dataset.pageNum) - 1;
			const targetIndex = Number.parseInt(target.dataset.pageNum) - 1;

			// Swap in DOM
			const parent = target.parentNode;
			const allItems = Array.from(parent.children);
			if (draggedIndex < targetIndex) {
				parent.insertBefore(PageOperations.draggedElement, target.nextSibling);
			} else {
				parent.insertBefore(PageOperations.draggedElement, target);
			}

			PageOperations.updatePageNumbers();
		}

		return false;
	},

	handleDragEnd(e) {
		e.target.style.opacity = '';
		PageOperations.draggedElement = null;
	},
};

// Expose to window
window.PageOperations = PageOperations;

// Expose individual functions for backwards compatibility
window.moveSelectedPagesUp = () => PageOperations.moveUp();
window.moveSelectedPagesDown = () => PageOperations.moveDown();
window.rotateSelectedPages = (rotation) => PageOperations.rotate(rotation);
window.applyReorder = () => PageOperations.applyReorder();
window.handlePageSelection = (pageNum, isSelected) =>
	PageOperations.selectPage(pageNum, isSelected);
