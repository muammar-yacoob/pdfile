import chalk from 'chalk';
import type { Command } from 'commander';
import prompts from 'prompts';
import * as path from 'node:path';
import * as mergePdfs from '../../tools/merge-pdfs.js';

export function registerMergePdfsCommand(program: Command): void {
	program
		.command('merge <files...>')
		.description('Combine multiple PDF files into one')
		.option('-o, --output <path>', 'Output file path')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.action(
			async (
				files: string[],
				options: { output?: string; yes?: boolean },
			) => {
				try {
					if (files.length < 2) {
						console.error(
							chalk.red('Error: At least 2 PDF files are required to merge'),
						);
						process.exit(1);
					}

					// Validate all files are PDFs
					const invalidFiles = files.filter(
						(file) => !file.toLowerCase().endsWith('.pdf'),
					);

					if (invalidFiles.length > 0) {
						console.error(chalk.red('Invalid file types (must be PDF):'));
						for (const file of invalidFiles) {
							console.error(chalk.red(`  - ${file}`));
						}
						process.exit(1);
					}

					let outputPath = options.output;

					if (!outputPath && !options.yes) {
						const defaultOutput = path.join(
							path.dirname(files[0]),
							`merged_${Date.now()}.pdf`,
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

					console.log(chalk.blue(`Merging ${files.length} PDF files...`));

					const success = await mergePdfs.mergePdfs(files, outputPath);
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
