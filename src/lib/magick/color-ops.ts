// Color Operations
// Functions for manipulating image colors

import { execAsync, getCoalescePrefix, getGifOutputSuffix } from './utils.js';

/**
 * Add solid color border to image
 * Preserves animation for GIF files
 */
export async function addBorder(
	inputPath: string,
	outputPath: string,
	width: number,
	color: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-bordercolor "${color}" -border ${width}${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Replace one color with another
 * Preserves animation for GIF files
 */
export async function replaceColor(
	inputPath: string,
	outputPath: string,
	fromColor: string,
	toColor: string,
	fuzz: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-fuzz ${fuzz}% -fill "${toColor}" -opaque "${fromColor}"${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}
