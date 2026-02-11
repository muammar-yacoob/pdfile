// Image Transformations
// Functions for resizing, scaling, and cropping images

import { copyFileSync } from 'node:fs';
import { getDimensions } from './image-info.js';
import { execAsync, getCoalescePrefix, getGifOutputSuffix } from './utils.js';

/**
 * Trim transparent/whitespace edges from image
 * Preserves animation for GIF files
 */
export async function trim(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-trim +repage${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Make image square by adding transparent padding
 * Preserves animation for GIF files
 */
export async function squarify(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	const dims = await getDimensions(inputPath);
	if (!dims) return false;

	const [width, height] = dims;

	// Already square - just copy
	if (width === height) {
		if (inputPath !== outputPath) {
			copyFileSync(inputPath, outputPath);
		}
		return true;
	}

	const size = Math.max(width, height);
	const coalesce = getCoalescePrefix(inputPath);
	const gifSuffix = getGifOutputSuffix(outputPath);

	try {
		await execAsync(
			`convert "${inputPath}" ${coalesce}-background none -gravity center -extent ${size}x${size}${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scale image to specific size with transparent padding
 */
export async function scaleToSize(
	inputPath: string,
	outputPath: string,
	size: number,
): Promise<boolean> {
	try {
		// Use Lanczos filter for best quality scaling, PNG32 for full color
		await execAsync(
			`convert "${inputPath}" -filter Lanczos -resize ${size}x${size} -background none -gravity center -extent ${size}x${size} -quality 100 "PNG32:${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scale image with custom dimensions and padding
 * Preserves animation for GIF files
 */
export async function scaleWithPadding(
	inputPath: string,
	outputPath: string,
	width: number,
	height: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-resize ${width}x${height} -background none -gravity center -extent ${width}x${height}${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scale image to exact dimensions (may distort)
 * Preserves animation for GIF files
 */
export async function resize(
	inputPath: string,
	outputPath: string,
	width: number,
	height: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-resize ${width}x${height}!${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scale image to fill area and crop to exact size (cover mode)
 * Preserves animation for GIF files
 */
export async function scaleFillCrop(
	inputPath: string,
	outputPath: string,
	width: number,
	height: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-resize ${width}x${height}^ -background none -gravity center -extent ${width}x${height}${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Flip image horizontally (mirror)
 * Preserves animation for GIF files
 */
export async function flipHorizontal(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-flop${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Flip image vertically
 * Preserves animation for GIF files
 */
export async function flipVertical(
	inputPath: string,
	outputPath: string,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-flip${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Rotate image by specified degrees
 * Preserves animation for GIF files
 */
export async function rotate(
	inputPath: string,
	outputPath: string,
	degrees: number,
): Promise<boolean> {
	try {
		const coalesce = getCoalescePrefix(inputPath);
		const gifSuffix = getGifOutputSuffix(outputPath);
		await execAsync(
			`convert "${inputPath}" ${coalesce}-rotate ${degrees} -background none${gifSuffix} "${outputPath}"`,
		);
		return true;
	} catch {
		return false;
	}
}
