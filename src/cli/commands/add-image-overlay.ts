import * as path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import prompts from 'prompts';
import * as addImageOverlay from '../../tools/add-image-overlay.js';

export function registerAddImageOverlayCommand(program: Command): void {
	program
		.command('add-image <pdf> <image>')
		.description('Add an image overlay to a PDF')
		.option('-o, --output <path>', 'Output file path')
		.option(
			'-x, --x <number>',
			'X position (default: center)',
			Number.parseFloat,
		)
		.option(
			'-y, --y <number>',
			'Y position (default: center)',
			Number.parseFloat,
		)
		.option('-w, --width <number>', 'Image width', Number.parseFloat)
		.option('-h, --height <number>', 'Image height', Number.parseFloat)
		.option(
			'--opacity <number>',
			'Image opacity (0.0 to 1.0)',
			Number.parseFloat,
		)
		.option(
			'-p, --pages <pages>',
			'Comma-separated page numbers (e.g., "1,3,5")',
		)
		.option('--yes', 'Use defaults, skip prompts')
		.action(
			async (
				pdfFile: string,
				imageFile: string,
				options: {
					output?: string;
					x?: number;
					y?: number;
					width?: number;
					height?: number;
					opacity?: number;
					pages?: string;
					yes?: boolean;
				},
			) => {
				try {
					if (!pdfFile.toLowerCase().endsWith('.pdf')) {
						console.error(
							chalk.red('Error: First argument must be a PDF file'),
						);
						process.exit(1);
					}

					const imageExt = path.extname(imageFile).toLowerCase();
					if (!['.png', '.jpg', '.jpeg'].includes(imageExt)) {
						console.error(
							chalk.red('Error: Image must be PNG or JPG/JPEG format'),
						);
						process.exit(1);
					}

					let outputPath = options.output;
					let pageNumbers: number[] | undefined;

					if (options.pages) {
						pageNumbers = options.pages
							.split(',')
							.map((p) => Number.parseInt(p.trim(), 10) - 1); // Convert to 0-indexed
					}

					if (!outputPath && !options.yes) {
						const defaultOutput = path.join(
							path.dirname(pdfFile),
							`${path.basename(pdfFile, '.pdf')}_with_overlay.pdf`,
						);

						const response = await prompts([
							{
								type: 'text',
								name: 'output',
								message: 'Output file path:',
								initial: defaultOutput,
							},
							{
								type: 'number',
								name: 'opacity',
								message: 'Image opacity (0.0 to 1.0):',
								initial: options.opacity ?? 1.0,
								min: 0,
								max: 1,
								validate: (value) =>
									value >= 0 && value <= 1
										? true
										: 'Opacity must be between 0.0 and 1.0',
							},
						]);

						if (!response.output) {
							console.log(chalk.yellow('Cancelled'));
							process.exit(0);
						}

						outputPath = response.output;
						options.opacity = response.opacity;
					}

					console.log(chalk.blue('Adding image overlay to PDF...'));

					const success = await addImageOverlay.addImageOverlay(
						pdfFile,
						{
							imagePath: imageFile,
							x: options.x,
							y: options.y,
							width: options.width,
							height: options.height,
							opacity: options.opacity ?? 1.0,
							pages: pageNumbers,
						},
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
