// Merge Handler - Handles PDF and image merging functionality

const MergeHandler = {
	/**
	 * Open file picker for merging PDF or image
	 */
	openMergePDF() {
		if (!window.currentPdfFile) return;

		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.pdf,image/*';
		input.onchange = (e) => {
			const file = e.target.files[0];
			if (file) {
				this.showMergeDialog(file);
			}
		};
		input.click();
	},

	/**
	 * Show merge position dialog
	 * @param {File} file - File to merge
	 */
	showMergeDialog(file) {
		const modal = document.getElementById('modalOverlay');
		const header = document.getElementById('modalHeader');
		const body = document.getElementById('modalBody');
		const footer = document.getElementById('modalFooter');

		// Determine file type
		const fileType = file.type.toLowerCase();
		const fileName = file.name.toLowerCase();
		const isImage =
			fileType.startsWith('image/') ||
			fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);
		const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');

		let fileTypeLabel = 'file';
		if (isImage) fileTypeLabel = 'image';
		else if (isPdf) fileTypeLabel = 'PDF';

		header.textContent = `Merge ${fileTypeLabel.charAt(0).toUpperCase() + fileTypeLabel.slice(1)}`;
		body.innerHTML = `
            <p>How would you like to merge "${file.name}"?</p>
            ${isImage ? '<p style="font-size: 10px; color: var(--txt3); margin-top: 8px;">Image will be added as a full page.</p>' : ''}
        `;
		footer.innerHTML = `
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal(); MergeHandler.mergeFiles('beginning', '${file.name}')">Add to Beginning</button>
            <button class="modal-btn modal-btn-primary" onclick="closeModal(); MergeHandler.mergeFiles('end', '${file.name}')">Add to End</button>
        `;

		// Store file for merge
		window.pendingMergeFile = file;
		modal.classList.add('active');
	},

	/**
	 * Merge PDF or image file
	 * @param {string} position - 'beginning' or 'end'
	 * @param {string} fileName - Name of file being merged
	 */
	async mergeFiles(position, fileName) {
		if (!window.currentPdfFile) {
			window.showModal('Error', 'Please load a PDF file first');
			return;
		}

		// Use the pending merge file
		const file = window.pendingMergeFile;
		if (!file) return;

		try {
			const fileNameLower = file.name.toLowerCase();
			const fileType = file.type.toLowerCase();
			const isPdf =
				fileNameLower.endsWith('.pdf') || fileType === 'application/pdf';
			const isImage =
				fileType.startsWith('image/') ||
				fileNameLower.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);

			if (!isPdf && !isImage) {
				window.showModal('Invalid File', 'Please select a PDF or image file');
				return;
			}

			// If it's an image, convert to PDF via backend first
			if (isImage) {
				window.showProcessing('Converting image to PDF...');

				const reader = new FileReader();
				reader.onload = async (e) => {
					const imageData = e.target.result;

					try {
						const response = await fetch('/api/merge-pdfs', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								pdfData: imageData,
								position: position,
								isImage: true,
							}),
						});

						if (!response.ok) {
							throw new Error('Failed to merge image');
						}

						// Download the merged PDF
						const blob = await response.blob();

						// Create a file object from the blob
						const mergedFile = new File(
							[blob],
							`${window.currentPdfFile.replace('.pdf', '')}_merged.pdf`,
							{ type: 'application/pdf' },
						);

						// Convert blob to base64 and update server's working file
						const reader2 = new FileReader();
						reader2.onload = async (e2) => {
							const pdfData = e2.target.result;
							try {
								await fetch('/api/update-working-file', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ pdfData }),
								});
							} catch (err) {
								console.warn('Failed to update working file on server:', err);
							}

							// Load the merged PDF
							await window.loadPDFFile(mergedFile);

							// Clear merged pages data since PDF is now merged
							window.mergedPagesData = [];

							window.hideProcessing();
						};
						reader2.readAsDataURL(blob);
					} catch (error) {
						console.error('Merge error:', error);
						window.showModal('Error', `Failed to merge image: ${error.message}`);
					}
				};
				reader.readAsDataURL(file);
				return;
			}

			window.showProcessing('Merging PDF pages...');

			// Load the new PDF using PDF.js
			const arrayBuffer = await file.arrayBuffer();
			const newPdfDoc =
				await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
			const newPageCount = newPdfDoc.numPages;

			// Load current PDF if not already loaded
			if (!window.pdfDocument) {
				const response = await fetch(
					`/pdf/${encodeURIComponent(window.currentPdfFile)}`,
				);
				const currentArrayBuffer = await response.arrayBuffer();
				window.pdfDocument =
					await window.pdfjsLib.getDocument({ data: currentArrayBuffer })
						.promise;
			}

			// Get current state
			let currentPages = [];
			if (window.mergedPagesData.length > 0) {
				// Already have merged pages - use them in current order
				const thumbnails = document.querySelectorAll('.thumbnail-item');
				currentPages = Array.from(thumbnails).map((item, idx) => {
					const pageNum = Number.parseInt(item.dataset.pageNum);
					const source = item.dataset.source || 'current';
					const originalPage =
						Number.parseInt(item.dataset.originalPage) || pageNum;

					// Find the page info from mergedPagesData
					const pageInfo =
						window.mergedPagesData.find((p, i) => i + 1 === pageNum) || {
							doc: window.pdfDocument,
							pageNum: originalPage,
							source,
						};
					return pageInfo;
				});
			} else {
				// No merged pages yet - use original document
				for (let i = 1; i <= window.pdfDocument.numPages; i++) {
					currentPages.push({
						doc: window.pdfDocument,
						pageNum: i,
						source: 'original',
					});
				}
			}

			// Create merged pages array
			const mergedPages = [];

			if (position === 'beginning') {
				// Add new pages first, then current pages
				for (let i = 1; i <= newPageCount; i++) {
					mergedPages.push({ doc: newPdfDoc, pageNum: i, source: 'new' });
				}
				mergedPages.push(...currentPages);
			} else {
				// 'end' or default
				// Add current pages first, then new pages
				mergedPages.push(...currentPages);
				for (let i = 1; i <= newPageCount; i++) {
					mergedPages.push({ doc: newPdfDoc, pageNum: i, source: 'new' });
				}
			}

			// Generate thumbnails for all pages
			const thumbnailsList = document.getElementById('thumbnailsList');
			thumbnailsList.innerHTML = '';

			for (let i = 0; i < mergedPages.length; i++) {
				const pageInfo = mergedPages[i];
				const canvas = document.createElement('canvas');
				const context = canvas.getContext('2d');

				// Render PDF page
				const page = await pageInfo.doc.getPage(pageInfo.pageNum);
				const viewport = page.getViewport({ scale: 0.3 });
				canvas.width = viewport.width;
				canvas.height = viewport.height;
				await page.render({ canvasContext: context, viewport }).promise;

				const item = document.createElement('div');
				item.className = 'thumbnail-item';
				item.draggable = true;
				item.dataset.pageNum = i + 1;
				item.dataset.source = pageInfo.source;
				item.dataset.originalPage = pageInfo.pageNum;
				item.innerHTML = `
                    <canvas class="thumbnail-canvas"></canvas>
                    <div class="thumbnail-number">${i + 1}</div>
                `;

				if (pageInfo.source === 'new') {
					item.style.borderColor = '#4CAF50'; // Green border for new pages
				}

				const thumbCanvas = item.querySelector('canvas');
				thumbCanvas.width = canvas.width;
				thumbCanvas.height = canvas.height;
				thumbCanvas.getContext('2d').drawImage(canvas, 0, 0);

				// Click to toggle selection
				item.addEventListener('click', (e) => {
					const currentPageNum = Number.parseInt(e.currentTarget.dataset.pageNum);
					const isSelected = window.selectedPages.has(currentPageNum);
					window.handlePageSelection(currentPageNum, !isSelected);
				});

				// Drag events for reordering
				item.addEventListener('dragstart', window.handleDragStart);
				item.addEventListener('dragover', window.handleDragOver);
				item.addEventListener('drop', window.handleDrop);
				item.addEventListener('dragend', window.handleDragEnd);

				thumbnailsList.appendChild(item);
			}

			// Store merged pages data for export
			window.mergedPagesData = mergedPages;

			// Update page order
			window.pageOrder = Array.from({ length: mergedPages.length }, (_, i) => i + 1);

			// Store merged state
			window.mergedPdfData = { mergedPages, arrayBuffer };

			window.hideProcessing();
		} catch (err) {
			window.hideProcessing();
			window.showModal('Error', `Failed to merge: ${err.message}`);
		}
	},
};

// Export to window
window.MergeHandler = MergeHandler;

// Backward compatibility
window.openMergePDF = () => MergeHandler.openMergePDF();
window.showMergeDialog = (file) => MergeHandler.showMergeDialog(file);
window.mergeFiles = (position, fileName) =>
	MergeHandler.mergeFiles(position, fileName);
