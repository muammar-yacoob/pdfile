import chalk from 'chalk';
import type { Command } from 'commander';
import prompts from 'prompts';
import * as path from 'node:path';
import * as pdfToWord from '../../tools/pdf-to-word.js';

export function registerPdfToWordCommand(program: Command): void {
	program
		.command('to-word <file>')
		.description('Convert PDF to Word document')
		.option('-o, --output <path>', 'Output file path')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.action(
			async (file: string, options: { output?: string; yes?: boolean }) => {
				try {
					if (!file.toLowerCase().endsWith('.pdf')) {
						console.error(chalk.red('Error: Input must be a PDF file'));
						process.exit(1);
					}

					let outputPath = options.output;

					if (!outputPath && !options.yes) {
						const defaultOutput = path.join(
							path.dirname(file),
							`${path.basename(file, '.pdf')}_converted.docx`,
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

					console.log(chalk.blue('Converting PDF to Word document...'));

					const success = await pdfToWord.pdfToWord(file, outputPath);
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
