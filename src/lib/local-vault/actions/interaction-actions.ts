import { createLocalFile, deleteLocalFile, writeLocalFile, type LocalDirectoryHandle, type LocalVaultFile } from '../../vault/local-files.js';
import { toggleMarkdownTask } from '../../markdown/tasks.js';
import {
	createSavedVaultSearchContent,
	getSavedVaultSearchPath,
	type SavedVaultSearch
} from '../../vault/saved-search.js';
import { buildLocalVaultIndex, type VaultIndex } from '../../vault/index.js';
import type { CommandPaletteItem, RequestTextOptions } from '../shared/types.js';

type InteractionActionContext = {
	commandPaletteOpen: boolean;
	commandPaletteQuery: string;
	dirty: boolean;
	errorMessage: string;
	files: LocalVaultFile[];
	loading: boolean;
	savedContent: string;
	saving: boolean;
	selectedContent: string;
	selectedFile: LocalVaultFile | null;
	selectedPath: string;
	status: string;
	vaultHandle: LocalDirectoryHandle | null;
	vaultIndex: VaultIndex;
	vaultSearchQuery: string;
	canMutateVault: () => Promise<boolean>;
	getErrorMessage: (error: unknown) => string;
	reloadVaultAfterFileOperation: (nextStatus: string, preferredPath?: string) => Promise<void>;
	requestText: (options: RequestTextOptions) => Promise<string | null>;
	selectFile: (filePath: string) => Promise<void>;
};

export type InteractionActions = ReturnType<typeof createInteractionActions>;

export function createInteractionActions(context: InteractionActionContext) {
	return {
		applySavedVaultSearch,
		closeCommandPalette,
		deleteSavedVaultSearch,
		handleGlobalKeydown,
		handlePreviewChange,
		handlePreviewClick,
		openBacklink,
		openCommandPalette,
		openSearchResult,
		openStoredNoteRecord,
		runCommandPaletteItem,
		saveCurrentVaultSearch,
		setCommandPaletteQuery,
		setVaultSearchQuery
	};

	function openStoredNoteRecord(record: { routePath: string }) {
		void context.selectFile(record.routePath);
	}

	function openBacklink(backlink: { record: { routePath: string } }) {
		void context.selectFile(backlink.record.routePath);
	}

	function openCommandPalette(initialQuery = '') {
		context.commandPaletteQuery = initialQuery;
		context.commandPaletteOpen = true;
	}

	function closeCommandPalette() {
		context.commandPaletteOpen = false;
		context.commandPaletteQuery = '';
	}

	function setCommandPaletteQuery(query: string) {
		context.commandPaletteQuery = query;
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			openCommandPalette();
			return;
		}

		if (context.commandPaletteOpen && event.key === 'Escape') {
			event.preventDefault();
			closeCommandPalette();
		}
	}

	function runCommandPaletteItem(item: CommandPaletteItem) {
		closeCommandPalette();
		void item.run();
	}

	function handlePreviewClick(event: MouseEvent) {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}

		const target = event.target instanceof Element ? event.target : null;
		const anchor = target?.closest<HTMLAnchorElement>('a[data-note-path]');
		const notePath = anchor?.dataset.notePath;

		if (!notePath) {
			return;
		}

		event.preventDefault();

		if (!context.files.some((file) => file.routePath === notePath || file.path === notePath)) {
			context.status = `Linked note not found: ${notePath}`;
			return;
		}

		void context.selectFile(notePath);
	}

	function handlePreviewChange(event: Event) {
		const target = event.target instanceof HTMLInputElement ? event.target : null;

		if (!target?.matches('input[type="checkbox"][data-task-index]')) {
			return;
		}

		void toggleSelectedMarkdownTask(target);
	}

	async function toggleSelectedMarkdownTask(input: HTMLInputElement) {
		const taskIndex = Number(input.dataset.taskIndex);

		if (!context.selectedFile || context.loading || context.saving || !Number.isInteger(taskIndex)) {
			input.checked = !input.checked;
			return;
		}

		if (context.selectedFile.extension !== '.md' && context.selectedFile.extension !== '.svx') {
			input.checked = !input.checked;
			return;
		}

		if (context.dirty && !window.confirm('Save current edits with this task update?')) {
			input.checked = !input.checked;
			return;
		}

		if (!(await context.canMutateVault())) {
			input.checked = !input.checked;
			return;
		}

		context.saving = true;
		context.errorMessage = '';

		try {
			const nextContent = toggleMarkdownTask(context.selectedContent, {
				checked: input.checked,
				taskIndex
			});

			await writeLocalFile(context.selectedFile, nextContent);
			context.selectedContent = nextContent;
			context.savedContent = nextContent;
			context.vaultIndex = await buildLocalVaultIndex(context.files, {
				changedPaths: [context.selectedFile.path],
				previousIndex: context.vaultIndex
			});
			context.status = `${input.checked ? 'Completed' : 'Reopened'} task ${taskIndex + 1} in ${context.selectedFile.path}`;
		} catch (error) {
			input.checked = !input.checked;
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
	}

	function openSearchResult(result: { record: { routePath: string } }) {
		void context.selectFile(result.record.routePath);
	}

	function setVaultSearchQuery(query: string) {
		context.vaultSearchQuery = query;
	}

	function applySavedVaultSearch(search: SavedVaultSearch) {
		context.vaultSearchQuery = search.query;
		context.status = `Applied saved search ${search.name}`;
	}

	async function saveCurrentVaultSearch() {
		if (!context.vaultHandle || context.loading || context.saving) {
			return;
		}

		const query = context.vaultSearchQuery.trim();

		if (!query) {
			context.status = 'Enter a search query before saving it.';
			return;
		}

		if (!(await context.canMutateVault())) {
			return;
		}

		const requestedName = await context.requestText({
			label: 'Search Name',
			required: true,
			submitLabel: 'Save Search',
			title: 'Saved Search Name',
			value: query
		});

		if (requestedName === null) {
			return;
		}

		const name = requestedName.trim();

		if (!name) {
			context.errorMessage = 'Saved search name is required.';
			return;
		}

		context.saving = true;
		context.errorMessage = '';

		try {
			const path = getSavedVaultSearchPath(name, context.files.map((file) => file.path));
			const content = createSavedVaultSearchContent({ name, query });

			await createLocalFile(context.vaultHandle, path, content, '.json');
			await context.reloadVaultAfterFileOperation(`Saved search ${name}.`, context.selectedPath || context.selectedFile?.path || '');
			context.vaultSearchQuery = query;
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
	}

	async function deleteSavedVaultSearch(search: SavedVaultSearch) {
		if (!context.vaultHandle || context.loading || context.saving) {
			return;
		}

		if (!window.confirm(`Delete saved search ${search.name}?`)) {
			return;
		}

		if (!(await context.canMutateVault())) {
			return;
		}

		context.saving = true;
		context.errorMessage = '';

		try {
			await deleteLocalFile(context.vaultHandle, search.path);
			await context.reloadVaultAfterFileOperation(
				`Deleted saved search ${search.name}.`,
				context.selectedPath || context.selectedFile?.path || ''
			);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
	}
}
