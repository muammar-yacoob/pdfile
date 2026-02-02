import chalk from 'chalk';
import figlet from 'figlet';

const PRIMARY_COLOR = '#7fa5df';
const WHITE = '#ffffff';

/**
 * Render the PDFile ASCII art logo with alternating row colors
 * Pattern: alternating #7fa5df and white for each row
 */
function renderLogo(): string {
	const ascii = figlet.textSync('PDFile', {
		font: 'Slant',
		horizontalLayout: 'default',
	});

	const lines = ascii.split('\n');
	const colored: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		// Alternate between #68aceb and white for each row
		if (i % 2 === 0) {
			// Even rows: #68aceb
			colored.push(chalk.hex(PRIMARY_COLOR)(lines[i]));
		} else {
			// Odd rows: white
			colored.push(chalk.hex(WHITE)(lines[i]));
		}
	}

	return colored.join('\n');
}

/**
 * Display the PDFile banner with striped colors
 */
const SUBTITLE_COLOR = PRIMARY_COLOR;

export function showBanner(
	subtitle = 'Comprehensive PDF utility toolkit for document manipulation',
): void {
	try {
		console.log(`\n${renderLogo()}`);
		if (subtitle) {
			console.log(chalk.hex(SUBTITLE_COLOR)(`${subtitle}\n`));
		}
	} catch {
		// Fallback if rendering fails
		console.log('\n\x1b[1mPDFile\x1b[0m');
		if (subtitle) {
			// #7fa5df = rgb(127, 165, 223)
			console.log(`\x1b[38;2;127;165;223m${subtitle}\x1b[0m\n`);
		}
	}
}
