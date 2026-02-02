import * as pdfileMain from '../tools/pdfile-main.js';
import * as mergePdfs from '../tools/merge-pdfs.js';
import * as pdfToWord from '../tools/pdf-to-word.js';
import * as addImageOverlay from '../tools/add-image-overlay.js';
import * as removePages from '../tools/remove-pages.js';
import * as reorderPages from '../tools/reorder-pages.js';

/** Tool configuration */
export interface ToolConfig {
	id: string;
	name: string;
	icon: string;
	extensions: string[];
}

/** Tool with config and run function */
export interface Tool {
	config: ToolConfig;
	run: (file: string) => Promise<boolean>;
	runGUI?: (file: string) => Promise<boolean>;
}

/** Unified tool (GUI only) */
export interface UnifiedTool {
	config: ToolConfig;
	runGUI: (file: string) => Promise<boolean>;
}

/** All available tools (individual PDF tools) */
export const tools: Tool[] = [];

/** Unified PDFile tool (all-in-one) */
export const pdfileTool: UnifiedTool = {
	config: pdfileMain.config,
	runGUI: pdfileMain.runGUI,
};

/** Tools that use TUI (terminal GUI) mode */
export const tuiTools: string[] = [];

/** Get tool by ID */
export function getTool(id: string): Tool | undefined {
	return tools.find((t) => t.config.id === id);
}

/** Get all unique extensions from tools */
export function getAllExtensions(): string[] {
	const extensions = new Set<string>();
	for (const { config } of tools) {
		for (const ext of config.extensions) {
			extensions.add(ext);
		}
	}
	return Array.from(extensions);
}

/** Get tools that support a given extension */
export function getToolsForExtension(extension: string): Tool[] {
	return tools.filter((t) => t.config.extensions.includes(extension));
}
