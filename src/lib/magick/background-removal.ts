// Background Removal
// Functions for removing backgrounds from images

import {
	execAsync,
	getCoalescePrefix,
	getGifOutputSuffix,
	isGif,
} from './utils.js';

/**
 * Remove background color from image
 * Preserves animation for GIF files
 */
export async function removeBackground(
	inputPath: string,
	outputPath: string,
	color: string,
	fuzz: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-fuzz ${fuzz}% -transparent "${color}"${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Remove background using flood-fill from edges only
 * Preserves animation for GIF files
 */
export async function removeBackgroundBorderOnly(
	inputPath: string,
	outputPath: string,
	color: string,
	fuzz: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-bordercolor "${color}" -border 1x1 -fill none -fuzz ${fuzz}% -draw "matte 0,0 floodfill" -shave 1x1${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Remove background with edge feathering for smoother cutouts
 * Uses flood-fill from borders, then applies edge feathering for soft transitions
 * This produces cleaner edges without harsh jagged boundaries
 *
 * @param featherAmount - Edge feathering radius (0-100, higher = softer edges)
 */
export async function removeBackgroundEdgeAware(
	inputPath: string,
	outputPath: string,
	color: string,
	fuzz: number,
	featherAmount = 50,
): Promise<boolean> {
	try {
		// Map feather amount (0-100) to blur radius (0.5 to 3 pixels)
		const featherRadius = 0.5 + (featherAmount / 100) * 2.5;
		const coalesce = getCoalescePrefix(inputPath);

		if (isGif(inputPath)) {
			// For GIFs: use -channel A -blur to feather alpha on each frame directly
			// (+clone approach doesn't work with multi-frame images)
			await execAsync(
				`convert "${inputPath}" ${coalesce}` +
					`-bordercolor "${color}" -border 1x1 ` +
					`-fill none -fuzz ${fuzz}% -draw "matte 0,0 floodfill" ` +
					`-shave 1x1 ` +
					`-channel A -blur 0x${featherRadius} +channel ` +
					`"${outputPath}"`,
			);
		} else {
			// For single images: use +clone approach for precise alpha feathering
			await execAsync(
				`convert "${inputPath}" ` +
					`-bordercolor "${color}" -border 1x1 ` +
					`-fill none -fuzz ${fuzz}% -draw "matte 0,0 floodfill" ` +
					`-shave 1x1 ` +
					`\\( +clone -alpha extract -blur 0x${featherRadius} \\) ` +
					`-compose CopyOpacity -composite ` +
					`"${outputPath}"`,
			);
		}
		return true;
	} catch {
		// Fall back to standard border-only method
		return removeBackgroundBorderOnly(inputPath, outputPath, color, fuzz);
	}
}
