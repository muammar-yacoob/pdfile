import chalk from 'chalk';
import type { Command } from 'commander';
import prompts from 'prompts';
import * as path from 'node:path';
import * as reorderPages from '../../tools/reorder-pages.js';

export function registerReorderPagesCommand(program: Command): void {
	program
		.command('reorder <file>')
		.description('Reorder pages in a PDF')
		.option(
			'-n, --new-order <order>',
			'Comma-separated page numbers in new order (e.g., "3,1,2")',
		)
		.option('-o, --output <path>', 'Output file path')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.action(
			async (
				file: string,
				options: { newOrder?: string; output?: string; yes?: boolean },
			) => {
				try {
					if (!file.toLowerCase().endsWith('.pdf')) {
						console.error(chalk.red('Error: Input must be a PDF file'));
						process.exit(1);
					}

					let newOrder: number[] = [];

					if (options.newOrder) {
						newOrder = options.newOrder
							.split(',')
							.map((p) => Number.parseInt(p.trim(), 10));
					} else if (!options.yes) {
						const response = await prompts({
							type: 'text',
							name: 'order',
							message:
								'Enter new page order (comma-separated, e.g., 3,1,2 for a 3-page PDF):',
							validate: (value) =>
								value.trim().length > 0 ? true : 'Please enter a page order',
						});

						if (!response.order) {
							console.log(chalk.yellow('Cancelled'));
							process.exit(0);
						}

						newOrder = response.order
							.split(',')
							.map((p: string) => Number.parseInt(p.trim(), 10));
					} else {
						console.error(
							chalk.red('Error: --new-order option is required with --yes flag'),
						);
						process.exit(1);
					}

					let outputPath = options.output;

					if (!outputPath && !options.yes) {
						const defaultOutput = path.join(
							path.dirname(file),
							`${path.basename(file, '.pdf')}_reordered.pdf`,
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

					console.log(chalk.blue('Reordering PDF pages...'));

					const success = await reorderPages.reorderPages(
						file,
						newOrder,
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

	// Move page command
	program
		.command('move-page <file> <page> <direction>')
		.description('Move a page up or down (direction: up or down)')
		.option('-o, --output <path>', 'Output file path')
		.action(
			async (
				file: string,
				page: string,
				direction: string,
				options: { output?: string },
			) => {
				try {
					if (!file.toLowerCase().endsWith('.pdf')) {
						console.error(chalk.red('Error: Input must be a PDF file'));
						process.exit(1);
					}

					const pageNumber = Number.parseInt(page, 10);
					if (Number.isNaN(pageNumber) || pageNumber < 1) {
						console.error(chalk.red('Error: Invalid page number'));
						process.exit(1);
					}

					if (direction !== 'up' && direction !== 'down') {
						console.error(chalk.red('Error: Direction must be "up" or "down"'));
						process.exit(1);
					}

					console.log(
						chalk.blue(`Moving page ${pageNumber} ${direction}...`),
					);

					const success = await reorderPages.movePage(
						file,
						pageNumber,
						direction as 'up' | 'down',
						options.output,
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
