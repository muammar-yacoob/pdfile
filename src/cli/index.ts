import chalk from 'chalk';
import { Command } from 'commander';
import { showBanner } from '../lib/banner.js';
import { registerConfigCommand } from './commands/config.js';
import { registerHelpCommand } from './commands/help.js';
import { registerInstallCommand } from './commands/install.js';
import { registerUninstallCommand } from './commands/uninstall.js';
import { registerMergePdfsCommand } from './commands/merge-pdfs.js';
import { registerPdfToWordCommand } from './commands/pdf-to-word.js';
import { registerRemovePagesCommand } from './commands/remove-pages.js';
import { registerReorderPagesCommand } from './commands/reorder-pages.js';
import { registerInsertDateCommand } from './commands/insert-date.js';
import { registerAddSignatureCommand } from './commands/add-signature.js';
import { registerPdfileCommand } from './commands/pdfile.js';

export function showHelp(): void {
	showBanner();

	const dim = chalk.gray;
	const cmd = chalk.cyan;
	const arg = chalk.hex('#cc8800'); // dimmer orange for <file>
	const opt = chalk.green;
	const head = chalk.white.bold;

	console.log(
		`  ${head('Usage:')} pdfile ${cmd('<command>')} ${arg('<file>')} ${opt('[options]')}`,
	);
	console.log();
	console.log(head('  PDF Tools'));
	console.log(
		`    ${cmd('merge')} ${arg('<files...>')}          Combine multiple PDFs into one`,
	);
	console.log(
		`    ${cmd('to-word')} ${arg('<file>')}            Convert PDF to Word document`,
	);
	console.log(
		`    ${cmd('sign')} ${arg('<pdf> <signature>')}    Add signature to PDF`,
	);
	console.log(
		`    ${cmd('insert-date')} ${arg('<file>')}        Insert today's date`,
	);
	console.log(
		`    ${cmd('remove-pages')} ${arg('<file>')}       Remove specific pages from PDF`,
	);
	console.log(
		`    ${cmd('reorder')} ${arg('<file>')}            Reorder pages in PDF`,
	);
	console.log(
		`    ${cmd('move-page')} ${arg('<file> <page> <dir>')} Move page up or down`,
	);
	console.log();
	console.log(head('  Setup'));
	console.log(
		`    ${cmd('install')}                     Add Windows right-click menu`,
	);
	console.log(`    ${cmd('uninstall')}                   Remove right-click menu`);
	console.log();
	console.log(head('  Config'));
	console.log(`    ${cmd('config')}                      Display current settings`);
	console.log(`    ${cmd('config reset')}                Restore defaults`);
	console.log();
	console.log(head('  Examples'));
	console.log(`    ${dim('$')} pdfile ${cmd('merge')} ${arg('file1.pdf file2.pdf')}              ${dim('# Merge PDFs')}`);
	console.log(`    ${dim('$')} pdfile ${cmd('to-word')} ${arg('doc.pdf')}                        ${dim('# Convert to Word')}`);
	console.log(`    ${dim('$')} pdfile ${cmd('sign')} ${arg('doc.pdf signature.png')}           ${dim('# Add signature')}`);
	console.log(`    ${dim('$')} pdfile ${cmd('insert-date')} ${arg('doc.pdf')}                    ${dim("# Insert today's date")}`);
	console.log(`    ${dim('$')} pdfile ${cmd('remove-pages')} ${arg('doc.pdf')} ${opt('-p 1,3,5')}         ${dim('# Remove pages')}`);
	console.log(`    ${dim('$')} pdfile ${cmd('reorder')} ${arg('doc.pdf')} ${opt('-n 3,1,2')}               ${dim('# Reorder pages')}`);
	console.log();
	console.log(head('  Features'));
	console.log('    - All exports are compressed for optimal file size');
	console.log('    - Powered by pdf-lib for reliable PDF manipulation');
	console.log();
}

export function createProgram(): Command {
	const program = new Command();

	// Override default help; show our custom help for both -h/--help
	program.helpInformation = () => '';
	program.on('--help', () => {
		showHelp();
	});

	program
		.name('pdfile')
		.description('Comprehensive PDF utility toolkit for document manipulation')
		.version('1.0.0')
		.action(() => {
			showHelp();
		});

	// Register all commands
	registerHelpCommand(program);
	registerInstallCommand(program);
	registerUninstallCommand(program);
	registerMergePdfsCommand(program);
	registerPdfToWordCommand(program);
	registerAddSignatureCommand(program);
	registerInsertDateCommand(program);
	registerRemovePagesCommand(program);
	registerReorderPagesCommand(program);
	registerConfigCommand(program);
	registerPdfileCommand(program);

	return program;
}

export * from './tools.js';
export * from './utils.js';
export * from './registry.js';
