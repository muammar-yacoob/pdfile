// ImageMagick Utilities
// Helper functions for building ImageMagick commands

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

export const execAsync = promisify(exec);

/**
 * Get input path with frame selector for multi-frame formats (ICO)
 * ICO files contain multiple resolutions - [0] selects the largest
 * Used for operations that need a single frame (icon generation)
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
 * This prevents slow processing of all animation frames during preview
 */
export function getPreviewInputSelector(imagePath: string): string {
	const lowerPath = imagePath.toLowerCase();
	if (lowerPath.endsWith('.ico') || lowerPath.endsWith('.gif')) {
		return `"${imagePath}[0]"`;
	}
	return `"${imagePath}"`;
}

/**
 * Check if file is an animated GIF
 */
export function isGif(imagePath: string): boolean {
	return imagePath.toLowerCase().endsWith('.gif');
}

/**
 * Check if file is a multi-frame format (GIF or ICO)
 */
export function isMultiFrame(imagePath: string): boolean {
	const lowerPath = imagePath.toLowerCase();
	return lowerPath.endsWith('.gif') || lowerPath.endsWith('.ico');
}

/**
 * Get GIF output command suffix (placeholder for future optimization)
 * No layer optimization is used to ensure each frame is stored as a complete image,
 * preventing overlap artifacts when frames are extracted individually.
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
