import { tick } from 'svelte';
import {
	deleteLocalFile,
	getStoredVaultHandle,
	isEditableTextFile,
	moveLocalFile,
	normalizeLocalTextPath,
	readLocalFile,
	readLocalVault,
	storeVaultHandle,
	verifyPermission,
	writeLocalFile,
	type DatahoarderPermissionMode,
	type LocalDirectoryHandle,
	type LocalVaultFile
} from '../../vault/local-files.js';
import {
	buildLocalVaultIndex,
	type VaultIndex
} from '../../vault/index.js';
import {
	readPublicPublishProfiles,
	type PublicPublishProfile
} from '../../publishing/public-publish.js';
import {
	readSavedVaultSearches,
	type SavedVaultSearch
} from '../../vault/saved-search.js';
import { assertNoManagedPathCollision as assertNoLocalManagedPathCollision } from '../shared/path-availability.js';

type DatahoarderWindow = Window & {
	showDirectoryPicker?: (options?: { mode?: DatahoarderPermissionMode }) => Promise<LocalDirectoryHandle>;
};

type VaultFileActionContext = {
	dirty: boolean;
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
	vaultSearchQuery: string;
	publicPublishProfiles: PublicPublishProfile[];
	getErrorMessage: (error: unknown) => string;
	loadStoredNoteLists: (vaultName: string) => void;
	pruneSelectedPublicPublishProfile: () => void;
	pruneStoredNoteLists: (nextVaultIndex?: VaultIndex) => void;
	recordRecentNote: (path: string) => void;
	replaceStoredNotePath: (previousPath: string, nextPath: string) => void;
};

export type VaultFileActions = ReturnType<typeof createVaultFileActions>;

export function createVaultFileActions(context: VaultFileActionContext) {
	const actions = {
		canLeaveSelectedFile,
		canMutateVault,
		chooseFolder,
		deleteSelectedFile,
		loadVault,
		openFile,
		refreshVault,
		reloadVaultAfterFileOperation,
		renameSelectedFile,
		reopenStoredFolder,
		restoreSelectionAfterVaultLoad,
		restoreVaultHandle,
		saveSelectedFile,
		selectFile
	};

	async function restoreVaultHandle() {
		try {
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
		const picker = (window as unknown as DatahoarderWindow).showDirectoryPicker;

		if (!picker) {
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

			const nextFiles = await readLocalVault(handle);
			context.files = nextFiles;
			context.status = `Loaded ${nextFiles.length} editable files. Opening the selected file while parsing notes.`;

			await actions.restoreSelectionAfterVaultLoad(nextFiles);
			await tick();

			const [nextVaultIndex, nextSavedVaultSearches, nextPublicPublishProfiles] = await Promise.all([
				buildLocalVaultIndex(nextFiles, {
					previousIndex: reusePreviousIndex ? context.vaultIndex : null
				}),
				readSavedVaultSearches(nextFiles),
				readPublicPublishProfiles(nextFiles)
			]);

			context.vaultIndex = nextVaultIndex;
			context.savedVaultSearches = nextSavedVaultSearches;
			context.publicPublishProfiles = nextPublicPublishProfiles;
			context.pruneSelectedPublicPublishProfile();
			context.pruneStoredNoteLists(nextVaultIndex);
			context.status = `${nextStatus} ${context.files.length} editable files indexed, ${context.vaultIndex.records.length} notes parsed.`;
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
			await writeLocalFile(context.selectedFile, context.selectedContent);
			context.savedContent = context.selectedContent;
			context.vaultIndex = await buildLocalVaultIndex(context.files, {
				changedPaths: [context.selectedFile.path],
				previousIndex: context.vaultIndex
			});
			context.status = `Saved ${context.selectedFile.path}`;
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

		const requestedPath = window.prompt('Rename or move file', context.selectedFile.path);

		if (requestedPath === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const nextPath = normalizeLocalTextPath(
				requestedPath,
				context.selectedFile.extension || '.md'
			);
			assertNoLocalManagedPathCollision(context.files, nextPath, context.selectedFile.path);
			const movedPath = await moveLocalFile(
				context.vaultHandle,
				context.selectedFile.path,
				nextPath,
				context.selectedContent
			);

			context.replaceStoredNotePath(context.selectedFile.path, movedPath);
			context.savedContent = context.selectedContent;
			await actions.reloadVaultAfterFileOperation(`Renamed ${context.selectedFile.path} to ${movedPath}`, movedPath);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
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
			context.selectedPath = '';
			context.selectedContent = '';
			context.savedContent = '';
			await actions.reloadVaultAfterFileOperation(`Deleted ${deletedPath}`);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function reloadVaultAfterFileOperation(nextStatus: string, preferredPath = '') {
		if (!context.vaultHandle) {
			return;
		}

		context.loading = true;

		try {
			const nextFiles = await readLocalVault(context.vaultHandle);
			context.files = nextFiles;

			await actions.restoreSelectionAfterVaultLoad(nextFiles, preferredPath);
			await tick();

			const [nextVaultIndex, nextSavedVaultSearches, nextPublicPublishProfiles] = await Promise.all([
				buildLocalVaultIndex(nextFiles, { previousIndex: context.vaultIndex }),
				readSavedVaultSearches(nextFiles),
				readPublicPublishProfiles(nextFiles)
			]);

			context.vaultIndex = nextVaultIndex;
			context.savedVaultSearches = nextSavedVaultSearches;
			context.publicPublishProfiles = nextPublicPublishProfiles;
			context.pruneSelectedPublicPublishProfile();
			context.pruneStoredNoteLists(nextVaultIndex);
			context.vaultSearchQuery = '';
			context.status = nextStatus;
		} finally {
			context.loading = false;
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
