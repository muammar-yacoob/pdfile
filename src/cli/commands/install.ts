import chalk from 'chalk';
import type { Command } from 'commander';
import { showBanner } from '../../lib/banner.js';
import { wslToWindows } from '../../lib/paths.js';
import { isWSL, isWSLInteropEnabled } from '../../lib/registry.js';
import { generateRegFile, registerAllTools, unregisterAllTools } from '../registry.js';

export function registerInstallCommand(program: Command): void {
	program
		.command('install')
		.description('Install Windows shell context menu integration')
		.action(async () => {
			console.log(chalk.bold('Installing...\n'));
			showBanner();

			if (!isWSL()) {
				console.log(
					chalk.yellow('! Not running in WSL. Registry integration skipped.'),
				);
				console.log(
					chalk.yellow('! Run "pdfile install" from WSL to add context menu.'),
				);
				return;
			}

			if (!isWSLInteropEnabled()) {
				console.log(chalk.yellow('WSL Interop not available. Generating registry file...\n'));

				const regPath = await generateRegFile();
				const winPath = wslToWindows(regPath);

				console.log(chalk.green('✓ Generated registry file:'));
				console.log(chalk.cyan(`  ${winPath}\n`));
				console.log(chalk.bold('To install, either:'));
				console.log(chalk.dim('  1. Double-click the .reg file in Windows Explorer'));
				console.log(chalk.dim(`  2. Run in elevated PowerShell: reg import "${winPath}"`));
				return;
			}

			// Clean up existing entries first
			// console.log(chalk.dim('Removing old entries...'));
			await unregisterAllTools();
			await registerAllTools();

			const dim = chalk.gray;
			const cmd = chalk.cyan;
			const arg = chalk.hex('#cc8800'); // dimmer orange for <file>
			const opt = chalk.green;
			const head = chalk.white.bold;

			console.log(chalk.bold('\nContext Menu Usage:'));
			console.log('  Right-click any PDF file in Windows Explorer.');
			console.log('  Select "PDFile" to open the PDF toolkit.');
			console.log('  Multi-select supported for batch processing.');
			console.log(
				`  Supported format: ${arg('[.pdf]')}`,
			);

			console.log(head('\nCLI Usage:'));
			console.log(
				`  ${head('Usage:')} pdfile ${cmd('<command>')} ${arg('<file>')} ${opt('[options]')}`,
			);
			console.log();
			console.log(head('  PDF Tools'));
			console.log(
				`    ${cmd('merge')} ${arg('<files...>')}      Combine multiple PDFs into one`,
			);
			console.log(
				`    ${cmd('to-word')} ${arg('<file>')}        Convert PDF to Word document`,
			);
			console.log(
				`    ${cmd('add-image')} ${arg('<pdf> <img>')} Add image overlay to PDF`,
			);
			console.log();
			console.log(head('  Setup'));
			console.log(`    ${cmd('install')}              Add Windows right-click menu`);
			console.log(`    ${cmd('uninstall')}            Remove right-click menu`);
			console.log();
			console.log(head('  Config'));
			console.log(`    ${cmd('config')}               Display current settings`);
			console.log(`    ${cmd('config reset')}         Restore defaults`);
			console.log();
			console.log(head('  Prerequisites'));
			console.log('    - WSL (Windows Subsystem for Linux)');
			console.log('    - Node.js >= 18');
			console.log();
			console.log(head('  Examples'));
			console.log(`    ${dim('$')} pdfile ${cmd('merge')} ${arg('file1.pdf file2.pdf')}   ${dim('# Merge PDFs')}`);
			console.log(`    ${dim('$')} pdfile ${cmd('to-word')} ${arg('doc.pdf')}             ${dim('# Convert to Word')}`);
			console.log(`    ${dim('$')} pdfile ${cmd('add-image')} ${arg('doc.pdf logo.png')} ${dim('# Add logo')}`);
			console.log(`    ${dim('$')} pdfile ${cmd('remove-pages')} ${arg('doc.pdf')} ${opt('-p 1,3')} ${dim('# Remove pages')}`);
			console.log(`    ${dim('$')} pdfile ${cmd('reorder')} ${arg('doc.pdf')} ${opt('-n 3,1,2')}    ${dim('# Reorder pages')}`);
			console.log(
				`\n  Run "pdfile ${opt('--help')}" for full documentation.`,
			);
			console.log();
		});
}
