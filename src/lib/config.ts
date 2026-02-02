import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** PDFile configuration */
export interface PDFileConfig {
	compression: {
		enabled: boolean;
		quality: 'low' | 'medium' | 'high';
	};
	output: {
		useSubdirectory: boolean;
		subdirectoryName: string;
	};
}

/** Default configuration */
export const DEFAULT_CONFIG: PDFileConfig = {
	compression: {
		enabled: true,
		quality: 'high',
	},
	output: {
		useSubdirectory: true,
		subdirectoryName: 'PDFile',
	},
};

/** Get config directory path */
function getConfigDir(): string {
	return join(homedir(), '.config', 'pdfile');
}

/** Get config file path */
export function getConfigPath(): string {
	return join(getConfigDir(), 'config.json');
}

/** Load configuration from file */
export function loadConfig(): PDFileConfig {
	const configPath = getConfigPath();

	if (!existsSync(configPath)) {
		return { ...DEFAULT_CONFIG };
	}

	try {
		const content = readFileSync(configPath, 'utf-8');
		const loaded = JSON.parse(content) as Partial<PDFileConfig>;
		return {
			compression: { ...DEFAULT_CONFIG.compression, ...loaded.compression },
			output: { ...DEFAULT_CONFIG.output, ...loaded.output },
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

/** Save configuration to file */
export function saveConfig(config: PDFileConfig): void {
	const configPath = getConfigPath();
	const configDir = dirname(configPath);

	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}

	writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/** Reset configuration to defaults */
export function resetConfig(): void {
	const configPath = getConfigPath();
	const configDir = dirname(configPath);

	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}

	writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
}
