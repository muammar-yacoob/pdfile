/**
 * Edge Launcher - Opens Edge in app mode and signals loading HTA
 */

import { execSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Cache Windows temp directory
let cachedTempDir: string | null = null;

/**
 * Get Windows temp directory (works in WSL)
 */
function getWindowsTempDir(): string {
	if (cachedTempDir) return cachedTempDir;

	try {
		// Get Windows TEMP path via cmd.exe
		const winTemp = execSync('cmd.exe /c echo %TEMP%', {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();
		// Convert Windows path to WSL path
		const wslPath = execSync(`wslpath -u "${winTemp}"`, {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();
		cachedTempDir = wslPath;
		return wslPath;
	} catch {
		// Fallback: use Windows username from environment
		const winUser = process.env.USERNAME || 'Default';
		cachedTempDir = `/mnt/c/Users/${winUser}/AppData/Local/Temp`;
		return cachedTempDir;
	}
}

/**
 * Get the path to the ready signal file
 */
function getReadyFilePath(): string {
	return path.join(getWindowsTempDir(), 'pdfile-ready.tmp');
}

/**
 * Clean up any stale signal files from previous sessions
 */
export function cleanupSignalFiles(): void {
	const readyFile = getReadyFilePath();
	try {
		if (fs.existsSync(readyFile)) {
			fs.unlinkSync(readyFile);
		}
	} catch {
		// Ignore errors
	}
}

/**
 * Signal the loading HTA to close and open Edge in app mode
 * Launches Edge first (properly focused), then signals HTA to close
 * @param url - The URL for Edge to open
 */
export function signalLoadingComplete(url: string): void {
	const readyFile = getReadyFilePath();
	try {
		// Launch Edge in app mode via cmd.exe (faster than PowerShell)
		// Calculate centered position (assume 1920x1080 if we can't detect)
		const edgeW = 700;
		const edgeH = 590;
		const screenW = 1920;
		const screenH = 1080;
		const x = Math.round((screenW - edgeW) / 2);
		const y = Math.round((screenH - edgeH) / 2);

		// Use cmd.exe to launch Edge with app mode
		// Disable tracking prevention to allow localStorage and cookies
		spawn('cmd.exe', [
			'/c', 'start', '', 'msedge',
			`--app=${url}`,
			`--window-position=${x},${y}`,
			'--disable-features=msEdgeEnhancedTrackingPrevention',
			'--disable-blink-features=AutomationControlled'
		], {
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
		}).unref();

		// Give Edge a moment to start and gain focus, then signal HTA to close
		setTimeout(() => {
			fs.writeFileSync(readyFile, 'close', 'utf-8');
		}, 200);
	} catch (err) {
		console.error('Failed to launch Edge:', err);
		// Still try to signal HTA to close
		try {
			fs.writeFileSync(readyFile, 'close', 'utf-8');
		} catch {
			// Ignore
		}
	}
}
