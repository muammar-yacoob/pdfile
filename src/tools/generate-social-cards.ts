import { exec } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const taglines = [
	'No Safe Word for PDFs.',
	'File Discipline, Delivered.',
	'Dominate Your Documents.',
	'Split. Merge. Repeat.',
	'Turn Your PDFs Inside Out.',
	'Your PDFs, Your Rules.',
	'Because We Hate PDFs.',
	'Commit Document Crimes.',
	'Because PDFs Deserve Consequences.',
];

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const BG_COLOR = '#0a0a0a';
const BRAND_COLOR = '#7fa5df';
const TEXT_COLOR = '#ffffff';

async function generateSocialCards() {
	const outputDir = join(process.cwd(), 'social-cards');

	// Create output directory
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	console.log('Generating social media cards...\n');

	for (let i = 0; i < taglines.length; i++) {
		const tagline = taglines[i];
		const outputPath = join(outputDir, `pdfile-card-${i + 1}.png`);

		try {
			// Create card with ImageMagick
			// Using a dark background with the tagline in brand color
			const escapedTagline = tagline.replace(/'/g, "'\\''");
			await execAsync(`convert -size ${CARD_WIDTH}x${CARD_HEIGHT} xc:"${BG_COLOR}" \
				-gravity North -pointsize 100 -fill "${TEXT_COLOR}" \
				-annotate +0+150 "PDFile" \
				-gravity Center -pointsize 60 -fill "${BRAND_COLOR}" \
				-annotate +0+0 '${escapedTagline}' \
				-gravity South -pointsize 30 -fill "${TEXT_COLOR}" \
				-annotate +0+100 "pdfile.co" \
				"${outputPath}"`);

			console.log(`✓ Generated: ${outputPath}`);
		} catch (error) {
			console.error(`✗ Failed to generate card ${i + 1}:`, (error as Error).message);
		}
	}

	console.log(`\n✓ All cards generated in: ${outputDir}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	generateSocialCards().catch(console.error);
}

export { generateSocialCards };
