import type { LocalVaultFile } from '../local-vault.js';

export function getEditorLanguage(file: LocalVaultFile | null) {
	if (!file) {
		return 'markdown';
	}

	switch (file.extension) {
		case '.base':
		case '.yaml':
		case '.yml':
			return 'yaml';
		case '.css':
		case '.scss':
			return 'css';
		case '.html':
			return 'html';
		case '.js':
			return 'javascript';
		case '.json':
			return 'json';
		case '.svelte':
			return 'html';
		case '.ts':
			return 'typescript';
		default:
			return 'markdown';
	}
}
