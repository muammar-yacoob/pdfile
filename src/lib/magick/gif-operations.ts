// GIF Operations
// Functions for working with animated GIFs

import { copyFileSync, unlinkSync } from 'node:fs';
import { getFrameCount, getGifDelay } from './image-info.js';
import { getDimensions } from './image-info.js';
import { ensureDir } from './system.js';
import { execAsync, isGif } from './utils.js';

/**
 * Extract a frame from GIF/ICO for preview
 * @param frameIndex - Which frame to extract (default 0 = first frame)
 * Returns the input path if not a multi-frame format
 *
 * OPTIMIZED: Instead of coalescing ALL frames then extracting one,
 * we only coalesce frames 0 through frameIndex, which is much faster
 * for GIFs with many frames.
 */
export async function extractFirstFrame(
	inputPath: string,
	outputPath: string,
	frameIndex = 0,
): Promise<boolean> {
	const lowerPath = inputPath.toLowerCase();
	if (!lowerPath.endsWith('.gif') && !lowerPath.endsWith('.ico')) {
		// Not a multi-frame format, just copy
		try {
			copyFileSync(inputPath, outputPath);
			return true;
		} catch {
			return false;
		}
	}

	try {
		if (lowerPath.endsWith('.gif')) {
			// Use PNG32 for full alpha support and -quality 100 for best quality
			if (frameIndex === 0) {
				// Frame 0 is always complete - no coalescing needed
				await execAsync(
					`convert "${inputPath}[0]" -quality 100 "PNG32:${outputPath}"`,
				);
			} else {
				// Only load and coalesce frames 0 through frameIndex, then keep only the last one
				// This is MUCH faster than coalescing all frames
				await execAsync(
					`convert "${inputPath}[0-${frameIndex}]" -coalesce -delete 0--2 -quality 100 "PNG32:${outputPath}"`,
				);
			}
		} else {
			// ICO files don't need coalescing
			await execAsync(
				`convert "${inputPath}[${frameIndex}]" -quality 100 "PNG32:${outputPath}"`,
			);
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Extract all frames from animated GIF to individual PNG files
 * Returns array of output file paths
 *
 * OPTIMIZED: Uses +adjoin for direct file output without intermediate buffering
 */
export async function extractAllFrames(
	inputPath: string,
	outputDir: string,
	baseName: string,
): Promise<string[]> {
	try {
		// Ensure output directory exists
		ensureDir(`${outputDir}/dummy`);

		// Extract frames with optimizations:
		// - coalesce: properly handle delta-encoded frames
		// - +adjoin: write frames directly to separate files (more efficient)
		// - PNG32: full 32-bit RGBA for best quality
		// - quality 100: maximum PNG compression quality
		await execAsync(
			`convert "${inputPath}" -coalesce -quality 100 +adjoin "PNG32:${outputDir}/${baseName}-%04d.png"`,
		);

		// Get list of created files
		const { stdout } = await execAsync(
			`ls -1 "${outputDir}/${baseName}"-*.png 2>/dev/null || true`,
		);
		const files = stdout
			.trim()
			.split('\n')
			.filter((f) => f.length > 0);
		return files;
	} catch {
		return [];
	}
}

/**
 * Set uniform frame delay on a GIF (in centiseconds)
 * Modifies the file in-place
 */
export async function setGifDelay(
	imagePath: string,
	delayCentiseconds: number,
): Promise<boolean> {
	try {
		// Use mogrify for in-place modification with -delay before the file
		await execAsync(`mogrify -delay ${delayCentiseconds} "${imagePath}"`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Set GIF loop count (0 = infinite loop, 1 = play once, etc.)
 * Modifies the file in-place
 */
export async function setGifLoop(
	imagePath: string,
	loopCount: number,
): Promise<boolean> {
	try {
		await execAsync(`mogrify -loop ${loopCount} "${imagePath}"`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Delete a frame from animated GIF
 * @returns Object with success status and new frame count
 */
export async function deleteGifFrame(
	inputPath: string,
	outputPath: string,
	frameIndex: number,
): Promise<{ success: boolean; frameCount?: number }> {
	try {
		const originalCount = await getFrameCount(inputPath);
		if (originalCount <= 1) {
			return { success: false }; // Can't delete the only frame
		}
		if (frameIndex < 0 || frameIndex >= originalCount) {
			return { success: false };
		}

		// Coalesce first (full frames), then delete the specific frame
		await execAsync(
			`convert "${inputPath}" -coalesce -delete ${frameIndex} "${outputPath}"`,
		);

		const newCount = await getFrameCount(outputPath);
		return { success: true, frameCount: newCount };
	} catch {
		return { success: false };
	}
}

/**
 * Replace a frame in animated GIF with another image
 * The replacement image is scaled/cropped to match GIF dimensions
 * @returns Object with success status
 */
export async function replaceGifFrame(
	inputPath: string,
	outputPath: string,
	frameIndex: number,
	replacementPath: string,
): Promise<{ success: boolean; frameCount?: number }> {
	try {
		const frameCount = await getFrameCount(inputPath);
		if (frameIndex < 0 || frameIndex >= frameCount) {
			return { success: false };
		}

		// Get GIF dimensions
		const dims = await getDimensions(inputPath);
		if (!dims) return { success: false };

		// Scale/crop replacement to match GIF dimensions (cover mode + crop)
		const tempReplacement = `${outputPath}.tmp.png`;
		await execAsync(
			`convert "${replacementPath}" -resize ${dims[0]}x${dims[1]}^ -gravity center -extent ${dims[0]}x${dims[1]} "${tempReplacement}"`,
		);

		// Build frame list: all frames except the one being replaced
		// Then insert the replacement at the right position
		if (frameIndex === 0) {
			// Replace first frame
			await execAsync(
				`convert "${tempReplacement}" \\( "${inputPath}" -coalesce \\) -delete 1 "${outputPath}"`,
			);
		} else if (frameIndex === frameCount - 1) {
			// Replace last frame
			await execAsync(
				`convert \\( "${inputPath}" -coalesce -delete -1 \\) "${tempReplacement}" "${outputPath}"`,
			);
		} else {
			// Replace middle frame - need to split and rejoin
			await execAsync(
				`convert \\( "${inputPath}" -coalesce \\) -delete ${frameIndex} "${outputPath}.frames.gif" && ` +
					`convert "${outputPath}.frames.gif[0-${frameIndex - 1}]" "${tempReplacement}" "${outputPath}.frames.gif[${frameIndex}-]" "${outputPath}" && ` +
					`rm -f "${outputPath}.frames.gif"`,
			);
		}

		// Cleanup temp file
		try {
			unlinkSync(tempReplacement);
		} catch {
			/* ignore */
		}

		const newCount = await getFrameCount(outputPath);
		return { success: true, frameCount: newCount };
	} catch {
		return { success: false };
	}
}

/**
 * Simplify animated GIF by keeping only every Nth frame
 * @param skipFactor - Keep every Nth frame (2 = keep every 2nd, 3 = every 3rd, etc.)
 * @returns Object with success status and new frame count
 *
 * This is useful for large GIFs that would be slow to process.
 * Skipping frames reduces processing time proportionally.
 */
export async function simplifyGif(
	inputPath: string,
	outputPath: string,
	skipFactor: number,
): Promise<{ success: boolean; frameCount?: number }> {
	if (skipFactor < 2) {
		// No simplification needed
		if (inputPath !== outputPath) {
			try {
				copyFileSync(inputPath, outputPath);
				const count = await getFrameCount(outputPath);
				return { success: true, frameCount: count };
			} catch {
				return { success: false };
			}
		}
		const count = await getFrameCount(inputPath);
		return { success: true, frameCount: count };
	}

	try {
		// Get original frame count and delay
		const originalCount = await getFrameCount(inputPath);
		if (originalCount <= 1) {
			// Not an animated GIF
			copyFileSync(inputPath, outputPath);
			return { success: true, frameCount: 1 };
		}

		const originalDelay = await getGifDelay(inputPath);
		// Multiply delay by skip factor to maintain the same playback duration
		const newDelay = originalDelay * skipFactor;

		// Build frame index list: 0, N, 2N, 3N, ...
		const frameIndices: number[] = [];
		for (let i = 0; i < originalCount; i += skipFactor) {
			frameIndices.push(i);
		}

		// Use ImageMagick to extract specific frames and reconstruct GIF
		// The -coalesce ensures proper rendering of delta-encoded frames
		// -delay adjusts timing to compensate for skipped frames
		const keepPattern = frameIndices.join(',');

		await execAsync(
			`convert "${inputPath}[${keepPattern}]" -coalesce -delay ${newDelay} "${outputPath}"`,
		);

		const newCount = await getFrameCount(outputPath);
		return { success: true, frameCount: newCount };
	} catch {
		return { success: false };
	}
}
