import { isDatahoarderBoardFile } from '../../boards/local-board.js';
import {
	isServerVaultFile,
	isTauriVaultFile,
	type LocalVaultFile
} from '../../vault/local-files.js';
import {
	getSvelteKitRoutePath,
	isSvelteKitRoutePreviewFile
} from '../../shared/sveltekit-routes.js';

export function shouldFrameServerPreview(file: LocalVaultFile | null, _content: string) {
	if (!file) {
		return false;
	}

	if (isSvelteKitRoutePreviewFile(file.path)) {
		return true;
	}

	if (!isServerVaultFile(file)) {
		return false;
	}

	if (file.extension === '.base') {
		return false;
	}

	return (
		file.extension === '.md' ||
		file.extension === '.svx' ||
		file.extension === '.svelte' ||
		isDatahoarderBoardFile(file.path)
	);
}

export function getServerPreviewRoute(
	file: LocalVaultFile | null,
	options: { reloadToken?: number } = {}
) {
	if (!file) {
		return '';
	}

	const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
	const params = new URLSearchParams({ v: String(file.updatedAt) });

	if (options.reloadToken !== undefined) {
		params.set('r', String(options.reloadToken));
	}

	return `/preview/${encodedPath}?${params.toString()}`;
}

export function getSelectedServerPreviewRoute(
	file: LocalVaultFile | null,
	content: string,
	options: { reloadToken?: number } = {}
) {
	if (!file) {
		return '';
	}

	if (isSvelteKitRoutePreviewFile(file.path)) {
		return isTauriVaultFile(file) ? '' : getServerPreviewRoute(file, options);
	}

	return shouldFrameServerPreview(file, content) ? getServerPreviewRoute(file, options) : '';
}

export function getTargetPreviewRoute(file: LocalVaultFile | null, previewOrigin = '') {
	if (!file || !isTauriVaultFile(file)) {
		return '';
	}

	const origin = file.handle.previewOrigin || previewOrigin;

	if (!origin) {
		return '';
	}

	const routePath = getSvelteKitRoutePath(file.path);

	if (routePath === null) {
		return '';
	}

	return new URL(routePath || '/', origin).href;
}

export function getTargetPreviewNotice(
	file: LocalVaultFile | null,
	previewRoute: string,
	error: string
) {
	if (!file || !isTauriVaultFile(file) || !isSvelteKitRoutePreviewFile(file.path) || previewRoute) {
		return null;
	}

	if (error) {
		return {
			description: error,
			title: 'Target Preview Failed'
		};
	}

	return {
		description: `Starting the target Deno server for ${file.path}.`,
		title: 'Starting Preview'
	};
}

export function getMissingTargetPreviewMessage(path: string) {
	return `Datahoarder could not start or find the target Deno server for ${path}.`;
}

export function getTargetPreviewErrorMessage(error: unknown) {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (typeof error === 'string' && error.trim()) {
		return error;
	}

	return 'Datahoarder could not start or find the target Deno server.';
}

export { isSvelteKitRoutePreviewFile };
