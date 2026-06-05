import { isDatahoarderBoardFile } from '../../boards/local-board.js';
import { isWhiteboardNote } from '../../note-model/raw.js';
import {
	isServerVaultFile,
	type LocalVaultFile
} from '../../vault/local-files.js';

export function shouldFrameServerPreview(file: LocalVaultFile | null, content: string) {
	if (!file) {
		return false;
	}

	if (isSvelteKitRoutePreviewFile(file.path)) {
		return true;
	}

	if (!isServerVaultFile(file)) {
		return false;
	}

	if (file.extension === '.base' || (file.extension === '.svx' && isWhiteboardNote(content))) {
		return false;
	}

	return (
		file.extension === '.md' ||
		file.extension === '.svx' ||
		file.extension === '.svelte' ||
		isDatahoarderBoardFile(file.path)
	);
}

export function getServerPreviewRoute(file: LocalVaultFile | null) {
	if (!file) {
		return '';
	}

	const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
	const params = new URLSearchParams({ v: String(file.updatedAt) });

	return `/preview/${encodedPath}?${params.toString()}`;
}

export function isSvelteKitRoutePreviewFile(path: string) {
	const normalizedPath = path.replace(/\\/gu, '/');
	const fileName = normalizedPath.split('/').at(-1) ?? '';

	return (
		(normalizedPath.startsWith('src/routes/') || normalizedPath.includes('/src/routes/')) &&
		/^\+(?:page|layout)(?:@[^.]+)?(?:\.server)?\.(?:svelte|ts|js)$/u.test(fileName)
	);
}
