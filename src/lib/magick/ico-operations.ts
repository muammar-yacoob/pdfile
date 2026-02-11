// ICO Operations
// Functions for creating and working with ICO icon files

import { execAsync } from './utils.js';

/**
 * Create ICO file with multiple resolutions
 */
export async function createIco(
	inputPath: string,
	outputPath: string,
	sizes: number[] = [256, 128, 64, 48, 32, 16],
): Promise<boolean> {
	try {
		const sizeStr = sizes.join(',');
		await execAsync(
			`convert "${inputPath}" -define icon:auto-resize=${sizeStr} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Create ICO from multiple PNG files
 */
export async function createIcoFromMultiple(
	pngPaths: string[],
	outputPath: string,
): Promise<boolean> {
	try {
		const inputs = pngPaths.map((p) => `"${p}"`).join(' ');
		await execAsync(`convert ${inputs} "${outputPath}"`);
		return true;
	} catch {
		return false;
	}
}
