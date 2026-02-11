// Image Filters
// Functions for applying color filters and effects

import { execAsync, getCoalescePrefix, getGifOutputSuffix } from './utils.js';

/**
 * Apply grayscale filter
 * Preserves animation for GIF files
 */
export async function filterGrayscale(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-colorspace Gray${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Apply sepia tone filter
 * Preserves animation for GIF files
 */
export async function filterSepia(
	inputPath: string,
	outputPath: string,
	intensity = 80,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-sepia-tone ${intensity}%${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Invert image colors (negative)
 * Preserves animation for GIF files
 */
export async function filterInvert(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-negate${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Apply vintage filter (desaturate + warm tint)
 * Preserves animation for GIF files
 */
export async function filterVintage(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-modulate 100,70,100 -fill "#704214" -colorize 15%${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Increase saturation (vivid colors)
 * Preserves animation for GIF files
 */
export async function filterVivid(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-modulate 100,130,100${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}
