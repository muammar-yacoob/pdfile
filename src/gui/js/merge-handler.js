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
		console.log('[Merge] mergeFiles called, position:', position, 'fileName:', fileName);

		if (!window.currentPdfFile) {
			console.error('[Merge] No current PDF file loaded');
			window.showModal('Error', 'Please load a PDF file first');
			return;
		}

		// Use the pending merge file
		const file = window.pendingMergeFile;
		if (!file) {
			console.error('[Merge] No pending merge file found');
			return;
		}
		console.log('[Merge] Pending merge file:', file.name, 'size:', file.size, 'type:', file.type);

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

			console.log('[Merge] Starting PDF merge, position:', position, 'file:', file.name);

			// Check if PDF.js is loaded
			if (!window.pdfjsLib) {
				throw new Error('PDF.js library not loaded. Please refresh the page and try again.');
			}

			window.showProcessing('Merging PDF pages...');

			// Read the PDF file as base64
			const reader = new FileReader();
			reader.onload = async (e) => {
				const pdfData = e.target.result;

				try {
					// Call backend to merge PDFs
					const response = await fetch('/api/merge-pdfs', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							pdfData: pdfData,
							position: position,
							isImage: false,
						}),
					});

					if (!response.ok) {
						throw new Error('Failed to merge PDF');
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
						const mergedPdfData = e2.target.result;
						try {
							await fetch('/api/update-working-file', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ pdfData: mergedPdfData }),
							});
						} catch (err) {
							console.warn('Failed to update working file on server:', err);
						}

						// Load the merged PDF
						await window.loadPDFFile(mergedFile);

						// Clear merged pages data since PDF is now merged
						window.mergedPagesData = [];

						window.hideProcessing();
						console.log('[Merge] PDF merge completed successfully');
					};
					reader2.readAsDataURL(blob);
				} catch (error) {
					console.error('Merge error:', error);
					window.hideProcessing();
					window.showModal('Error', `Failed to merge PDF: ${error.message}`);
				}
			};
			reader.readAsDataURL(file);
			return;

		} catch (err) {
			window.hideProcessing();
			console.error('Merge failed:', err);
			console.error('Stack trace:', err.stack);
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
