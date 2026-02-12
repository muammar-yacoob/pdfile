// Folder Opener - Opens folders in Windows Explorer

/**
 * Open a folder in Windows Explorer
 * @param {string} folderPath - Path to the folder
 */
window.openFolder = function (folderPath) {
	// Convert WSL path to Windows path if needed
	let windowsPath = folderPath;
	if (folderPath.startsWith('/mnt/')) {
		// Convert /mnt/c/... to C:\...
		const drive = folderPath[5].toUpperCase();
		windowsPath = `${drive}:${folderPath.substring(6).replace(/\//g, '\\')}`;
	}

	console.log(`Opening folder: ${windowsPath}`);

	// Use API to open the folder
	fetch('/api/open-folder', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ folderPath: windowsPath }),
	})
		.then((response) => {
			if (!response.ok) {
				return response.json().then((data) => {
					throw new Error(data.details || data.error || 'Unknown error');
				});
			}
			return response.json();
		})
		.then(() => {
			console.log('Folder opened successfully');
		})
		.catch((err) => {
			console.error('Failed to open folder:', err);
			alert(`Could not open folder.\nPath: ${windowsPath}\nError: ${err.message}`);
		});
};
