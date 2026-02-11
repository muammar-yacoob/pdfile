// System Utilities
// ImageMagick system checks and file management

import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { execAsync } from './utils.js';

/**
 * Check if ImageMagick is installed
 */
export async function checkImageMagick(): Promise<boolean> {
	try {
		await execAsync('command -v convert');
		return true;
	} catch {
		return false;
	}
}

/**
 * Ensure output directory exists
 */
export function ensureDir(filePath: string): void {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

/**
 * Clean up temporary files
 */
export function cleanup(...files: string[]): void {
	for (const file of files) {
		try {
			if (existsSync(file)) {
				unlinkSync(file);
			}
		} catch {
			// Ignore cleanup errors
		}
	}
}
