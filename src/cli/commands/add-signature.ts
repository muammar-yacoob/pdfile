import chalk from 'chalk';
import type { Command } from 'commander';
import prompts from 'prompts';
import * as path from 'node:path';
import * as addSignature from '../../tools/add-signature.js';

export function registerAddSignatureCommand(program: Command): void {
	program
		.command('sign <pdf> <signature>')
		.description('Add signature to PDF (PNG with auto transparency removal)')
		.option('-o, --output <path>', 'Output file path')
		.option('--x <number>', 'X position', Number.parseFloat)
		.option('--y <number>', 'Y position', Number.parseFloat)
		.option('-w, --width <number>', 'Signature width', Number.parseFloat)
		.option('-h, --height <number>', 'Signature height', Number.parseFloat)
		.option('--opacity <number>', 'Signature opacity (0.0 to 1.0)', Number.parseFloat)
		.option('-p, --pages <pages>', 'Comma-separated page numbers (default: last page)')
		.option('--no-remove-bg', 'Skip background removal')
		.option('--fuzz <number>', 'Background removal tolerance (0-100, default: 15)', Number.parseFloat)
		.option('--feather <number>', 'Feathering radius (default: 2)', Number.parseFloat)
		.option('--yes', 'Use defaults, skip prompts')
		.action(
			async (
				pdfFile: string,
				signatureFile: string,
				options: {
					output?: string;
					x?: number;
					y?: number;
					width?: number;
					height?: number;
					opacity?: number;
					pages?: string;
					removeBg?: boolean;
					fuzz?: number;
					feather?: number;
					yes?: boolean;
				},
			) => {
				try {
					if (!pdfFile.toLowerCase().endsWith('.pdf')) {
						console.error(chalk.red('Error: First argument must be a PDF file'));
						process.exit(1);
					}

					const signatureExt = path.extname(signatureFile).toLowerCase();
					if (signatureExt !== '.png') {
						console.error(
							chalk.red('Error: Signature file must be in PNG format'),
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
							`${path.basename(pdfFile, '.pdf')}_signed.pdf`,
						);

						const responses = await prompts([
							{
								type: 'text',
								name: 'output',
								message: 'Output file path:',
								initial: defaultOutput,
							},
							{
								type: 'number',
								name: 'opacity',
								message: 'Signature opacity (0.0 to 1.0):',
								initial: options.opacity ?? 1.0,
								min: 0,
								max: 1,
								validate: (value) =>
									value >= 0 && value <= 1
										? true
										: 'Opacity must be between 0.0 and 1.0',
							},
							{
								type: 'confirm',
								name: 'removeBg',
								message: 'Remove white background from signature?',
								initial: options.removeBg ?? true,
							},
						]);

						if (!responses.output) {
							console.log(chalk.yellow('Cancelled'));
							process.exit(0);
						}

						outputPath = responses.output;
						options.opacity = responses.opacity;
						options.removeBg = responses.removeBg;
					}

					console.log(chalk.blue('Adding signature to PDF...'));

					const success = await addSignature.addSignature(
						pdfFile,
						{
							signatureFile,
							x: options.x,
							y: options.y,
							width: options.width,
							height: options.height,
							opacity: options.opacity ?? 1.0,
							pages: pageNumbers,
							removeBg: options.removeBg ?? true,
							fuzz: options.fuzz ?? 15,
							feather: options.feather ?? 2,
						},
						outputPath,
					);

					process.exit(success ? 0 : 1);
				} catch (error) {
					console.error(
						chalk.red(`Error: ${error instanceof Error ? error.message : error}`),
					);
					process.exit(1);
				}
			},
		);
}
