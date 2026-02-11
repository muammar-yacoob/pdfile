// Image Information
// Functions for getting image metadata and properties

import { execAsync, getPreviewInputSelector } from './utils.js';

/**
 * Get image dimensions
 * Returns [width, height] or null on error
 * Uses first frame only for multi-frame formats (GIF, ICO)
 */
export async function getDimensions(
	imagePath: string,
): Promise<[number, number] | null> {
	try {
		const input = getPreviewInputSelector(imagePath);
		const { stdout } = await execAsync(
			`convert ${input} -ping -format "%w %h" info:`,
		);
		const [w, h] = stdout.trim().split(' ').map(Number);
		if (Number.isNaN(w) || Number.isNaN(h)) return null;
		return [w, h];
	} catch {
		return null;
	}
}

/**
 * Get border color (samples top-left pixel)
 * Uses first frame only for multi-frame formats (GIF, ICO)
 */
export async function getBorderColor(
	imagePath: string,
): Promise<string | null> {
	try {
		const input = getPreviewInputSelector(imagePath);
		const { stdout } = await execAsync(
			`convert ${input} -format "%[pixel:u.p{0,0}]" info:`,
		);
		return stdout.trim();
	} catch {
		return null;
	}
}

/**
 * Get frame count from animated GIF
 */
export async function getFrameCount(imagePath: string): Promise<number> {
	try {
		const { stdout } = await execAsync(
			`identify -format "%n\\n" "${imagePath}" | head -1`,
		);
		const count = Number.parseInt(stdout.trim(), 10);
		return Number.isNaN(count) ? 1 : count;
	} catch {
		return 1;
	}
}

/**
 * Get the frame delay of a GIF in centiseconds (1/100th of a second)
 * Returns the delay of the first frame (most GIFs use uniform delay)
 */
export async function getGifDelay(imagePath: string): Promise<number> {
	try {
		const { stdout } = await execAsync(
			`identify -format "%T\\n" "${imagePath}" | head -1`,
		);
		const delay = Number.parseInt(stdout.trim(), 10);
		return Number.isNaN(delay) || delay <= 0 ? 10 : delay; // Default 10cs (100ms)
	} catch {
		return 10;
	}
}
