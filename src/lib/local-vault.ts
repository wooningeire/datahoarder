import type { NoteTreeDirectory, NoteTreeNode } from './note-tree.js';
import {
	getNoteExtension,
	stripCompiledNoteExtension,
	type VaultRouteConfig
} from './paths.js';

export type DatahoarderPermissionMode = 'read' | 'readwrite';
export type DatahoarderPermissionState = 'granted' | 'denied' | 'prompt';

export type LocalFileHandle = {
	kind: 'file';
	name: string;
	getFile: () => Promise<File>;
	createWritable?: () => Promise<WritableStreamDefaultWriter | FileSystemWritableFileStreamLike>;
	queryPermission?: (descriptor?: { mode?: DatahoarderPermissionMode }) => Promise<DatahoarderPermissionState>;
	requestPermission?: (descriptor?: { mode?: DatahoarderPermissionMode }) => Promise<DatahoarderPermissionState>;
};

export type LocalDirectoryHandle = {
	kind: 'directory';
	name: string;
	entries: () => AsyncIterableIterator<[string, LocalDirectoryHandle | LocalFileHandle]>;
	getDirectoryHandle?: (
		name: string,
		options?: { create?: boolean }
	) => Promise<LocalDirectoryHandle>;
	getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<LocalFileHandle>;
	queryPermission?: (descriptor?: { mode?: DatahoarderPermissionMode }) => Promise<DatahoarderPermissionState>;
	removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>;
	requestPermission?: (descriptor?: { mode?: DatahoarderPermissionMode }) => Promise<DatahoarderPermissionState>;
};

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

const databaseName = 'datahoarder-local-vault';
const objectStoreName = 'handles';
const vaultHandleKey = 'vault-directory-handle';
const textExtensionPattern = /\.(base|css|csv|html|js|json|md|scss|svelte|svx|ts|txt|yaml|yml)$/iu;

export function canUseFileSystemAccess() {
	return typeof window !== 'undefined' && 'showDirectoryPicker' in window && 'indexedDB' in window;
}

export async function readLocalVault(handle: LocalDirectoryHandle) {
	const files: LocalVaultFile[] = [];

	await collectFiles(handle, '', files);

	return files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
}

export function buildLocalVaultTree(files: LocalVaultFile[], _config: VaultRouteConfig = {}) {
	const root: NoteTreeDirectory = {
		kind: 'directory',
		name: '',
		path: '',
		children: []
	};
	const directoryLookup = new Map<string, NoteTreeDirectory>([['', root]]);

	for (const file of files) {
		const segments = file.path.split('/');
		const fileName = segments.pop();

		if (!fileName) {
			continue;
		}

		let parent = root;
		let parentPath = '';

		for (const segment of segments) {
			parentPath = parentPath ? `${parentPath}/${segment}` : segment;

			let directory = directoryLookup.get(parentPath);

			if (!directory) {
				directory = {
					kind: 'directory',
					name: segment,
					path: parentPath,
					children: []
				};

				directoryLookup.set(parentPath, directory);
				parent.children.push(directory);
			}

			parent = directory;
		}

		parent.children.push({
			kind: 'file',
			name: fileName,
			path: file.path,
			href: file.routePath
		});
	}

	sortLocalTree(root.children);
	return root.children;
}

export function getTextAssets(files: LocalVaultFile[]) {
	return files.filter((file) => isEditableTextFile(file.path) && !getNoteExtension(file.path));
}

export function isEditableTextFile(path: string) {
	return textExtensionPattern.test(path);
}

export function getLocalRoutePath(path: string) {
	if (path.endsWith('.base')) {
		return path;
	}

	return stripCompiledNoteExtension(path);
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

export async function deleteLocalFile(root: LocalDirectoryHandle, path: string) {
	const normalizedPath = normalizeLocalTextPath(path, '');
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
	const normalizedNextPath = normalizeLocalTextPath(
		nextPath,
		getPathExtension(normalizedCurrentPath) || '.md'
	);

	if (normalizedCurrentPath === normalizedNextPath) {
		return normalizedCurrentPath;
	}

	if (normalizedCurrentPath.toLowerCase() === normalizedNextPath.toLowerCase()) {
		throw new Error('Case-only renames are not supported yet.');
	}

	await createLocalFile(root, normalizedNextPath, content, '');
	await deleteLocalFile(root, normalizedCurrentPath);

	return normalizedNextPath;
}

export function normalizeLocalTextPath(path: string, defaultExtension = '.md') {
	const trimmedPath = path.trim().replace(/\\/gu, '/');

	if (!trimmedPath) {
		throw new Error('File path is required.');
	}

	if (/^(?:[a-z]:)?\//iu.test(trimmedPath) || /^[a-z]:/iu.test(trimmedPath)) {
		throw new Error('Use a path relative to the opened vault.');
	}

	const segments = trimmedPath
		.replace(/^\.\/+/u, '')
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean);

	if (!segments.length) {
		throw new Error('File path is required.');
	}

	if (segments.some((segment) => segment === '.' || segment === '..')) {
		throw new Error('File paths cannot contain . or .. segments.');
	}

	if (segments.some((segment) => /[<>:"|?*\u0000-\u001f]/u.test(segment))) {
		throw new Error('File paths cannot contain Windows-reserved characters.');
	}

	let normalizedPath = segments.join('/');

	if (defaultExtension && !getPathExtension(normalizedPath)) {
		normalizedPath = `${normalizedPath}${defaultExtension}`;
	}

	if (!isEditableTextFile(normalizedPath)) {
		throw new Error('Only editable text files can be managed here.');
	}

	return normalizedPath;
}

async function writeLocalFileHandle(handle: LocalFileHandle, content: string) {
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
	root: LocalDirectoryHandle,
	path: string,
	create: boolean
) {
	const segments = path.split('/');
	const fileName = segments.pop();

	if (!fileName) {
		throw new Error('File path is required.');
	}

	let directory = root;

	for (const segment of segments) {
		if (!directory.getDirectoryHandle) {
			throw new Error('This browser does not support nested folder access.');
		}

		directory = await directory.getDirectoryHandle(segment, { create });
	}

	return { directory, fileName };
}

async function localFileExists(directory: LocalDirectoryHandle, fileName: string) {
	if (!directory.getFileHandle) {
		return false;
	}

	try {
		await directory.getFileHandle(fileName);
		return true;
	} catch (error) {
		if (isNotFoundError(error)) {
			return false;
		}

		throw error;
	}
}

function isNotFoundError(error: unknown) {
	return error instanceof DOMException && error.name === 'NotFoundError';
}

function getPathExtension(path: string) {
	const fileName = path.split('/').at(-1) ?? '';
	const extensionIndex = fileName.lastIndexOf('.');

	return extensionIndex > 0 ? fileName.slice(extensionIndex).toLowerCase() : '';
}

export async function verifyPermission(
	handle: LocalDirectoryHandle,
	mode: DatahoarderPermissionMode,
	request = false
) {
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

export async function getStoredVaultHandle() {
	const database = await openHandleDatabase();
	const transaction = database.transaction(objectStoreName, 'readonly');
	const request = transaction.objectStore(objectStoreName).get(vaultHandleKey);

	return requestValue<LocalDirectoryHandle | undefined>(request);
}

export async function storeVaultHandle(handle: LocalDirectoryHandle) {
	const database = await openHandleDatabase();
	const transaction = database.transaction(objectStoreName, 'readwrite');
	const request = transaction.objectStore(objectStoreName).put(handle, vaultHandleKey);

	await requestValue(request);
}

async function collectFiles(
	directory: LocalDirectoryHandle,
	parentPath: string,
	files: LocalVaultFile[]
) {
	for await (const [name, handle] of directory.entries()) {
		const path = parentPath ? `${parentPath}/${name}` : name;

		if (handle.kind === 'directory') {
			if (name === 'node_modules' || name === '.git' || name === '.svelte-kit') {
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

function openHandleDatabase() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(databaseName, 1);

		request.onupgradeneeded = () => {
			request.result.createObjectStore(objectStoreName);
		};
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
}

function requestValue<T>(request: IDBRequest<T>) {
	return new Promise<T>((resolve, reject) => {
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
}

function sortLocalTree(nodes: NoteTreeNode[]) {
	nodes.sort((a, b) => {
		if (a.kind !== b.kind) {
			return a.kind === 'directory' ? -1 : 1;
		}

		return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
	});

	for (const node of nodes) {
		if (node.kind === 'directory') {
			sortLocalTree(node.children);
		}
	}
}
