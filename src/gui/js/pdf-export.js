// PDF Export Functionality
const PDFExport = (() => {
    async function exportPDF() {
        // Sync from global state if sync function exists
        if (window.syncBeforeExport) {
            window.syncBeforeExport();
        }

        const currentPdfFile = AppState.getCurrentFile();
        if (!currentPdfFile) return;

        const exportBtn = document.getElementById('exportBtn');
        if (!exportBtn) return;

        const originalHtml = exportBtn.innerHTML;

        try {
            // Show processing indicator
            exportBtn.innerHTML = '<i data-lucide="loader" style="animation: spin 1s linear infinite;"></i>';
            exportBtn.disabled = true;

            // Build the current page order from thumbnails
            const thumbnails = Array.from(document.querySelectorAll('.thumbnail-item'));
            const pageOrder = thumbnails.map((item, idx) => ({
                pageNum: parseInt(item.dataset.originalPage) || parseInt(item.dataset.pageNum),
                source: item.dataset.source || 'original',
                displayOrder: idx + 1
            }));

            // Check if pages have been reordered
            const hasReordering = pageOrder.some((item, idx) => item.pageNum !== idx + 1);

            // Check if we have changes
            const mergedPagesData = AppState.getMergedPagesData();
            const pendingOverlays = AppState.getOverlays();
            const hasMergedPages = mergedPagesData.length > 0;
            const hasOverlays = pendingOverlays.length > 0;

            // If no changes, just download the current PDF
            if (!hasMergedPages && !hasOverlays && !hasReordering) {
                const response = await fetch(`/pdf/${encodeURIComponent(currentPdfFile)}`);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = currentPdfFile;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                exportBtn.innerHTML = originalHtml;
                exportBtn.disabled = false;
                lucide.createIcons();
                return;
            }

            // FIX: Use serializable merged pages (no circular refs!)
            const serializableMergedPages = hasMergedPages
                ? AppState.getSerializableMergedPages()
                : null;

            // Convert overlay coordinates from canvas pixels to PDF points
            const canvas = document.getElementById('pdfCanvas');

            console.log('=== PENDING OVERLAYS (BEFORE CONVERSION) ===');
            pendingOverlays.forEach((o, i) => {
                console.log(`Overlay ${i}: type=${o.type}, w=${o.width}, h=${o.height}, x=${o.x}, y=${o.y}, hasImage=${!!o.imageData}`);
            });

            const convertedOverlays = await Promise.all(pendingOverlays.map(async (overlay, idx) => {
                const pageIndex = overlay.pageIndex || 0;
                const pageNum = pageIndex + 1;

                // Get the original page number if pages were reordered
                const thumbnails = Array.from(document.querySelectorAll('.thumbnail-item'));
                const thumbnail = thumbnails.find(t => parseInt(t.dataset.pageNum) === pageNum);
                const originalPageNum = thumbnail ? parseInt(thumbnail.dataset.originalPage || thumbnail.dataset.pageNum) : pageNum;

                // Get PDF page dimensions (in points)
                const pdfDocument = window.pdfDocument;
                if (!pdfDocument) return overlay;

                const page = await pdfDocument.getPage(originalPageNum);
                const pdfViewport = page.getViewport({ scale: 1 }); // Unscaled = PDF points
                const pdfWidth = pdfViewport.width;
                const pdfHeight = pdfViewport.height;

                // Calculate scale factors
                const scaleX = pdfWidth / canvas.width;
                const scaleY = pdfHeight / canvas.height;

                // CRITICAL FIX: Account for gizmo border and padding
                // Border: 2px all sides (border-box)
                // Gizmo padding: 10px top, 2px right, 2px bottom, 2px left
                // Text padding: 4px all sides (inside the gizmo-text element)
                const isTextOverlay = overlay.type === 'date' || overlay.type === 'text';

                // Calculate offset from gizmo top-left to content start
                let offsetX, offsetY;
                if (isTextOverlay) {
                    // Text: border + gizmo padding + text padding
                    offsetX = 2 + 2 + 4; // = 8px
                    offsetY = 2 + 10 + 4; // = 16px
                } else {
                    // Image: border + gizmo padding only
                    offsetX = 2 + 2; // = 4px
                    offsetY = 2 + 10; // = 12px
                }

                const pdfX = (overlay.x + offsetX) * scaleX;
                const pdfY = (overlay.y + offsetY) * scaleY;

                // Calculate content dimensions (subtract padding/border)
                let convertedWidth, convertedHeight;
                if (isTextOverlay) {
                    // Text: subtract all padding/border (8px left + 8px right = 16px total)
                    const textWidth = overlay.width ? Math.max(10, overlay.width - 16) : 100;
                    const textHeight = overlay.height ? Math.max(10, overlay.height - 24) : 30;
                    convertedWidth = textWidth * scaleX;
                    convertedHeight = textHeight * scaleY;
                } else {
                    // Image: subtract gizmo border+padding only (4px left + 4px right = 8px total for width; 12px top + 4px bottom = 16px total for height)
                    const imgWidth = overlay.width ? Math.max(10, overlay.width - 8) : 100;
                    const imgHeight = overlay.height ? Math.max(10, overlay.height - 16) : 100;
                    convertedWidth = imgWidth * scaleX;
                    convertedHeight = imgHeight * scaleY;
                }

                // Final validation - ensure positive dimensions
                convertedWidth = Math.max(10, convertedWidth || 10);
                convertedHeight = Math.max(10, convertedHeight || 10);

                const converted = {
                    ...overlay,
                    x: pdfX,
                    y: pdfY,
                    width: convertedWidth,
                    height: convertedHeight,
                    fontSize: overlay.fontSize // Keep font size as is
                };

                // Debug log for images that might fail
                if ((overlay.type === 'image' || overlay.type === 'signature') && (convertedWidth <= 10 || convertedHeight <= 10)) {
                    console.warn(`Small ${overlay.type} dimensions: ${convertedWidth}x${convertedHeight} from gizmo ${overlay.width}x${overlay.height}`);
                }

                return converted;
            }));

            console.log('=== CONVERTED OVERLAYS (BEING SENT) ===');
            convertedOverlays.forEach((o, i) => {
                console.log(`Overlay ${i}: type=${o.type}, w=${o.width}, h=${o.height}, x=${o.x}, y=${o.y}, page=${o.pageIndex}, hasImage=${!!o.imageData}`);
            });

            // Send request with page order and converted overlays
            const response = await fetch('/api/export-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hasMergedPages,
                    hasReordering,
                    pageOrder,
                    overlays: convertedOverlays, // Converted to PDF points!
                    mergedPagesData: serializableMergedPages // No circular refs!
                })
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('Export failed with error:', error);
                if (error.stack) {
                    console.error('Server stack trace:', error.stack);
                }
                throw new Error(error.error || 'Failed to export PDF');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const suffix = hasOverlays ? '_abused' : '_modified';
            a.download = `${currentPdfFile.replace('.pdf', '')}${suffix}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            // DON'T clear overlays - user may want to export again or continue editing
            // AppState.clearOverlays();
            // document.querySelectorAll('.overlay-gizmo').forEach(g => g.remove());

            // Restore button
            exportBtn.innerHTML = originalHtml;
            exportBtn.disabled = false;
            lucide.createIcons();

        } catch (err) {
            // Restore button on error
            exportBtn.innerHTML = originalHtml;
            exportBtn.disabled = false;
            lucide.createIcons();

            if (window.showModal) {
                window.showModal('Error', `Failed to export: ${err.message}`);
            }
            console.error('Export error:', err);
        }
    }

    return { exportPDF };
})();

// Export to global scope
window.exportPDF = PDFExport.exportPDF;
