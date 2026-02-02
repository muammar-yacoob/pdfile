import type { ToolConfig } from '../cli/tools.js';
import { createServer } from 'node:http';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { signalLoadingComplete } from '../lib/edge-launcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** PDFile unified tool config */
export const config: ToolConfig = {
	id: 'pdfile',
	name: 'PDFile',
	icon: 'pdfile.ico',
	extensions: ['.pdf'],
};

/**
 * Open PDFile GUI with all PDF tools
 */
export async function runGUI(file: string): Promise<boolean> {
	return new Promise((resolve) => {
		const app = express();
		app.use(express.json());

		// Disable caching
		app.use((_req, res, next) => {
			res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
			res.set('Pragma', 'no-cache');
			res.set('Expires', '0');
			next();
		});

		// Serve static files
		const guiDir = join(__dirname, 'gui');
		const iconsDir = join(__dirname, 'icons');
		app.use(express.static(guiDir));
		app.use('/icons', express.static(iconsDir));

		// Serve favicon
		app.get('/favicon.ico', (_req, res) => {
			res.sendFile(join(iconsDir, 'pdfile.ico'));
		});

		// Serve main PDFile interface
		app.get('/', (_req, res) => {
			res.sendFile(join(guiDir, 'pdfile.html'));
		});

		// API endpoint to get file info
		app.get('/api/file', (_req, res) => {
			res.json({
				fileName: basename(file),
				filePath: file,
			});
		});

		// Start server on random port
		const server = createServer(app);
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (!addr || typeof addr === 'string') {
				console.error('Failed to start server');
				resolve(false);
				return;
			}

			const url = `http://127.0.0.1:${addr.port}?file=${encodeURIComponent(basename(file))}`;

			// Signal HTA to close and open Edge
			signalLoadingComplete(url);

			// Keep server running until window is closed
			// Server will be cleaned up when process exits
		});

		// Handle server errors
		server.on('error', (err) => {
			console.error('Server error:', err);
			resolve(false);
		});
	});
}
