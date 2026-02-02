import type { Command } from 'commander';
import chalk from 'chalk';
import { runGUI } from '../../tools/pdfile-main.js';

/**
 * Register the unified pdfile GUI command
 */
export function registerPdfileCommand(program: Command): void {
	program
		.command('pdfile <file>')
		.description('Open unified PDFile GUI with all tools')
		.option('-g, --gui', 'Open GUI window (default)')
		.action(async (file: string) => {
			try {
				const success = await runGUI(file);
				process.exit(success ? 0 : 1);
			} catch (error) {
				console.error(chalk.red(`Error: ${(error as Error).message}`));
				process.exit(1);
			}
		});
}
