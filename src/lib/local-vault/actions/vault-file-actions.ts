import { tick } from 'svelte';
import {
	canUseTauriNativeFileAccess,
	deleteLocalFile,
	getServerVaultHandle,
	getTauriVaultHandle,
	getStoredVaultHandle,
	isEditableTextFile,
	moveLocalVaultFile,
	normalizeLocalTextPath,
	pickTauriVaultHandle,
	readLocalFile,
	readLocalVaultDirectories,
	readLocalVault,
	storeVaultHandle,
	verifyPermission,
	writeLocalFile,
	type DatahoarderPermissionMode,
	type LocalDirectoryHandle,
	type LocalVaultDirectory,
	type LocalVaultFile
} from '../../vault/local-files.js';
import {
	buildLocalVaultIndex,
	type VaultIndex
} from '../../vault/index.js';
import {
	readSavedVaultSearches,
	type SavedVaultSearch
} from '../../vault/saved-search.js';
import {
	assertNoManagedPathCollision as assertNoLocalManagedPathCollision
} from '../shared/path-availability.js';
import type { RequestTextOptions } from '../shared/types.js';
import { createVaultMoveActions } from './vault-move-actions.js';
import {
	applyDeletedLocalFile,
	applyMovedLocalFile,
	applyUpdatedLocalFile
} from './vault-snapshot-mutations.js';

type DatahoarderWindow = Window & {
	showDirectoryPicker?: (options?: { mode?: DatahoarderPermissionMode }) => Promise<LocalDirectoryHandle>;
};

type VaultFileActionContext = {
	dirty: boolean;
	directories: LocalVaultDirectory[];
	errorMessage: string;
	files: LocalVaultFile[];
	loading: boolean;
	savedContent: string;
	savedVaultSearches: SavedVaultSearch[];
	saving: boolean;
	selectedContent: string;
	selectedFile: LocalVaultFile | null;
	selectedPath: string;
	status: string;
	vaultHandle: LocalDirectoryHandle | null;
	vaultIndex: VaultIndex;
	getErrorMessage: (error: unknown) => string;
	loadStoredNoteLists: (vaultName: string) => void;
	pruneStoredNoteLists: (nextVaultIndex?: VaultIndex) => void;
	recordRecentNote: (path: string) => void;
	replaceStoredNotePath: (previousPath: string, nextPath: string) => void;
	requestText: (options: RequestTextOptions) => Promise<string | null>;
};

export type VaultFileActions = ReturnType<typeof createVaultFileActions>;

export function createVaultFileActions(context: VaultFileActionContext) {
	const moveActions = createVaultMoveActions(context, {
		canMutateVault,
		reloadVaultAfterMove
	});
	const actions = {
		canLeaveSelectedFile,
		canMutateVault,
		chooseFolder,
		chooseTauriFolder,
		deleteSelectedFile,
		loadServerVault,
		loadTauriVault,
		loadVault,
		...moveActions,
		openFile,
		refreshVault,
		renameSelectedFile,
		reopenStoredFolder,
		restoreSelectionAfterVaultLoad,
		restoreVaultHandle,
		saveSelectedFile,
		selectFile
	};

	async function restoreVaultHandle() {
		try {
			if (await actions.loadTauriVault('Loaded native folder.')) {
				return;
			}

			if (await actions.loadServerVault('Loaded dev-process folder.')) {
				return;
			}

			const storedHandle = await getStoredVaultHandle();

			if (!storedHandle) {
				return;
			}

			context.vaultHandle = storedHandle;

			if (await verifyPermission(storedHandle, 'readwrite')) {
				await actions.loadVault(storedHandle, 'Restored local folder access.');
			} else {
				context.status = 'Folder remembered. Reopen access to refresh the vault.';
			}
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function chooseFolder() {
		if (canUseTauriNativeFileAccess()) {
			await actions.chooseTauriFolder();
			return;
		}

		if (await actions.loadServerVault('Loaded dev-process folder.')) {
			return;
		}

		const picker = (window as unknown as DatahoarderWindow).showDirectoryPicker;

		if (!picker) {
			context.status = 'Set DATAHOARDER_OPEN_FOLDER or use a browser with folder access.';
			return;
		}

		try {
			context.errorMessage = '';
			const handle = await picker({ mode: 'readwrite' });

			if (!(await verifyPermission(handle, 'readwrite', true))) {
				context.status = 'Folder permission was not granted.';
				return;
			}

			context.vaultHandle = handle;
			await storeVaultHandle(handle);
			await actions.loadVault(handle, 'Loaded local vault.');
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function reopenStoredFolder() {
		if (!context.vaultHandle) {
			await actions.restoreVaultHandle();
			return;
		}

		if (!(await verifyPermission(context.vaultHandle, 'readwrite', true))) {
			context.status = 'Folder permission was not granted.';
			return;
		}

		await actions.loadVault(context.vaultHandle, 'Reopened local vault.', true);
	}

	async function loadServerVault(nextStatus: string) {
		const serverHandle = await getServerVaultHandle();

		if (!serverHandle) {
			return false;
		}

		context.vaultHandle = serverHandle;
		await actions.loadVault(serverHandle, nextStatus, true);

		return true;
	}

	async function loadTauriVault(nextStatus: string) {
		const tauriHandle = await getTauriVaultHandle();

		if (!tauriHandle) {
			return false;
		}

		context.vaultHandle = tauriHandle;
		await storeVaultHandle(tauriHandle);
		await actions.loadVault(tauriHandle, nextStatus, true);

		return true;
	}

	async function chooseTauriFolder() {
		try {
			context.errorMessage = '';
			const handle = await pickTauriVaultHandle();

			if (!handle) {
				context.status = 'Folder selection cancelled.';
				return;
			}

			context.vaultHandle = handle;
			await storeVaultHandle(handle);
			await actions.loadVault(handle, 'Loaded native folder.', true);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function refreshVault() {
		if (!context.vaultHandle) {
			return;
		}

		await actions.loadVault(context.vaultHandle, 'Refreshed local vault.', true);
	}

	async function loadVault(handle: LocalDirectoryHandle, nextStatus: string, reusePreviousIndex = false) {
		context.loading = true;
		context.errorMessage = '';

		try {
			context.loadStoredNoteLists(handle.name);

			const [nextFiles, nextDirectories] = await Promise.all([
				readLocalVault(handle),
				readLocalVaultDirectories(handle)
			]);

			context.files = nextFiles;
			context.directories = nextDirectories;
			context.status = `Loaded ${nextFiles.length} editable files. Opening the selected file while parsing notes.`;

			await actions.restoreSelectionAfterVaultLoad(nextFiles);
			await tick();

			const [nextVaultIndex, nextSavedVaultSearches] = await Promise.all([
				buildLocalVaultIndex(nextFiles, {
					previousIndex: reusePreviousIndex ? context.vaultIndex : null
				}),
				readSavedVaultSearches(nextFiles)
			]);

			context.vaultIndex = nextVaultIndex;
			context.savedVaultSearches = nextSavedVaultSearches;
			context.pruneStoredNoteLists(nextVaultIndex);
			context.status = `${nextStatus} ${context.files.length} editable files indexed, ${context.directories.length} folders found, ${context.vaultIndex.records.length} notes parsed.`;
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.loading = false;
		}
	}

	async function restoreSelectionAfterVaultLoad(nextFiles: LocalVaultFile[], preferredPath = context.selectedPath) {
		const nextFile =
			nextFiles.find((file) => file.path === preferredPath || file.routePath === preferredPath) ??
			nextFiles[0] ??
			null;

		if (!nextFile) {
			context.selectedPath = '';
			context.selectedContent = '';
			context.savedContent = '';
			return;
		}

		await actions.openFile(nextFile);
	}

	async function selectFile(filePath: string) {
		if (context.dirty && !window.confirm('Discard unsaved edits?')) {
			return;
		}

		const nextFile =
			context.files.find((file) => file.path === filePath) ??
			context.files.find((file) => file.routePath === filePath);

		if (!nextFile || !isEditableTextFile(nextFile.path)) {
			return;
		}

		try {
			context.errorMessage = '';
			await actions.openFile(nextFile);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function openFile(file: LocalVaultFile, nextStatus = '') {
		context.selectedPath = file.path;
		const content = await readLocalFile(file);
		context.selectedContent = content;
		context.savedContent = content;
		context.status = nextStatus;
		context.recordRecentNote(file.path);
	}

	async function saveSelectedFile() {
		if (!context.selectedFile || !context.dirty) {
			return;
		}

		context.saving = true;
		context.errorMessage = '';

		try {
			const updatedFile = await writeLocalFile(context.selectedFile, context.selectedContent);

			await applyUpdatedLocalFile(context, updatedFile, context.selectedContent, `Saved ${context.selectedFile.path}`);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
	}

	async function renameSelectedFile() {
		if (!context.vaultHandle || !context.selectedFile || context.loading || !(await actions.canMutateVault())) {
			return;
		}

		const requestedPath = await context.requestText({
			label: 'File Path',
			required: true,
			submitLabel: 'Rename File',
			title: 'Rename Or Move File',
			value: context.selectedFile.path
		});

		if (requestedPath === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const nextPath = normalizeLocalTextPath(requestedPath, '');
			assertNoLocalManagedPathCollision(context.files, nextPath, context.selectedFile.path);
			const previousPath = context.selectedFile.path;
			const movedFile = await moveLocalVaultFile(
				context.vaultHandle,
				previousPath,
				nextPath,
				context.selectedContent
			);

			context.replaceStoredNotePath(previousPath, movedFile.path);
			await applyMovedLocalFile(
				context,
				previousPath,
				movedFile,
				context.selectedContent,
				`Renamed ${previousPath} to ${movedFile.path}`
			);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function reloadVaultAfterMove(nextStatus: string, preferredPath: string) {
		if (!context.vaultHandle) {
			return;
		}

		context.selectedPath = preferredPath;
		await actions.loadVault(context.vaultHandle, nextStatus, true);
	}
	async function deleteSelectedFile() {
		if (!context.vaultHandle || !context.selectedFile || context.loading || !(await actions.canMutateVault())) {
			return;
		}

		if (!window.confirm(`Delete ${context.selectedFile.path}?`)) {
			return;
		}

		try {
			context.errorMessage = '';
			const deletedPath = context.selectedFile.path;

			await deleteLocalFile(context.vaultHandle, deletedPath);
			await applyDeletedLocalFile(context, deletedPath, `Deleted ${deletedPath}`);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function canLeaveSelectedFile() {
		return !context.dirty || window.confirm('Discard unsaved edits?');
	}

	async function canMutateVault() {
		if (!context.vaultHandle) {
			return false;
		}

		if (await verifyPermission(context.vaultHandle, 'readwrite', true)) {
			return true;
		}

		context.status = 'Folder permission was not granted.';
		return false;
	}

	return actions;
}
