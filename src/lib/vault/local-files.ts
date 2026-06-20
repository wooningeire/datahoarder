import {
	getLocalRoutePath,
	isEditableTextFile
} from './local-file-paths.js';
import { isIgnoredLocalDirectoryName, sortLocalVaultDirectories } from './local-directory-helpers.js';
import {
	canUseServerVault,
	getServerVaultHandle,
	isServerDirectoryHandle,
	isServerVaultFile,
	readServerVaultDirectories,
	readServerVault
} from './local-file-server.js';
import {
	canUseTauriNativeFileAccess,
	createTauriVaultHandle,
	ensureTauriVaultPreviewOrigin,
	getTauriVaultHandle,
	isTauriDirectoryHandle,
	isTauriVaultFile,
	pickTauriVaultHandle,
	readTauriVaultDirectories,
	readTauriVault
} from './local-file-tauri.js';
import { getStoredVaultHandle, storeVaultHandle } from './local-file-storage.js';
export { buildLocalVaultTree, getTextAssets } from './local-file-tree.js';
export {
	createLocalDirectory,
	moveLocalDirectory
} from './local-directory-mutations.js';
export {
	createLocalFile,
	createLocalVaultFile,
	createLocalVaultFileSnapshot,
	deleteLocalFile,
	moveLocalFile,
	moveLocalVaultFile,
	writeLocalFile
} from './local-file-mutations.js';

export {
	getLocalRoutePath,
	isEditableTextFile,
	normalizeLocalDirectoryPath,
	normalizeLocalTextPath
} from './local-file-paths.js';

export {
	canUseServerVault,
	getServerVaultHandle,
	isServerDirectoryHandle,
	isServerVaultFile
} from './local-file-server.js';

export {
	canUseTauriNativeFileAccess,
	createTauriVaultHandle,
	ensureTauriVaultPreviewOrigin,
	getTauriVaultHandle,
	isTauriDirectoryHandle,
	isTauriVaultFile,
	pickTauriVaultHandle
} from './local-file-tauri.js';

export { getStoredVaultHandle, storeVaultHandle } from './local-file-storage.js';

export type DatahoarderPermissionMode = 'read' | 'readwrite';
export type DatahoarderPermissionState = 'granted' | 'denied' | 'prompt';

export type BrowserLocalFileHandle = {
	kind: 'file';
	name: string;
	getFile: () => Promise<File>;
	createWritable?: () => Promise<WritableStreamDefaultWriter | FileSystemWritableFileStreamLike>;
	queryPermission?: (descriptor?: { mode?: DatahoarderPermissionMode }) => Promise<DatahoarderPermissionState>;
	requestPermission?: (descriptor?: { mode?: DatahoarderPermissionMode }) => Promise<DatahoarderPermissionState>;
};

export type ServerLocalFileHandle = {
	kind: 'file';
	name: string;
	path: string;
	source: 'server';
	getFile: () => Promise<File>;
};

export type TauriLocalFileHandle = {
	kind: 'file';
	name: string;
	path: string;
	previewOrigin: string;
	previewRouteBase: string;
	root: string;
	source: 'tauri';
	targetProjectRoot: string | null;
	getFile: () => Promise<File>;
};

export type LocalFileHandle = BrowserLocalFileHandle | ServerLocalFileHandle | TauriLocalFileHandle;

export type BrowserLocalDirectoryHandle = {
	kind: 'directory';
	name: string;
	entries: () => AsyncIterableIterator<[string, BrowserLocalDirectoryHandle | LocalFileHandle]>;
	getDirectoryHandle?: (
		name: string,
		options?: { create?: boolean }
	) => Promise<BrowserLocalDirectoryHandle>;
	getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<LocalFileHandle>;
	queryPermission?: (descriptor?: { mode?: DatahoarderPermissionMode }) => Promise<DatahoarderPermissionState>;
	removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>;
	requestPermission?: (descriptor?: { mode?: DatahoarderPermissionMode }) => Promise<DatahoarderPermissionState>;
};

export type ServerLocalDirectoryHandle = {
	kind: 'server-directory';
	name: string;
	root: string;
	source: 'server';
};

export type TauriLocalDirectoryHandle = {
	kind: 'tauri-directory';
	name: string;
	previewOrigin: string;
	previewRouteBase: string;
	root: string;
	source: 'tauri';
	targetProjectRoot: string | null;
};

export type LocalDirectoryHandle = BrowserLocalDirectoryHandle | ServerLocalDirectoryHandle | TauriLocalDirectoryHandle;

export type FileSystemWritableFileStreamLike = {
	write: (data: Blob | string) => Promise<void>;
	close: () => Promise<void>;
};

export type LocalVaultFile = {
	extension: string;
	handle: LocalFileHandle;
	path: string;
	routePath: string;
	size: number;
	updatedAt: number;
};

export type LocalVaultDirectory = {
	path: string;
};

type SortableLocalVaultFile = {
	path: string;
};

export const sortLocalVaultFiles = <T extends SortableLocalVaultFile>(files: T[]) => {
	return files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
};

export function canUseFileSystemAccess() {
	return (
		!canUseTauriNativeFileAccess() &&
		typeof window !== 'undefined' &&
		'showDirectoryPicker' in window &&
		'indexedDB' in window
	);
}

export async function readLocalVault(handle: LocalDirectoryHandle) {
	if (isServerDirectoryHandle(handle)) {
		return readServerVault();
	}

	if (isTauriDirectoryHandle(handle)) {
		return readTauriVault(handle);
	}

	const files: LocalVaultFile[] = [];

	await collectFiles(handle, '', files);

	return sortLocalVaultFiles(files);
}

export async function readLocalVaultDirectories(handle: LocalDirectoryHandle) {
	if (isServerDirectoryHandle(handle)) {
		return readServerVaultDirectories();
	}

	if (isTauriDirectoryHandle(handle)) {
		return readTauriVaultDirectories(handle);
	}

	const directories: LocalVaultDirectory[] = [];

	await collectDirectories(handle, '', directories);

	return sortLocalVaultDirectories(directories);
}

export async function readLocalFile(file: LocalVaultFile) {
	const blob = await file.handle.getFile();

	return blob.text();
}

export async function verifyPermission(
	handle: LocalDirectoryHandle,
	mode: DatahoarderPermissionMode,
	request = false
) {
	if (isServerDirectoryHandle(handle)) {
		return true;
	}

	if (isTauriDirectoryHandle(handle)) {
		return true;
	}

	if (!handle.queryPermission || !handle.requestPermission) {
		return true;
	}

	const options = { mode };

	if ((await handle.queryPermission(options)) === 'granted') {
		return true;
	}

	if (!request) {
		return false;
	}

	return (await handle.requestPermission(options)) === 'granted';
}

async function collectFiles(
	directory: BrowserLocalDirectoryHandle,
	parentPath: string,
	files: LocalVaultFile[]
) {
	for await (const [name, handle] of directory.entries()) {
		const path = parentPath ? `${parentPath}/${name}` : name;

		if (handle.kind === 'directory') {
			if (isIgnoredLocalDirectoryName(name)) {
				continue;
			}

			await collectFiles(handle, path, files);
			continue;
		}

		if (!isEditableTextFile(path)) {
			continue;
		}

		const blob = await handle.getFile();

		files.push({
			extension: path.includes('.') ? `.${path.split('.').at(-1) ?? ''}`.toLowerCase() : '',
			handle,
			path,
			routePath: getLocalRoutePath(path),
			size: blob.size,
			updatedAt: blob.lastModified
		});
	}
}

async function collectDirectories(
	directory: BrowserLocalDirectoryHandle,
	parentPath: string,
	directories: LocalVaultDirectory[]
) {
	for await (const [name, handle] of directory.entries()) {
		if (handle.kind !== 'directory' || isIgnoredLocalDirectoryName(name)) {
			continue;
		}

		const path = parentPath ? `${parentPath}/${name}` : name;

		directories.push({ path });
		await collectDirectories(handle, path, directories);
	}
}


