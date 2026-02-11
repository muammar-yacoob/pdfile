// ImageMagick Command Builder Utilities
// Functions for building ImageMagick command line arguments

import { isGif } from './utils.js';

/**
 * Get input path with frame selector for multi-frame formats (ICO)
 * ICO files contain multiple resolutions - [0] selects the largest
 */
export function getInputSelector(imagePath: string): string {
	const lowerPath = imagePath.toLowerCase();
	if (lowerPath.endsWith('.ico')) {
		return `"${imagePath}[0]"`;
	}
	return `"${imagePath}"`;
}

/**
 * Get input path for preview (first frame only for GIFs and ICOs)
 * Prevents slow processing of all animation frames during preview
 */
export function getPreviewInputSelector(imagePath: string): string {
	const lowerPath = imagePath.toLowerCase();
	if (lowerPath.endsWith('.ico') || lowerPath.endsWith('.gif')) {
		return `"${imagePath}[0]"`;
	}
	return `"${imagePath}"`;
}

/**
 * Get GIF output command suffix (placeholder for future optimization)
 * No layer optimization is used to ensure each frame is stored as a complete image
 */
export function getGifOutputSuffix(_outputPath: string): string {
	return '';
}

/**
 * Get coalesce prefix for GIF input (processes all frames properly)
 */
export function getCoalescePrefix(inputPath: string): string {
	return isGif(inputPath) ? '-coalesce ' : '';
}
