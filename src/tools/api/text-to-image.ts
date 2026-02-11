/**
 * Text-to-image renderer using ImageMagick
 */

import { execSync } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export interface TextToImageOptions {
	text: string;
	fontSize?: number;
	fontFamily?: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	textColor?: string;
	highlightColor?: string;
	bgColor?: string;
	blur?: number;
	width?: number;
	height?: number;
}

/**
 * Render text to image using ImageMagick
 */
export async function renderTextToImage(
	options: TextToImageOptions,
	tmpDir: string,
): Promise<string> {
	const outputPath = join(tmpDir, `text_${Date.now()}.png`);

	// Build ImageMagick command
	const imgWidth = Math.round(options.width || 150);
	const imgHeight = Math.round(options.height || 50);
	const imgFontSize = Math.round(options.fontSize || 12);

	// Map font families to ImageMagick font names
	let fontName = options.fontFamily || 'Helvetica';
	if (options.fontFamily === 'Times') fontName = 'Times-New-Roman';
	else if (options.fontFamily === 'Courier') fontName = 'Courier-New';

	// Build font weight and style
	let fontWeight = options.bold ? 'Bold' : 'Regular';
	if (options.italic) fontWeight = options.bold ? 'Bold-Italic' : 'Italic';

	// Parse colors
	const fillColor = options.textColor || '#000000';
	const backgroundColor = options.bgColor || 'transparent';

	// Escape text for shell
	const escapedText = options.text.replace(/'/g, "'\\''");

	// Build the command
	let command = `convert -size ${imgWidth}x${imgHeight} `;

	// Set background
	if (backgroundColor && backgroundColor !== 'transparent') {
		command += `xc:"${backgroundColor}" `;
	} else {
		command += `xc:transparent `;
	}

	// Add highlight/background box if specified
	if (options.highlightColor) {
		command += `-fill "${options.highlightColor}" -draw "rectangle 0,0 ${imgWidth},${imgHeight}" `;
	}

	// Set text properties
	command += `-gravity center `;
	command += `-font ${fontName}-${fontWeight} `;
	command += `-pointsize ${imgFontSize} `;
	command += `-fill "${fillColor}" `;

	// Add underline using annotate (ImageMagick doesn't have direct underline)
	if (options.underline) {
		// Draw text normally first
		command += `-annotate +0+0 '${escapedText}' `;
		// Add underline as a line
		const underlineY = Math.round(imgHeight / 2 + imgFontSize / 2 + 2);
		const textWidth = Math.round(escapedText.length * imgFontSize * 0.6);
		const underlineX1 = Math.round((imgWidth - textWidth) / 2);
		const underlineX2 = Math.round((imgWidth + textWidth) / 2);
		command += `-stroke "${fillColor}" -strokewidth 1 -draw "line ${underlineX1},${underlineY} ${underlineX2},${underlineY}" `;
	} else {
		command += `-annotate +0+0 '${escapedText}' `;
	}

	// Apply blur if specified
	if (options.blur && options.blur > 0) {
		command += `-blur 0x${options.blur} `;
	}

	command += `"${outputPath}"`;

	console.log('ImageMagick command:', command);

	// Execute command
	execSync(command, { stdio: 'pipe' });

	// Read the generated image
	const imageBuffer = await readFile(outputPath);
	const imageData = `data:image/png;base64,${imageBuffer.toString('base64')}`;

	// Clean up
	await unlink(outputPath).catch(() => {});

	return imageData;
}
