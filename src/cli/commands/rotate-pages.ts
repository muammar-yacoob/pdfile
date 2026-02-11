import * as path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import prompts from 'prompts';
import * as rotatePages from '../../tools/rotate-pages.js';

export function registerRotatePagesCommand(program: Command): void {
	program
		.command('rotate <file>')
		.description('Rotate pages in a PDF')
		.option(
			'-p, --pages <pages>',
			'Comma-separated page numbers to rotate (e.g., "1,3,5"). If not specified, rotates all pages.',
		)
		.option(
			'-r, --rotation <degrees>',
			'Rotation angle: 90, 180, 270, or -90 degrees',
		)
		.option('-o, --output <path>', 'Output file path')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.action(
			async (
				file: string,
				options: {
					pages?: string;
					rotation?: string;
					output?: string;
					yes?: boolean;
				},
			) => {
				try {
					if (!file.toLowerCase().endsWith('.pdf')) {
						console.error(chalk.red('Error: Input must be a PDF file'));
						process.exit(1);
					}

					let pagesToRotate: number[] = [];

					// Parse pages option
					if (options.pages) {
						pagesToRotate = options.pages
							.split(',')
							.map((p) => Number.parseInt(p.trim(), 10));
					} else if (!options.yes) {
						const response = await prompts({
							type: 'text',
							name: 'pages',
							message:
								'Enter page numbers to rotate (comma-separated, or press Enter for all pages):',
							initial: '',
						});

						if (response.pages === undefined) {
							console.log(chalk.yellow('Cancelled'));
							process.exit(0);
						}

						if (response.pages.trim().length > 0) {
							pagesToRotate = response.pages
								.split(',')
								.map((p: string) => Number.parseInt(p.trim(), 10));
						}
						// Empty array means all pages
					}

					// Parse rotation option
					let rotation: number;

					if (options.rotation) {
						rotation = Number.parseInt(options.rotation, 10);
					} else if (!options.yes) {
						const response = await prompts({
							type: 'select',
							name: 'rotation',
							message: 'Select rotation angle:',
							choices: [
								{ title: '90° clockwise', value: 90 },
								{ title: '180°', value: 180 },
								{ title: '270° clockwise (90° counter-clockwise)', value: 270 },
								{ title: '90° counter-clockwise', value: -90 },
							],
							initial: 0,
						});

						if (response.rotation === undefined) {
							console.log(chalk.yellow('Cancelled'));
							process.exit(0);
						}

						rotation = response.rotation;
					} else {
						console.error(
							chalk.red('Error: --rotation option is required with --yes flag'),
						);
						process.exit(1);
					}

					// Parse output option
					let outputPath = options.output;

					if (!outputPath && !options.yes) {
						const defaultOutput = path.join(
							path.dirname(file),
							`${path.basename(file, '.pdf')}_rotated.pdf`,
						);

						const response = await prompts({
							type: 'text',
							name: 'output',
							message: 'Output file path:',
							initial: defaultOutput,
						});

						if (!response.output) {
							console.log(chalk.yellow('Cancelled'));
							process.exit(0);
						}

						outputPath = response.output;
					}

					const pageDescription =
						pagesToRotate.length === 0
							? 'all pages'
							: `${pagesToRotate.length} page(s)`;

					console.log(
						chalk.blue(`Rotating ${pageDescription} by ${rotation}°...`),
					);

					const success = await rotatePages.rotatePages(
						file,
						pagesToRotate,
						rotation,
						outputPath,
					);
					process.exit(success ? 0 : 1);
				} catch (error) {
					console.error(
						chalk.red(
							`Error: ${error instanceof Error ? error.message : error}`,
						),
					);
					process.exit(1);
				}
			},
		);
}
