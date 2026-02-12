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
		input.multiple = true; // Allow multiple file selection
		input.onchange = (e) => {
			const files = Array.from(e.target.files);
			if (files.length === 0) return;

			if (files.length === 1) {
				this.showMergeDialog(files[0]);
			} else {
				this.showBatchMergeDialog(files);
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
							const updateResponse = await fetch('/api/update-working-file', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ pdfData: mergedPdfData }),
							});

							if (!updateResponse.ok) {
								throw new Error('Failed to update working file on server');
							}

							const updateResult = await updateResponse.json();
							console.log('[Merge] Working file updated on server:', updateResult.filePath);
						} catch (err) {
							console.error('[Merge] Failed to update working file on server:', err);
							window.hideProcessing();
							window.showModal('Error', `Failed to update working file: ${err.message}`);
							return;
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

	/**
	 * Show batch merge dialog for multiple files
	 * @param {File[]} files - Array of files to merge
	 */
	showBatchMergeDialog(files) {
		const modal = document.getElementById('modalOverlay');
		const header = document.getElementById('modalHeader');
		const body = document.getElementById('modalBody');
		const footer = document.getElementById('modalFooter');

		const fileCount = files.length;
		const pdfCount = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')).length;
		const imageCount = fileCount - pdfCount;

		let fileTypeLabel = '';
		if (pdfCount > 0 && imageCount > 0) {
			fileTypeLabel = `${pdfCount} PDF${pdfCount > 1 ? 's' : ''} and ${imageCount} image${imageCount > 1 ? 's' : ''}`;
		} else if (pdfCount > 0) {
			fileTypeLabel = `${pdfCount} PDF${pdfCount > 1 ? 's' : ''}`;
		} else {
			fileTypeLabel = `${imageCount} image${imageCount > 1 ? 's' : ''}`;
		}

		header.textContent = `Merge ${fileCount} Files`;
		body.innerHTML = `
            <p>How would you like to merge ${fileTypeLabel}?</p>
            <p style="font-size: 10px; color: var(--txt3); margin-top: 8px;">Files will be merged in the order they were selected.</p>
            <div style="margin-top: 12px; max-height: 200px; overflow-y: auto; background: var(--bg3); padding: 8px; border-radius: 4px; font-size: 11px;">
                ${files.map((f, i) => `<div style="padding: 2px 0;">${i + 1}. ${f.name}</div>`).join('')}
            </div>
        `;
		footer.innerHTML = `
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal(); MergeHandler.batchMergeFiles('beginning')">Add to Beginning</button>
            <button class="modal-btn modal-btn-primary" onclick="closeModal(); MergeHandler.batchMergeFiles('end')">Add to End</button>
        `;

		// Store files for batch merge
		window.pendingBatchMergeFiles = files;
		modal.classList.add('active');
	},

	/**
	 * Merge multiple files in sequence
	 * @param {string} position - 'beginning' or 'end'
	 */
	async batchMergeFiles(position) {
		const files = window.pendingBatchMergeFiles;
		if (!files || files.length === 0) {
			console.error('[Merge] No pending batch merge files found');
			return;
		}

		console.log(`[Merge] Starting batch merge of ${files.length} files, position: ${position}`);

		try {
			// For 'beginning', we need to reverse the order so the first file ends up at the beginning
			const filesToProcess = position === 'beginning' ? [...files].reverse() : files;

			let successCount = 0;
			let failCount = 0;

			for (let i = 0; i < filesToProcess.length; i++) {
				const file = filesToProcess[i];
				console.log(`[Merge] Processing file ${i + 1}/${filesToProcess.length}: ${file.name}`);

				// Set the pending merge file
				window.pendingMergeFile = file;

				try {
					// Call the existing merge logic
					await this.mergeFiles(position, file.name);
					successCount++;

					// Small delay between merges to allow UI to update
					await new Promise((resolve) => setTimeout(resolve, 500));
				} catch (error) {
					console.error(`[Merge] Failed to merge ${file.name}:`, error);
					failCount++;
				}
			}

			console.log(`[Merge] Batch merge complete: ${successCount} succeeded, ${failCount} failed`);

			if (failCount > 0) {
				window.showModal(
					'Batch Merge Complete',
					`Successfully merged ${successCount} file${successCount !== 1 ? 's' : ''}.<br>${failCount} file${failCount !== 1 ? 's' : ''} failed to merge.`
				);
			}
		} catch (error) {
			console.error('[Merge] Batch merge error:', error);
			window.showModal('Error', `Batch merge failed: ${error.message}`);
		}

		window.pendingBatchMergeFiles = null;
	},
};

// Export to window
window.MergeHandler = MergeHandler;

// Backward compatibility
window.openMergePDF = () => MergeHandler.openMergePDF();
window.showMergeDialog = (file) => MergeHandler.showMergeDialog(file);
window.mergeFiles = (position, fileName) =>
	MergeHandler.mergeFiles(position, fileName);
window.showBatchMergeDialog = (files) => MergeHandler.showBatchMergeDialog(files);
window.batchMergeFiles = (position) => MergeHandler.batchMergeFiles(position);
