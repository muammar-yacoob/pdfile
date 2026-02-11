// Thumbnail Renderer - Generates and manages PDF page thumbnails

const ThumbnailRenderer = {
	async generate() {
		const thumbnailsList = document.getElementById('thumbnailsList');
		thumbnailsList.innerHTML = '';

		if (!window.pdfDocument) return;

		const numPages = window.pdfDocument.numPages;

		for (let pageNum = 1; pageNum <= numPages; pageNum++) {
			const page = await window.pdfDocument.getPage(pageNum);
			const viewport = page.getViewport({ scale: 0.3 });

			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			canvas.width = viewport.width;
			canvas.height = viewport.height;

			await page.render({ canvasContext: context, viewport }).promise;

			const item = document.createElement('div');
			item.className = 'thumbnail-item';
			item.draggable = true;
			item.dataset.pageNum = pageNum;
			item.innerHTML = `
            <canvas class="thumbnail-canvas"></canvas>
            <div class="thumbnail-number">${pageNum}</div>
        `;

			const thumbnailCanvas = item.querySelector('.thumbnail-canvas');
			const thumbnailContext = thumbnailCanvas.getContext('2d');
			thumbnailCanvas.width = viewport.width;
			thumbnailCanvas.height = viewport.height;
			thumbnailContext.drawImage(canvas, 0, 0);

			// Click to toggle selection
			item.addEventListener('click', (e) => {
				const currentPageNum = Number.parseInt(e.currentTarget.dataset.pageNum);
				const isSelected = window.selectedPages.has(currentPageNum);
				window.PageOperations?.selectPage(currentPageNum, !isSelected);
			});

			// Drag events
			item.addEventListener('dragstart', window.PageOperations?.handleDragStart);
			item.addEventListener('dragover', window.PageOperations?.handleDragOver);
			item.addEventListener('drop', window.PageOperations?.handleDrop);
			item.addEventListener('dragend', window.PageOperations?.handleDragEnd);

			thumbnailsList.appendChild(item);
		}

		lucide.createIcons();
	},

	async generateFromMergedPages(pages) {
		const thumbnailsList = document.getElementById('thumbnailsList');
		thumbnailsList.innerHTML = '';

		for (let i = 0; i < pages.length; i++) {
			const pageInfo = pages[i];

			// Load the source PDF
			let pdfDoc;
			if (pageInfo.source === 'current') {
				pdfDoc = window.pdfDocument;
			} else {
				// Load from merged PDF data
				const response = await fetch(
					`/pdf/${encodeURIComponent(window.currentPdfFile)}`,
				);
				const arrayBuffer = await response.arrayBuffer();
				pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
			}

			const page = await pdfDoc.getPage(pageInfo.pageNum);
			const viewport = page.getViewport({ scale: 0.3 });
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
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

			const thumbnailCanvas = item.querySelector('.thumbnail-canvas');
			const thumbnailContext = thumbnailCanvas.getContext('2d');
			thumbnailCanvas.width = viewport.width;
			thumbnailCanvas.height = viewport.height;
			thumbnailContext.drawImage(canvas, 0, 0);

			// Click to toggle selection
			item.addEventListener('click', (e) => {
				const currentPageNum = Number.parseInt(e.currentTarget.dataset.pageNum);
				const isSelected = window.selectedPages.has(currentPageNum);
				window.PageOperations?.selectPage(currentPageNum, !isSelected);
			});

			// Drag events
			item.addEventListener('dragstart', window.PageOperations?.handleDragStart);
			item.addEventListener('dragover', window.PageOperations?.handleDragOver);
			item.addEventListener('drop', window.PageOperations?.handleDrop);
			item.addEventListener('dragend', window.PageOperations?.handleDragEnd);

			thumbnailsList.appendChild(item);
		}

		lucide.createIcons();
	},
};

// Expose to window
window.ThumbnailRenderer = ThumbnailRenderer;
