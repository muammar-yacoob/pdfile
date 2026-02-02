import chalk from 'chalk';
import type { Command } from 'commander';
import prompts from 'prompts';
import * as path from 'node:path';
import * as removePages from '../../tools/remove-pages.js';

export function registerRemovePagesCommand(program: Command): void {
	program
		.command('remove-pages <file>')
		.description('Remove specific pages from a PDF')
		.option('-p, --pages <pages>', 'Comma-separated page numbers to remove (e.g., "1,3,5")')
		.option('-o, --output <path>', 'Output file path')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.action(
			async (
				file: string,
				options: { pages?: string; output?: string; yes?: boolean },
			) => {
				try {
					if (!file.toLowerCase().endsWith('.pdf')) {
						console.error(chalk.red('Error: Input must be a PDF file'));
						process.exit(1);
					}

					let pagesToRemove: number[] = [];

					if (options.pages) {
						pagesToRemove = options.pages
							.split(',')
							.map((p) => Number.parseInt(p.trim(), 10));
					} else if (!options.yes) {
						const response = await prompts({
							type: 'text',
							name: 'pages',
							message: 'Enter page numbers to remove (comma-separated, e.g., 1,3,5):',
							validate: (value) =>
								value.trim().length > 0
									? true
									: 'Please enter at least one page number',
						});

						if (!response.pages) {
							console.log(chalk.yellow('Cancelled'));
							process.exit(0);
						}

						pagesToRemove = response.pages
							.split(',')
							.map((p: string) => Number.parseInt(p.trim(), 10));
					} else {
						console.error(
							chalk.red('Error: --pages option is required with --yes flag'),
						);
						process.exit(1);
					}

					let outputPath = options.output;

					if (!outputPath && !options.yes) {
						const defaultOutput = path.join(
							path.dirname(file),
							`${path.basename(file, '.pdf')}_removed_pages.pdf`,
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

					console.log(
						chalk.blue(`Removing ${pagesToRemove.length} page(s) from PDF...`),
					);

					const success = await removePages.removePages(
						file,
						pagesToRemove,
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
