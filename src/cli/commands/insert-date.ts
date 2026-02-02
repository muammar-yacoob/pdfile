import chalk from 'chalk';
import type { Command } from 'commander';
import prompts from 'prompts';
import * as path from 'node:path';
import * as insertDate from '../../tools/insert-date.js';

export function registerInsertDateCommand(program: Command): void {
	program
		.command('insert-date <file>')
		.description("Insert today's date into PDF")
		.option('-o, --output <path>', 'Output file path')
		.option('--x <number>', 'X position', Number.parseFloat)
		.option('--y <number>', 'Y position', Number.parseFloat)
		.option('-s, --size <number>', 'Font size', Number.parseFloat)
		.option(
			'-f, --format <format>',
			'Date format: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, or "Month DD, YYYY"',
		)
		.option('-p, --pages <pages>', 'Comma-separated page numbers (e.g., "1,3,5")')
		.option('--yes', 'Use defaults, skip prompts')
		.action(
			async (
				file: string,
				options: {
					output?: string;
					x?: number;
					y?: number;
					size?: number;
					format?: string;
					pages?: string;
					yes?: boolean;
				},
			) => {
				try {
					if (!file.toLowerCase().endsWith('.pdf')) {
						console.error(chalk.red('Error: Input must be a PDF file'));
						process.exit(1);
					}

					let outputPath = options.output;
					let dateFormat: insertDate.DateInsertOptions['format'] =
						'MM/DD/YYYY';
					let pageNumbers: number[] | undefined;

					if (options.format) {
						const validFormats = [
							'MM/DD/YYYY',
							'DD/MM/YYYY',
							'YYYY-MM-DD',
							'Month DD, YYYY',
						];
						if (validFormats.includes(options.format)) {
							dateFormat = options.format as insertDate.DateInsertOptions['format'];
						} else {
							console.error(
								chalk.red(
									`Invalid format. Use: ${validFormats.join(', ')}`,
								),
							);
							process.exit(1);
						}
					}

					if (options.pages) {
						pageNumbers = options.pages
							.split(',')
							.map((p) => Number.parseInt(p.trim(), 10) - 1); // Convert to 0-indexed
					}

					if (!options.yes) {
						const responses = await prompts([
							{
								type: 'text',
								name: 'output',
								message: 'Output file path:',
								initial:
									outputPath ||
									path.join(
										path.dirname(file),
										`${path.basename(file, '.pdf')}_with_date.pdf`,
									),
							},
							{
								type: 'select',
								name: 'format',
								message: 'Date format:',
								choices: [
									{ title: 'MM/DD/YYYY (e.g., 02/02/2026)', value: 'MM/DD/YYYY' },
									{ title: 'DD/MM/YYYY (e.g., 02/02/2026)', value: 'DD/MM/YYYY' },
									{ title: 'YYYY-MM-DD (e.g., 2026-02-02)', value: 'YYYY-MM-DD' },
									{
										title: 'Month DD, YYYY (e.g., February 02, 2026)',
										value: 'Month DD, YYYY',
									},
								],
								initial: 0,
							},
							{
								type: 'number',
								name: 'fontSize',
								message: 'Font size:',
								initial: options.size ?? 12,
								min: 6,
								max: 72,
							},
						]);

						if (!responses.output) {
							console.log(chalk.yellow('Cancelled'));
							process.exit(0);
						}

						outputPath = responses.output;
						dateFormat = responses.format;
						options.size = responses.fontSize;
					}

					console.log(chalk.blue("Inserting today's date..."));

					const success = await insertDate.insertDate(
						file,
						{
							x: options.x,
							y: options.y,
							fontSize: options.size ?? 12,
							format: dateFormat,
							pages: pageNumbers,
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
