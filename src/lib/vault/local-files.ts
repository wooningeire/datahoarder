import {
	getLocalRoutePath,
	getPathExtension,
	isEditableTextFile,
	normalizeLocalDirectoryPath,
	normalizeLocalTextPath
} from './local-file-paths.js';
import { assertManageableLocalDirectoryPath, isIgnoredLocalDirectoryName, sortLocalVaultDirectories } from './local-directory-helpers.js';
import {
	canUseServerVault,
	createServerDirectory,
	createServerFile,
	deleteServerFile,
	getServerVaultHandle,
	isServerDirectoryHandle,
	isServerFileHandle,
	isServerVaultFile,
	moveServerFile,
	readServerVaultDirectories,
	readServerVault,
	writeServerFile
} from './local-file-server.js';
import {
	canUseTauriNativeFileAccess,
	createTauriDirectory,
	createTauriFile,
	createTauriVaultHandle,
	deleteTauriFile,
	ensureTauriVaultPreviewOrigin,
	getTauriVaultHandle,
	isTauriDirectoryHandle,
	isTauriFileHandle,
	isTauriVaultFile,
	moveTauriFile,
	pickTauriVaultHandle,
	readTauriVaultDirectories,
	readTauriVault,
	writeTauriFile
} from './local-file-tauri.js';
import { getStoredVaultHandle, storeVaultHandle } from './local-file-storage.js';
export { buildLocalVaultTree, getTextAssets } from './local-file-tree.js';

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
	write: (data: string) => Promise<void>;
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

	return files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
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

export async function writeLocalFile(file: LocalVaultFile, content: string) {
	await writeLocalFileHandle(file.handle, content);
}

export async function createLocalFile(
	root: LocalDirectoryHandle,
	path: string,
	content: string,
	defaultExtension = '.md'
) {
	const normalizedPath = normalizeLocalTextPath(path, defaultExtension);

	if (isServerDirectoryHandle(root)) {
		return createServerFile(normalizedPath, content);
	}

	if (isTauriDirectoryHandle(root)) {
		return createTauriFile(root.root, normalizedPath, content);
	}

	const { directory, fileName } = await getLocalParentDirectory(root, normalizedPath, true);

	if (!directory.getFileHandle) {
		throw new Error('This browser does not support creating files in selected folders.');
	}

	if (await localFileExists(directory, fileName)) {
		throw new Error(`A file already exists at ${normalizedPath}.`);
	}

	const handle = await directory.getFileHandle(fileName, { create: true });
	await writeLocalFileHandle(handle, content);

	return normalizedPath;
}

export async function createLocalDirectory(root: LocalDirectoryHandle, path: string) {
	const normalizedPath = normalizeLocalDirectoryPath(path);

	assertManageableLocalDirectoryPath(normalizedPath);

	if (isServerDirectoryHandle(root)) {
		return createServerDirectory(normalizedPath);
	}

	if (isTauriDirectoryHandle(root)) {
		return createTauriDirectory(root.root, normalizedPath);
	}

	const { directory, fileName } = await getLocalParentDirectory(root, normalizedPath, true);

	if (!directory.getDirectoryHandle) {
		throw new Error('This browser does not support creating folders in selected folders.');
	}

	if (await localFileExists(directory, fileName)) {
		throw new Error(`A file already exists at ${normalizedPath}.`);
	}

	if (await localDirectoryExists(directory, fileName)) {
		throw new Error(`A folder already exists at ${normalizedPath}.`);
	}

	await directory.getDirectoryHandle(fileName, { create: true });

	return normalizedPath;
}

export async function deleteLocalFile(root: LocalDirectoryHandle, path: string) {
	const normalizedPath = normalizeLocalTextPath(path, '');

	if (isServerDirectoryHandle(root)) {
		await deleteServerFile(normalizedPath);
		return;
	}

	if (isTauriDirectoryHandle(root)) {
		await deleteTauriFile(root.root, normalizedPath);
		return;
	}

	const { directory, fileName } = await getLocalParentDirectory(root, normalizedPath, false);

	if (!directory.removeEntry) {
		throw new Error('This browser does not support deleting files in selected folders.');
	}

	await directory.removeEntry(fileName);
}

export async function moveLocalFile(
	root: LocalDirectoryHandle,
	currentPath: string,
	nextPath: string,
	content: string
) {
	const normalizedCurrentPath = normalizeLocalTextPath(currentPath, '');
	const normalizedNextPath = normalizeLocalTextPath(nextPath, '');

	if (normalizedCurrentPath === normalizedNextPath) {
		return normalizedCurrentPath;
	}

	if (normalizedCurrentPath.toLowerCase() === normalizedNextPath.toLowerCase()) {
		throw new Error('Case-only renames are not supported yet.');
	}

	if (isServerDirectoryHandle(root)) {
		return moveServerFile(normalizedCurrentPath, normalizedNextPath, content);
	}

	if (isTauriDirectoryHandle(root)) {
		return moveTauriFile(root.root, normalizedCurrentPath, normalizedNextPath, content);
	}

	await createLocalFile(root, normalizedNextPath, content, '');
	await deleteLocalFile(root, normalizedCurrentPath);

	return normalizedNextPath;
}

async function writeLocalFileHandle(handle: LocalFileHandle, content: string) {
	if (isServerFileHandle(handle)) {
		await writeServerFile(handle.path, content);
		return;
	}

	if (isTauriFileHandle(handle)) {
		await writeTauriFile(handle.root, handle.path, content);
		return;
	}

	if (!handle.createWritable) {
		throw new Error('This browser does not support writing to selected files.');
	}

	const writable = await handle.createWritable();

	if ('getWriter' in writable) {
		const writer = (writable as unknown as WritableStream<string>).getWriter();
		await writer.write(content);
		await writer.close();
		return;
	}

	await writable.write(content);
	await writable.close();
}

async function getLocalParentDirectory(
	root: BrowserLocalDirectoryHandle,
	path: string,
	create: boolean
) {
	const segments = path.split('/');
	const fileName = segments.pop();

	if (!fileName) {
		throw new Error('File path is required.');
	}

	let directory: BrowserLocalDirectoryHandle = root;

	for (const segment of segments) {
		if (!directory.getDirectoryHandle) {
			throw new Error('This browser does not support nested folder access.');
		}

		directory = await directory.getDirectoryHandle(segment, { create });
	}

	return { directory, fileName };
}

async function localFileExists(directory: BrowserLocalDirectoryHandle, fileName: string) {
	if (!directory.getFileHandle) {
		return false;
	}

	try {
		await directory.getFileHandle(fileName);
		return true;
	} catch (error) {
		if (isNotFoundError(error) || isTypeMismatchError(error)) {
			return false;
		}

		throw error;
	}
}

async function localDirectoryExists(directory: BrowserLocalDirectoryHandle, directoryName: string) {
	if (!directory.getDirectoryHandle) {
		return false;
	}

	try {
		await directory.getDirectoryHandle(directoryName);
		return true;
	} catch (error) {
		if (isNotFoundError(error) || isTypeMismatchError(error)) {
			return false;
		}

		throw error;
	}
}

function isNotFoundError(error: unknown) {
	return error instanceof DOMException && error.name === 'NotFoundError';
}

function isTypeMismatchError(error: unknown) {
	return error instanceof DOMException && error.name === 'TypeMismatchError';
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


