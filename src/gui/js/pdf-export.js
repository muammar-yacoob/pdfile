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

            // Debug logging
            console.log('Export PDF - Page Order:', pageOrder);
            console.log('Export PDF - hasReordering:', hasReordering);

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

            // Send request with page order and overlays
            const response = await fetch('/api/export-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hasMergedPages,
                    hasReordering,
                    pageOrder,
                    overlays: pendingOverlays,
                    mergedPagesData: serializableMergedPages // No circular refs!
                })
            });

            if (!response.ok) {
                const error = await response.json();
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

            // Clear overlays
            AppState.clearOverlays();

            // Remove gizmos
            document.querySelectorAll('.overlay-gizmo').forEach(g => g.remove());

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
