import type { NoteTreeDirectory, NoteTreeNode } from '../note-model/tree.js';
import {
	getNoteExtension,
	stripCompiledNoteExtension,
	type VaultRouteConfig
} from './paths.js';

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

const databaseName = 'datahoarder-local-vault';
const objectStoreName = 'handles';
const tauriVaultRootStorageKey = 'datahoarder-tauri-vault-root';
const vaultHandleKey = 'vault-directory-handle';
const textExtensionPattern = /\.(base|css|csv|html|js|json|md|scss|svelte|svx|ts|txt|yaml|yml)$/iu;

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type TauriHostWindow = Window & {
	__TAURI__?: {
		core?: {
			invoke?: TauriInvoke;
		};
	};
	__TAURI_INTERNALS__?: {
		invoke?: TauriInvoke;
	};
};

type ServerVaultMetadata = {
	enabled: boolean;
	name: string;
	root: string;
};

type ServerVaultFileResponse = {
	extension: string;
	path: string;
	routePath: string;
	size: number;
	updatedAt: number;
};

type TauriVaultMetadataResponse = {
	name: string;
	previewOrigin?: string;
	previewRouteBase?: string;
	root: string;
	targetProjectRoot?: string | null;
};

type TauriVaultFileResponse = {
	path: string;
	size: number;
	updatedAt: number;
};

export function canUseTauriNativeFileAccess() {
	return Boolean(getTauriInvoke());
}

export function canUseFileSystemAccess() {
	return (
		!canUseTauriNativeFileAccess() &&
		typeof window !== 'undefined' &&
		'showDirectoryPicker' in window &&
		'indexedDB' in window
	);
}

export async function getTauriVaultHandle(root?: string) {
	if (!canUseTauriNativeFileAccess()) {
		return null;
	}

	if (root?.trim()) {
		return createTauriVaultHandle(root);
	}

	const defaultMetadata = await tauriCommand<TauriVaultMetadataResponse | null>(
		'datahoarder_default_vault_root'
	);

	if (defaultMetadata) {
		return createTauriDirectoryHandle(defaultMetadata);
	}

	const storedRoot = getStoredTauriVaultRoot();

	if (!storedRoot) {
		return null;
	}

	try {
		return await createTauriVaultHandle(storedRoot);
	} catch {
		clearStoredTauriVaultRoot();
		return null;
	}
}

export async function createTauriVaultHandle(root: string) {
	const metadata = await tauriCommand<TauriVaultMetadataResponse>(
		'datahoarder_validate_vault_root',
		{ root }
	);

	return createTauriDirectoryHandle(metadata);
}

export async function pickTauriVaultHandle() {
	const metadata = await tauriCommand<TauriVaultMetadataResponse | null>(
		'datahoarder_pick_vault_root'
	);

	return metadata ? createTauriDirectoryHandle(metadata) : null;
}

export async function getServerVaultHandle() {
	const metadata = await fetchServerVaultMetadata();

	if (!metadata?.enabled) {
		return null;
	}

	return {
		kind: 'server-directory',
		name: metadata.name,
		root: metadata.root,
		source: 'server'
	} satisfies ServerLocalDirectoryHandle;
}

export async function canUseServerVault() {
	return Boolean(await getServerVaultHandle());
}

export function isServerDirectoryHandle(handle: LocalDirectoryHandle | null): handle is ServerLocalDirectoryHandle {
	return handle?.kind === 'server-directory';
}

export function isTauriDirectoryHandle(handle: LocalDirectoryHandle | null): handle is TauriLocalDirectoryHandle {
	return handle?.kind === 'tauri-directory';
}

export function isServerVaultFile(file: LocalVaultFile | null | undefined) {
	return Boolean(file && 'source' in file.handle && file.handle.source === 'server');
}

export function isTauriVaultFile(
	file: LocalVaultFile | null | undefined
): file is LocalVaultFile & { handle: TauriLocalFileHandle } {
	return Boolean(file && isTauriFileHandle(file.handle));
}

export async function ensureTauriVaultPreviewOrigin(file: LocalVaultFile | null | undefined) {
	if (!isTauriVaultFile(file)) {
		return '';
	}

	if (file.handle.previewOrigin) {
		return file.handle.previewOrigin;
	}

	const metadata = await tauriCommand<TauriVaultMetadataResponse>(
		'datahoarder_ensure_vault_preview_origin',
		{ root: file.handle.root }
	);
	const previewOrigin = metadata.previewOrigin ?? '';

	if (!previewOrigin) {
		return '';
	}

	file.handle.previewOrigin = previewOrigin;
	file.handle.previewRouteBase = metadata.previewRouteBase ?? '/notes';
	file.handle.targetProjectRoot = metadata.targetProjectRoot ?? null;

	return previewOrigin;
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
	const fileName = path.replace(/\\/gu, '/').split('/').at(-1) ?? '';

	if (!fileName || fileName.startsWith('.')) {
		return false;
	}

	return !fileName.includes('.') || textExtensionPattern.test(fileName);
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

export async function getStoredVaultHandle() {
	if (canUseTauriNativeFileAccess()) {
		return undefined;
	}

	if (typeof indexedDB === 'undefined') {
		return undefined;
	}

	const database = await openHandleDatabase();
	const transaction = database.transaction(objectStoreName, 'readonly');
	const request = transaction.objectStore(objectStoreName).get(vaultHandleKey);

	return requestValue<LocalDirectoryHandle | undefined>(request);
}

export async function storeVaultHandle(handle: LocalDirectoryHandle) {
	if (isServerDirectoryHandle(handle)) {
		return;
	}

	if (isTauriDirectoryHandle(handle)) {
		storeTauriVaultRoot(handle.root);
		return;
	}

	const database = await openHandleDatabase();
	const transaction = database.transaction(objectStoreName, 'readwrite');
	const request = transaction.objectStore(objectStoreName).put(handle, vaultHandleKey);

	await requestValue(request);
}

async function collectFiles(
	directory: BrowserLocalDirectoryHandle,
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

async function fetchServerVaultMetadata() {
	if (typeof fetch === 'undefined') {
		return null;
	}

	try {
		const response = await fetch('/api/vault', { cache: 'no-store' });

		if (!response.ok) {
			return null;
		}

		return (await response.json()) as ServerVaultMetadata;
	} catch {
		return null;
	}
}

async function readServerVault() {
	const response = await serverRequest<ServerVaultFileResponse[]>('/api/vault/files');

	return response.map(createServerVaultFile);
}

async function readTauriVault(handle: TauriLocalDirectoryHandle) {
	const response = await tauriCommand<TauriVaultFileResponse[]>(
		'datahoarder_list_vault_files',
		{ root: handle.root }
	);

	return response.map((file) => createTauriVaultFile(handle, file));
}

function createServerVaultFile(file: ServerVaultFileResponse): LocalVaultFile {
	return {
		...file,
		handle: {
			kind: 'file',
			name: file.path.split('/').at(-1) ?? file.path,
			path: file.path,
			source: 'server',
			getFile: async () => {
				const content = await readServerFile(file.path);
				return new File([content], file.path.split('/').at(-1) ?? file.path, {
					lastModified: file.updatedAt,
					type: 'text/plain'
				});
			}
		}
	};
}

function createTauriDirectoryHandle(metadata: TauriVaultMetadataResponse): TauriLocalDirectoryHandle {
	return {
		kind: 'tauri-directory',
		name: metadata.name,
		previewOrigin: metadata.previewOrigin ?? '',
		previewRouteBase: metadata.previewRouteBase ?? '/notes',
		root: metadata.root,
		source: 'tauri',
		targetProjectRoot: metadata.targetProjectRoot ?? null
	};
}

function createTauriVaultFile(handle: TauriLocalDirectoryHandle, file: TauriVaultFileResponse): LocalVaultFile {
	const extension = getPathExtension(file.path);

	return {
		extension,
		handle: {
			kind: 'file',
			name: file.path.split('/').at(-1) ?? file.path,
			path: file.path,
			previewOrigin: handle.previewOrigin,
			previewRouteBase: handle.previewRouteBase,
			root: handle.root,
			source: 'tauri',
			targetProjectRoot: handle.targetProjectRoot,
			getFile: async () => {
				const content = await readTauriFile(handle.root, file.path);
				return new File([content], file.path.split('/').at(-1) ?? file.path, {
					lastModified: file.updatedAt,
					type: 'text/plain'
				});
			}
		},
		path: file.path,
		routePath: getLocalRoutePath(file.path),
		size: file.size,
		updatedAt: file.updatedAt
	};
}

function isServerFileHandle(handle: LocalFileHandle): handle is ServerLocalFileHandle {
	return 'source' in handle && handle.source === 'server';
}

function isTauriFileHandle(handle: LocalFileHandle): handle is TauriLocalFileHandle {
	return 'source' in handle && handle.source === 'tauri';
}

async function readServerFile(path: string) {
	const response = await fetch(`/api/vault/file?path=${encodeURIComponent(path)}`, {
		cache: 'no-store'
	});

	if (!response.ok) {
		throw new Error(await getServerResponseError(response));
	}

	return response.text();
}

async function writeServerFile(path: string, content: string) {
	await serverRequest('/api/vault/file', {
		body: JSON.stringify({ content, path }),
		headers: { 'content-type': 'application/json' },
		method: 'PUT'
	});
}

async function createServerFile(path: string, content: string) {
	const result = await serverRequest<{ path: string }>('/api/vault/file', {
		body: JSON.stringify({ content, path }),
		headers: { 'content-type': 'application/json' },
		method: 'POST'
	});

	return result.path;
}

async function deleteServerFile(path: string) {
	await serverRequest('/api/vault/file', {
		body: JSON.stringify({ path }),
		headers: { 'content-type': 'application/json' },
		method: 'DELETE'
	});
}

async function moveServerFile(currentPath: string, nextPath: string, content: string) {
	const result = await serverRequest<{ path: string }>('/api/vault/file', {
		body: JSON.stringify({ content, currentPath, nextPath }),
		headers: { 'content-type': 'application/json' },
		method: 'PATCH'
	});

	return result.path;
}

async function readTauriFile(root: string, path: string) {
	return tauriCommand<string>('datahoarder_read_vault_file', { path, root });
}

async function writeTauriFile(root: string, path: string, content: string) {
	await tauriCommand('datahoarder_write_vault_file', { content, path, root });
}

async function createTauriFile(root: string, path: string, content: string) {
	return tauriCommand<string>('datahoarder_create_vault_file', { content, path, root });
}

async function deleteTauriFile(root: string, path: string) {
	await tauriCommand('datahoarder_delete_vault_file', { path, root });
}

async function moveTauriFile(root: string, currentPath: string, nextPath: string, content: string) {
	return tauriCommand<string>('datahoarder_move_vault_file', {
		content,
		currentPath,
		nextPath,
		root
	});
}

async function serverRequest<T = unknown>(url: string, init?: RequestInit) {
	const response = await fetch(url, {
		cache: 'no-store',
		...init
	});

	if (!response.ok) {
		throw new Error(await getServerResponseError(response));
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

async function getServerResponseError(response: Response) {
	try {
		const payload = (await response.json()) as { message?: string };
		return payload.message || response.statusText;
	} catch {
	return response.statusText;
	}
}

async function tauriCommand<T>(command: string, args?: Record<string, unknown>) {
	const invoke = getTauriInvoke();

	if (!invoke) {
		throw new Error('Tauri native file access is not available.');
	}

	try {
		return await invoke<T>(command, args);
	} catch (error) {
		throw normalizeTauriCommandError(error);
	}
}

function getTauriInvoke() {
	if (typeof window === 'undefined') {
		return null;
	}

	const host = window as unknown as TauriHostWindow;

	return host.__TAURI__?.core?.invoke ?? host.__TAURI_INTERNALS__?.invoke ?? null;
}

function normalizeTauriCommandError(error: unknown) {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === 'string') {
		return new Error(error);
	}

	if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
		return new Error(error.message);
	}

	return new Error('Unknown Tauri error');
}

function getStoredTauriVaultRoot() {
	try {
		return localStorage.getItem(tauriVaultRootStorageKey) ?? '';
	} catch {
		return '';
	}
}

function storeTauriVaultRoot(root: string) {
	try {
		localStorage.setItem(tauriVaultRootStorageKey, root);
	} catch {
		// Native access still works without persisted folder history.
	}
}

function clearStoredTauriVaultRoot() {
	try {
		localStorage.removeItem(tauriVaultRootStorageKey);
	} catch {
		// Native access still works without persisted folder history.
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
