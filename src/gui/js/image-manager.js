// Image Manager - Handles recent images storage and selection

const ImageManager = {
	maxRecent: 10,
	storageKey: 'pdfile_recent_images',

	load() {
		try {
			const stored = localStorage.getItem(this.storageKey);
			if (stored) {
				window.recentImages = JSON.parse(stored);
			}
		} catch (err) {
			console.error('Failed to load recent images:', err);
		}
		this.updateList();
	},

	save() {
		try {
			localStorage.setItem(this.storageKey, JSON.stringify(window.recentImages));
		} catch (err) {
			console.error('Failed to save recent images:', err);
		}
	},

	add(name, data) {
		// Check if image already exists
		const existingIndex = window.recentImages.findIndex((img) => img.name === name);
		if (existingIndex !== -1) {
			// Move to front
			const existing = window.recentImages.splice(existingIndex, 1)[0];
			window.recentImages.unshift(existing);
		} else {
			// Add new image to front
			window.recentImages.unshift({ name, data });
			// Keep only max recent
			if (window.recentImages.length > this.maxRecent) {
				window.recentImages = window.recentImages.slice(0, this.maxRecent);
			}
		}
		this.save();
		this.updateList();
	},

	updateList() {
		const container = document.getElementById('recentImagesList');
		if (!container) return;

		if (window.recentImages.length === 0) {
			container.innerHTML =
				'<div style="text-align: center; padding: 12px; font-size: 10px; color: var(--txt3);">No recent images</div>';
			return;
		}

		container.innerHTML = window.recentImages
			.map(
				(img, i) => `
            <div class="recent-image-item" onclick="insertRecentImage(${i})" title="${img.name}">
                <img src="${img.data}" alt="${img.name}" />
                <span>${img.name.length > 15 ? img.name.substring(0, 12) + '...' : img.name}</span>
            </div>
        `,
			)
			.join('');
	},

	async insertAt(index) {
		if (index < 0 || index >= window.recentImages.length) return;

		const img = window.recentImages[index];

		// Create overlay using UIControls
		if (window.UIControls) {
			try {
				// Convert data URL to file
				const response = await fetch(img.data);
				const blob = await response.blob();
				const file = new File([blob], img.name, { type: blob.type });

				// Use the same logic as browseImage
				await window.UIControls.addImageOverlay(file);
			} catch (err) {
				console.error('Failed to insert recent image:', err);
				showModal('Error', 'Failed to insert image');
			}
		}
	},

	browse() {
		const input = document.getElementById('imageFile');
		if (input) {
			input.click();
		}
	},
};

// Expose to window
window.ImageManager = ImageManager;

// Expose functions for backwards compatibility
window.loadRecentImages = () => ImageManager.load();
window.saveRecentImages = () => ImageManager.save();
window.addToRecentImages = (name, data) => ImageManager.add(name, data);
window.updateRecentImagesList = () => ImageManager.updateList();
window.insertRecentImage = (index) => ImageManager.insertAt(index);
window.browseImage = () => ImageManager.browse();
