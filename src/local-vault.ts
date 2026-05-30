import { buildNoteTree } from './note-tree';
import {
	getNoteExtension,
	getVaultRouteConfig,
	stripCompiledNoteExtension,
	type VaultRouteConfig
} from './paths';

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
	queryPermission?: (descriptor?: { mode?: DatahoarderPermissionMode }) => Promise<DatahoarderPermissionState>;
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

export function buildLocalVaultTree(files: LocalVaultFile[], config: VaultRouteConfig = {}) {
	const { rootModulePath } = getVaultRouteConfig({
		rootModulePath: '/local/',
		routeBase: '',
		...config
	});
	const modulePaths = files
		.filter((file) => getNoteExtension(file.path))
		.map((file) => `${rootModulePath}${file.path}`);

	return buildNoteTree(modulePaths, { rootModulePath, routeBase: config.routeBase ?? '' });
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
	if (!file.handle.createWritable) {
		throw new Error('This browser does not support writing to selected files.');
	}

	const writable = await file.handle.createWritable();

	if ('getWriter' in writable) {
		const writer = (writable as unknown as WritableStream<string>).getWriter();
		await writer.write(content);
		await writer.close();
		return;
	}

	await writable.write(content);
	await writable.close();
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
