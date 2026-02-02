/**
 * Window Launcher - Opens Edge app window and signals loading HTA
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
 * Open URL in Edge app mode (standalone window without browser UI)
 */
function openAppWindow(url: string): void {
	// Use PowerShell with hidden window to launch Edge - prevents terminal flash
	spawn(
		'powershell.exe',
		['-WindowStyle', 'Hidden', '-Command', `Start-Process msedge -ArgumentList '--app=${url}'`],
		{
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
		},
	).unref();
}

/**
 * Signal the loading HTA to close and open Edge
 * Launches Edge first via PowerShell (properly focused), then signals HTA to close
 * @param url - The URL for Edge to open
 */
export function signalLoadingComplete(url: string): void {
	const readyFile = getReadyFilePath();
	try {
		// Launch Edge via PowerShell
		openAppWindow(url);

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
