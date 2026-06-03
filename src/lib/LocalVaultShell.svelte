<script lang="ts">
import type { editor as MonacoEditorNamespace } from 'monaco-editor';
import { onMount, tick } from 'svelte';
import { getBaseViews } from './base.js';
import {
	createCollectionRecordDraft,
	filterCollectionRecords,
	formatCollectionRecordValue,
	getCollectionField,
	getCollectionRecordCreationError,
	getCollectionTimelineItems,
	getCollectionViewDateField,
	getCollectionViewGroupBy,
	groupCollectionRecordsForKanban,
	isDatahoarderCollectionFile,
	isComputedCollectionColumn,
	resolveDatahoarderCollection,
	serializeCollectionRecordsAsCsv,
	serializeCollectionRecordsAsJson,
	sortCollectionRecords,
	sortCollectionRecordsForTimeline,
	summarizeCollectionRecords,
	type ResolvedCollection
} from './collection.js';
import { addCollectionField } from './collection-edit.js';
import { addExcalidrawElement } from './excalidraw-edit.js';
import {
	createStandaloneHtmlDocument,
	renderCollectionKanbanHtml,
	renderCollectionSummariesHtml,
	renderCollectionTableHtml,
	renderCollectionTimelineHtml,
	renderSourceHtml
} from './html-export.js';
import { createExcalidrawNoteDraft, renderExcalidrawNotePreview } from './excalidraw-preview.js';
import {
	buildLocalVaultTree,
	canUseFileSystemAccess,
	createLocalFile,
	deleteLocalFile,
	getLocalRoutePath,
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
} from './local-vault.js';
import { isDatahoarderBoardFile, renderDatahoarderBoard } from './local-board.js';
import { renderPortableMarkdown } from './markdown-render.js';
import { toggleMarkdownTask } from './markdown-tasks.js';
import NoteTree from './NoteTree.svelte';
import { hasInlineField, setInlineField } from './note-fields.js';
import { getTemplateDisplayName, isNoteTemplatePath, renderNoteTemplate } from './note-template.js';
import { getNoteTitle, stripCompiledNoteExtension } from './paths.js';
import {
	createPublicPublishBundle,
	getPublicPublishHref,
	getPublicPublishRecords,
	readPublicPublishProfiles,
	type PublicPublishProfile,
	type PublicPublishEntry
} from './public-publish.js';
import { isExcalidrawNote } from './raw-notes.js';
import {
	createSavedVaultSearchContent,
	getSavedVaultSearchPath,
	readSavedVaultSearches,
	type SavedVaultSearch
} from './saved-search.js';
import {
	buildLocalVaultIndex,
	createEmptyVaultIndex,
	formatVaultValue,
	getVaultBacklinks,
	getVaultRecordValue,
	type VaultBacklink,
	type VaultIndex,
	type VaultRecord
} from './vault-index.js';
import { searchVaultRecords, type VaultSearchResult } from './vault-search.js';

type MathJaxApi = {
	loader?: {
		load?: string[];
	};
	options?: Record<string, unknown>;
	startup?: {
		promise?: Promise<void>;
	};
	svg?: Record<string, unknown>;
	tex?: Record<string, unknown>;
	typesetPromise?: (elements?: Element[]) => Promise<void>;
};

type DatahoarderWindow = Window & {
	MathJax?: MathJaxApi;
	showDirectoryPicker?: (options?: { mode?: DatahoarderPermissionMode }) => Promise<LocalDirectoryHandle>;
};

type MonacoApi = typeof import('monaco-editor');
type MonacoEditor = MonacoEditorNamespace.IStandaloneCodeEditor;
type MonacoEnvironmentGlobal = typeof globalThis & {
	MonacoEnvironment?: {
		getWorker?: (_workerId: string, label: string) => Worker;
	};
};

type CollectionCellEdit = {
	column: string;
	recordPath: string;
	value: string;
};

type CommandPaletteItem = {
	detail: string;
	id: string;
	keywords?: string[];
	run: () => Promise<void> | void;
	title: string;
};

const mathJaxScriptSrc = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
const maxRecentNotes = 8;
const maxCommandPaletteResults = 18;
const pinnedNoteStoragePrefix = 'datahoarder-local-vault-pinned-notes';
const recentNoteStoragePrefix = 'datahoarder-local-vault-recent-notes';

let supported = $state(false);
let vaultHandle = $state<LocalDirectoryHandle | null>(null);
let files = $state<LocalVaultFile[]>([]);
let vaultIndex = $state<VaultIndex>(createEmptyVaultIndex());
let selectedPath = $state('');
let selectedContent = $state('');
let savedContent = $state('');
let pinnedNotePaths = $state<string[]>([]);
let recentNotePaths = $state<string[]>([]);
let savedVaultSearches = $state<SavedVaultSearch[]>([]);
let publicPublishProfiles = $state<PublicPublishProfile[]>([]);
let selectedPublicPublishProfilePath = $state('');
let status = $state('Choose a local folder to begin.');
let loading = $state(false);
let saving = $state(false);
let errorMessage = $state('');
let vaultSearchQuery = $state('');
let collectionFilter = $state('');
let collectionCellEdit = $state<CollectionCellEdit | null>(null);
let selectedCollectionViewIndex = $state(0);
let collectionSortColumn = $state('title');
let collectionSortDirection = $state<'asc' | 'desc'>('asc');
let commandPaletteOpen = $state(false);
let commandPaletteQuery = $state('');
let lastCollectionFilePath = $state('');
let lastCollectionViewDefaultsKey = $state('');
let editorHost: HTMLDivElement | undefined = $state();
let commandPaletteInput: HTMLInputElement | undefined = $state();
let markdownPreviewHost: HTMLElement | undefined = $state();
let previewRenderContent = $state('');
let previewRenderPath = $state('');
let monacoState = $state<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
let monacoApi: MonacoApi | null = null;
let monacoEditor: MonacoEditor | null = null;
let monacoSubscription: { dispose: () => void } | null = null;
let mathJaxLoadPromise: Promise<MathJaxApi | null> | null = null;
let mathTypesetToken = 0;
let previewRenderToken = 0;

let selectedFile = $derived(
	files.find((file) => file.path === selectedPath) ??
		files.find((file) => file.routePath === selectedPath) ??
		null
);
let fileTree = $derived(buildLocalVaultTree(files));
let noteCount = $derived(files.filter((file) => file.extension === '.md' || file.extension === '.svx').length);
let dirty = $derived(selectedContent !== savedContent);
let templateFiles = $derived(files.filter((file) => isNoteTemplatePath(file.path)));
let searchingVault = $derived(vaultSearchQuery.trim().length > 0);
let vaultSearchResults = $derived(searchVaultRecords(vaultIndex.records, vaultSearchQuery));
let selectedRecord = $derived(selectedFile ? (vaultIndex.recordsByPath.get(selectedFile.path) ?? null) : null);
let selectedBacklinks = $derived(selectedRecord ? getVaultBacklinks(vaultIndex, selectedRecord) : []);
let previewRenderFile = $derived(
	files.find((file) => file.path === previewRenderPath && file.path === selectedFile?.path) ?? null
);
let selectedPublicPublishProfile = $derived(
	publicPublishProfiles.find((profile) => profile.path === selectedPublicPublishProfilePath) ?? null
);
let publicRecords = $derived(getPublicPublishRecords(vaultIndex.records, selectedPublicPublishProfile));
let selectedExcalidrawNote = $derived(Boolean(selectedFile?.extension === '.md' && isExcalidrawNote(selectedContent)));
let selectedFilePinned = $derived(selectedFile ? pinnedNotePaths.includes(selectedFile.path) : false);
let pinnedNotes = $derived(
	getStoredNoteRecords(pinnedNotePaths.filter((path) => path !== selectedFile?.path))
);
let recentNotes = $derived(
	getStoredNoteRecords(
		recentNotePaths.filter((path) => path !== selectedFile?.path && !pinnedNotePaths.includes(path))
	)
);
let baseViews = $derived(selectedFile?.extension === '.base' ? getBaseViews(selectedContent) : []);
let selectedCollection = $derived.by<ResolvedCollection | null>(() => {
	if (!selectedFile || !isDatahoarderCollectionFile(selectedFile.path)) {
		return null;
	}

	return resolveDatahoarderCollection(selectedContent, selectedFile.path, vaultIndex, selectedCollectionViewIndex);
});
let collectionRecordCreationError = $derived(
	selectedCollection ? getCollectionRecordCreationError(selectedCollection.definition) : ''
);
let collectionTimelineDateField = $derived(
	selectedCollection ? getCollectionViewDateField(selectedCollection.view) : 'date'
);
let collectionRecords = $derived.by(() => {
	if (!selectedCollection) {
		return [];
	}

	const filteredRecords = filterCollectionRecords(
		selectedCollection.records,
		collectionFilter,
		selectedCollection.columns
	);

	if (selectedCollection.view.type.toLowerCase() === 'timeline') {
		return sortCollectionRecordsForTimeline(filteredRecords, collectionTimelineDateField);
	}

	const sortColumn = selectedCollection.columns.includes(collectionSortColumn)
		? collectionSortColumn
		: (selectedCollection.columns[0] ?? 'title');

	return sortCollectionRecords(filteredRecords, sortColumn, collectionSortDirection);
});
let collectionKanbanGroupBy = $derived(selectedCollection ? getCollectionViewGroupBy(selectedCollection.view) : 'status');
let collectionKanbanGroups = $derived(
	selectedCollection?.view.type.toLowerCase() === 'kanban'
		? groupCollectionRecordsForKanban(collectionRecords, collectionKanbanGroupBy)
		: []
);
let collectionTimelineItems = $derived(
	selectedCollection?.view.type.toLowerCase() === 'timeline'
		? getCollectionTimelineItems(collectionRecords, collectionTimelineDateField)
		: []
);
let collectionSummaries = $derived(
	selectedCollection ? summarizeCollectionRecords(collectionRecords, selectedCollection.definition.summaries) : []
);
let commandPaletteItems = $derived.by(() => getCommandPaletteItems());
let filteredCommandPaletteItems = $derived.by(() =>
	getFilteredCommandPaletteItems(commandPaletteItems, commandPaletteQuery)
);
let previewHtml = $derived.by(() => {
	if (!previewRenderFile) {
		return '';
	}

	if (previewRenderFile.extension === '.svelte') {
		return '';
	}

	if (isDatahoarderBoardFile(previewRenderFile.path)) {
		return renderLocalBoard(previewRenderContent, previewRenderFile.path);
	}

	if (previewRenderFile.extension === '.md' && isExcalidrawNote(previewRenderContent)) {
		return renderExcalidrawNotePreview(previewRenderContent);
	}

	if (previewRenderFile.extension === '.md' || previewRenderFile.extension === '.svx') {
		return renderLocalMarkdown(previewRenderContent, previewRenderFile, {
			interactiveTaskLists: true
		});
	}

	return '';
});

$effect(() => {
	const file = selectedFile;
	const content = selectedContent;
	const path = file?.path ?? '';
	const token = previewRenderToken + 1;

	previewRenderToken = token;
	previewRenderPath = '';
	previewRenderContent = '';

	if (!file) {
		return;
	}

	const timeout = window.setTimeout(() => {
		if (previewRenderToken !== token || selectedPath !== path) {
			return;
		}

		previewRenderPath = path;
		previewRenderContent = content;
	}, 0);

	return () => window.clearTimeout(timeout);
});

$effect(() => {
	if (previewHtml && (hasMath(selectedContent) || hasMath(previewHtml))) {
		queuePreviewMathTypeset();
	}
});

$effect(() => {
	const collectionFilePath = selectedFile && isDatahoarderCollectionFile(selectedFile.path) ? selectedFile.path : '';

	if (collectionFilePath !== lastCollectionFilePath) {
		lastCollectionFilePath = collectionFilePath;
		collectionCellEdit = null;
		lastCollectionViewDefaultsKey = '';
		selectedCollectionViewIndex = 0;
		collectionFilter = '';
		collectionSortColumn = 'title';
		collectionSortDirection = 'asc';
	}
});

$effect(() => {
	if (!selectedCollection) {
		selectedCollectionViewIndex = 0;
		lastCollectionViewDefaultsKey = '';
		return;
	}

	if (selectedCollectionViewIndex !== selectedCollection.viewIndex) {
		selectedCollectionViewIndex = selectedCollection.viewIndex;
	}

	const viewDefaultsKey = getCollectionViewDefaultsKey(selectedCollection);

	if (viewDefaultsKey !== lastCollectionViewDefaultsKey) {
		lastCollectionViewDefaultsKey = viewDefaultsKey;
		applyCollectionViewDefaults(selectedCollection);
		return;
	}

	if (!selectedCollection.columns.includes(collectionSortColumn)) {
		collectionSortColumn = getCollectionViewSortColumn(selectedCollection);
	}
});

$effect(() => {
	if (editorHost && monacoState === 'idle') {
		void initializeMonaco();
	}
});

onMount(() => {
	supported = canUseFileSystemAccess();

	if (!supported) {
		status = 'File System Access is unavailable in this browser. Use Chrome or Edge over HTTPS.';
		return;
	}

	void restoreVaultHandle();

	return () => {
		monacoSubscription?.dispose();
		monacoEditor?.dispose();
	};
});

async function restoreVaultHandle() {
	try {
		const storedHandle = await getStoredVaultHandle();

		if (!storedHandle) {
			return;
		}

		vaultHandle = storedHandle;

		if (await verifyPermission(storedHandle, 'readwrite')) {
			await loadVault(storedHandle, 'Restored local folder access.');
		} else {
			status = 'Folder remembered. Reopen access to refresh the vault.';
		}
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function chooseFolder() {
	const picker = (window as unknown as DatahoarderWindow).showDirectoryPicker;

	if (!picker) {
		return;
	}

	try {
		errorMessage = '';
		const handle = await picker({ mode: 'readwrite' });

		if (!(await verifyPermission(handle, 'readwrite', true))) {
			status = 'Folder permission was not granted.';
			return;
		}

		vaultHandle = handle;
		await storeVaultHandle(handle);
		await loadVault(handle, 'Loaded local vault.');
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function reopenStoredFolder() {
	if (!vaultHandle) {
		await restoreVaultHandle();
		return;
	}

	if (!(await verifyPermission(vaultHandle, 'readwrite', true))) {
		status = 'Folder permission was not granted.';
		return;
	}

	await loadVault(vaultHandle, 'Reopened local vault.', true);
}

async function refreshVault() {
	if (!vaultHandle) {
		return;
	}

	await loadVault(vaultHandle, 'Refreshed local vault.', true);
}

async function loadVault(handle: LocalDirectoryHandle, nextStatus: string, reusePreviousIndex = false) {
	loading = true;
	errorMessage = '';

	try {
		loadStoredNoteLists(handle.name);

		const nextFiles = await readLocalVault(handle);
		files = nextFiles;
		status = `Loaded ${nextFiles.length} editable files. Opening the selected file while parsing notes.`;

		await restoreSelectionAfterVaultLoad(nextFiles);
		await tick();

		const [nextVaultIndex, nextSavedVaultSearches, nextPublicPublishProfiles] = await Promise.all([
			buildLocalVaultIndex(nextFiles, {
				previousIndex: reusePreviousIndex ? vaultIndex : null
			}),
			readSavedVaultSearches(nextFiles),
			readPublicPublishProfiles(nextFiles)
		]);

		vaultIndex = nextVaultIndex;
		savedVaultSearches = nextSavedVaultSearches;
		publicPublishProfiles = nextPublicPublishProfiles;
		pruneSelectedPublicPublishProfile();
		pruneStoredNoteLists(nextVaultIndex);
		status = `${nextStatus} ${files.length} editable files indexed, ${vaultIndex.records.length} notes parsed.`;
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		loading = false;
	}
}

async function restoreSelectionAfterVaultLoad(nextFiles: LocalVaultFile[], preferredPath = selectedPath) {
	const nextFile =
		nextFiles.find((file) => file.path === preferredPath || file.routePath === preferredPath) ??
		nextFiles[0] ??
		null;

	if (!nextFile) {
		selectedPath = '';
		selectedContent = '';
		savedContent = '';
		syncMonacoContent('');
		return;
	}

	await openFile(nextFile);
}

async function selectFile(filePath: string) {
	if (dirty && !window.confirm('Discard unsaved edits?')) {
		return;
	}

	const nextFile =
		files.find((file) => file.path === filePath) ?? files.find((file) => file.routePath === filePath);

	if (!nextFile || !isEditableTextFile(nextFile.path)) {
		return;
	}

	try {
		errorMessage = '';
		await openFile(nextFile);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function openFile(file: LocalVaultFile, nextStatus = '') {
	selectedPath = file.path;
	const content = await readLocalFile(file);
	selectedContent = content;
	savedContent = content;
	status = nextStatus;
	syncMonacoContent(content);
	updateMonacoLanguage(file);
	recordRecentNote(file.path);
}

async function saveSelectedFile() {
	if (!selectedFile || !dirty) {
		return;
	}

	saving = true;
	errorMessage = '';

	try {
		await writeLocalFile(selectedFile, selectedContent);
		savedContent = selectedContent;
		vaultIndex = await buildLocalVaultIndex(files, {
			changedPaths: [selectedFile.path],
			previousIndex: vaultIndex
		});
		status = `Saved ${selectedFile.path}`;
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

async function setSelectedInlineField() {
	if (!selectedFile || !selectedRecord) {
		return;
	}

	if (dirty && !window.confirm('Save current edits with this field update?')) {
		return;
	}

	const requestedKey = window.prompt('Field name', 'status');

	if (requestedKey === null) {
		return;
	}

	const existingValue = formatVaultValue(getVaultRecordValue(selectedRecord, requestedKey));
	const requestedValue = window.prompt('Field value', existingValue);

	if (requestedValue === null) {
		return;
	}

	saving = true;
	errorMessage = '';

	try {
		const nextContent = setInlineField(selectedContent, {
			key: requestedKey,
			value: requestedValue
		});

		await writeLocalFile(selectedFile, nextContent);
		selectedContent = nextContent;
		savedContent = nextContent;
		syncMonacoContent(nextContent);
		vaultIndex = await buildLocalVaultIndex(files, {
			changedPaths: [selectedFile.path],
			previousIndex: vaultIndex
		});
		status = `Updated ${requestedKey.trim()} on ${selectedFile.path}`;
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

async function editCollectionRecordField(record: VaultRecord, column: string) {
	if (loading || saving || !selectedCollection || !isEditableCollectionColumn(column)) {
		return;
	}

	if (hasOwnCaseInsensitiveProperty(record.properties, column) && !hasInlineField(record.content, column)) {
		errorMessage = `Edit ${column} in ${record.path} source; frontmatter-backed collection cells are read-only here.`;
		return;
	}

	errorMessage = '';
	collectionCellEdit = {
		column,
		recordPath: record.path,
		value: formatCollectionRecordValue(record, column)
	};
}

async function saveCollectionCellEdit(record: VaultRecord, column: string) {
	if (!vaultHandle || loading || saving || !selectedCollection || !collectionCellEdit) {
		return;
	}

	if (!isEditingCollectionCell(record, column)) {
		return;
	}

	if (!(await canMutateVault())) {
		return;
	}

	const file = files.find((candidate) => candidate.path === record.path);

	if (!file) {
		errorMessage = `Could not find ${record.path} in the opened vault.`;
		return;
	}

	if (dirty && selectedFile?.path === file.path && !window.confirm('Save current edits with this collection update?')) {
		return;
	}

	if (dirty && selectedFile?.path !== file.path && !window.confirm('Discard unsaved edits before this collection update?')) {
		return;
	}

	const requestedValue = collectionCellEdit.value;

	saving = true;
	errorMessage = '';

	try {
		const content = selectedFile?.path === file.path ? selectedContent : await readLocalFile(file);
		const nextContent = setInlineField(content, {
			key: column,
			value: requestedValue
		});

		await writeLocalFile(file, nextContent);

		if (selectedFile?.path === file.path) {
			selectedContent = nextContent;
			savedContent = nextContent;
			syncMonacoContent(nextContent);
		}

		await reloadVaultAfterFileOperation(`Updated ${column} on ${record.path}`, selectedPath || selectedFile?.path || '');
		collectionCellEdit = null;
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

function cancelCollectionCellEdit() {
	collectionCellEdit = null;
}

function updateCollectionCellEditValue(value: string) {
	if (!collectionCellEdit) {
		return;
	}

	collectionCellEdit = {
		...collectionCellEdit,
		value
	};
}

async function bulkSetCollectionField() {
	if (!vaultHandle || loading || saving || !selectedCollection) {
		return;
	}

	if (!collectionRecords.length) {
		status = 'No visible collection records to update.';
		return;
	}

	if (!(await canMutateVault())) {
		return;
	}

	if (dirty) {
		if (!window.confirm('Save current collection edits before this bulk update?')) {
			return;
		}

		await saveSelectedFile();

		if (dirty) {
			return;
		}
	}

	const defaultField = selectedCollection.columns.find(isEditableCollectionColumn) ?? 'status';
	const requestedKey = window.prompt('Field name for visible records', defaultField);

	if (requestedKey === null) {
		return;
	}

	const key = requestedKey.trim();

	if (!isEditableCollectionColumn(key)) {
		errorMessage = `${key || 'That field'} cannot be edited from collection records.`;
		return;
	}

	const requestedValue = window.prompt(
		`Set ${getCollectionColumnLabel(key)} on ${collectionRecords.length} visible records`,
		''
	);

	if (requestedValue === null) {
		return;
	}

	if (!window.confirm(`Set ${key} on ${collectionRecords.length} visible collection records?`)) {
		return;
	}

	const recordsToUpdate = [...collectionRecords];
	const preferredPath = selectedPath || selectedFile?.path || '';
	let updatedCount = 0;
	const skippedPaths: string[] = [];

	saving = true;
	errorMessage = '';

	try {
		for (const record of recordsToUpdate) {
			const file = files.find((candidate) => candidate.path === record.path);

			if (!file) {
				skippedPaths.push(record.path);
				continue;
			}

			const content = selectedFile?.path === file.path ? selectedContent : await readLocalFile(file);

			if (hasOwnCaseInsensitiveProperty(record.properties, key) && !hasInlineField(content, key)) {
				skippedPaths.push(record.path);
				continue;
			}

			const nextContent = setInlineField(content, {
				key,
				value: requestedValue
			});

			await writeLocalFile(file, nextContent);
			updatedCount += 1;

			if (selectedFile?.path === file.path) {
				selectedContent = nextContent;
				savedContent = nextContent;
				syncMonacoContent(nextContent);
			}
		}

		const skippedStatus = skippedPaths.length ? ` Skipped ${skippedPaths.length} read-only or missing records.` : '';
		await reloadVaultAfterFileOperation(
			`Updated ${key} on ${updatedCount} visible records.${skippedStatus}`,
			preferredPath
		);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

async function createNote() {
	if (!vaultHandle || loading || !(await canMutateVault()) || !(await canLeaveSelectedFile())) {
		return;
	}

	const suggestedPath = getAvailableNotePath('Untitled.md');
	const requestedPath = window.prompt('New note path', suggestedPath);

	if (requestedPath === null) {
		return;
	}

	try {
		errorMessage = '';
		const nextPath = normalizeLocalTextPath(requestedPath, '.md');
		assertNoManagedPathCollision(nextPath);
		const content = `# ${getNoteTitle(nextPath)}\n\n`;
		const createdPath = await createLocalFile(vaultHandle, nextPath, content, '.md');

		await reloadVaultAfterFileOperation(`Created ${createdPath}`, createdPath);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function createDrawingNote() {
	if (!vaultHandle || loading || !(await canMutateVault()) || !(await canLeaveSelectedFile())) {
		return;
	}

	const suggestedPath = getAvailableNotePath('Drawings/Untitled Drawing.md');
	const requestedPath = window.prompt('New drawing path', suggestedPath);

	if (requestedPath === null) {
		return;
	}

	try {
		errorMessage = '';
		const nextPath = normalizeLocalTextPath(requestedPath, '.md');
		assertNoManagedPathCollision(nextPath);
		const draft = createExcalidrawNoteDraft(getNoteTitle(nextPath));
		const createdPath = await createLocalFile(vaultHandle, nextPath, draft.content, '.md');

		await reloadVaultAfterFileOperation(`Created drawing ${createdPath}`, createdPath);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function addCanvasElement() {
	if (!selectedFile || !selectedExcalidrawNote) {
		return;
	}

	if (dirty && !window.confirm('Save current edits with this canvas update?')) {
		return;
	}

	const requestedKind = window.prompt('Canvas element type', 'text');

	if (requestedKind === null) {
		return;
	}

	const requestedLabel = window.prompt('Canvas element label', getNoteTitle(selectedFile.path));

	if (requestedLabel === null) {
		return;
	}

	saving = true;
	errorMessage = '';

	try {
		const result = addExcalidrawElement(selectedContent, {
			kind: requestedKind,
			text: requestedLabel
		});

		await writeLocalFile(selectedFile, result.content);
		selectedContent = result.content;
		savedContent = result.content;
		syncMonacoContent(result.content);
		vaultIndex = await buildLocalVaultIndex(files, {
			changedPaths: [selectedFile.path],
			previousIndex: vaultIndex
		});
		status = `Added ${result.kind} to ${selectedFile.path}`;
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

async function createNoteFromTemplate() {
	if (!vaultHandle || loading || !(await canMutateVault()) || !(await canLeaveSelectedFile())) {
		return;
	}

	if (!templateFiles.length) {
		status = 'No templates found. Add files under Templates/ or use .template.md.';
		return;
	}

	const requestedTemplate = window.prompt('Template path or name', templateFiles[0]?.path ?? '');

	if (requestedTemplate === null) {
		return;
	}

	const templateFile = findTemplateFile(requestedTemplate);

	if (!templateFile) {
		errorMessage = `Template not found: ${requestedTemplate}`;
		return;
	}

	const suggestedPath = getAvailableNotePath(`${getTemplateDisplayName(templateFile.path)}.md`);
	const requestedPath = window.prompt('New note path', suggestedPath);

	if (requestedPath === null) {
		return;
	}

	try {
		errorMessage = '';
		const nextPath = normalizeLocalTextPath(requestedPath, '.md');
		assertNoManagedPathCollision(nextPath);
		const templateContent = await readLocalFile(templateFile);
		const renderedTemplate = renderNoteTemplate(templateContent, { path: nextPath });
		const createdPath = await createLocalFile(vaultHandle, nextPath, renderedTemplate.content, '.md');

		await reloadVaultAfterFileOperation(`Created ${createdPath} from ${templateFile.path}`, createdPath);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function createCollectionRecord() {
	if (!vaultHandle || !selectedCollection || loading || !(await canMutateVault()) || !(await canLeaveSelectedFile())) {
		return;
	}

	if (collectionRecordCreationError) {
		errorMessage = collectionRecordCreationError;
		return;
	}

	const requestedTitle = window.prompt('New collection record title', 'Untitled');

	if (requestedTitle === null) {
		return;
	}

	try {
		errorMessage = '';
		const draft = createCollectionRecordDraft(selectedCollection.definition, requestedTitle);
		const nextPath = getAvailableNotePath(draft.path);
		assertNoManagedPathCollision(nextPath);
		const createdPath = await createLocalFile(vaultHandle, nextPath, draft.content, '.md');

		await reloadVaultAfterFileOperation(`Created collection record ${createdPath}`, createdPath);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function addFieldToSelectedCollection() {
	if (!vaultHandle || !selectedFile || !selectedCollection || loading || saving) {
		return;
	}

	if (!(await canMutateVault())) {
		return;
	}

	if (dirty && !window.confirm('Save current collection edits with this field?')) {
		return;
	}

	const requestedName = window.prompt('New collection field name', 'priority');

	if (requestedName === null) {
		return;
	}

	const requestedType = window.prompt('New collection field type', 'text');

	if (requestedType === null) {
		return;
	}

	saving = true;
	errorMessage = '';

	try {
		const result = addCollectionField(selectedContent, {
			name: requestedName,
			type: requestedType,
			viewIndex: selectedCollection.viewIndex
		});

		await writeLocalFile(selectedFile, result.content);
		selectedContent = result.content;
		savedContent = result.content;
		syncMonacoContent(result.content);
		await reloadVaultAfterFileOperation(`Added ${result.field.name} field to ${selectedFile.path}`, selectedFile.path);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

function downloadCollectionExport(format: 'csv' | 'json') {
	if (!selectedCollection) {
		return;
	}

	const content =
		format === 'csv'
			? serializeCollectionRecordsAsCsv(collectionRecords, selectedCollection.columns)
			: serializeCollectionRecordsAsJson(collectionRecords, selectedCollection.columns);
	const fileName = `${slugifyDownloadName(selectedCollection.definition.name)}-${slugifyDownloadName(
		selectedCollection.view.name
	)}.${format}`;
	const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';

	downloadTextFile(fileName, content, type);
	status = `Exported ${collectionRecords.length} collection records as ${format.toUpperCase()}.`;
}

function downloadSelectedHtmlExport() {
	if (!selectedFile) {
		return;
	}

	const title = selectedCollection?.definition.name ?? selectedRecord?.title ?? getNoteTitle(selectedFile.path);
	const bodyHtml = getSelectedExportBodyHtml();
	const html = createStandaloneHtmlDocument({
		bodyHtml,
		sourcePath: selectedFile.path,
		subtitle: selectedCollection ? `${selectedCollection.view.name} collection view` : 'Datahoarder note export',
		title
	});
	const fileName = selectedCollection
		? `${slugifyDownloadName(selectedCollection.definition.name)}-${slugifyDownloadName(
			selectedCollection.view.name
		)}.html`
		: `${slugifyDownloadName(title)}.html`;

	downloadTextFile(fileName, html, 'text/html;charset=utf-8');
	status = `Exported ${selectedFile.path} as HTML.`;
}

async function publishPublicNotes() {
	if (!vaultHandle || loading || saving || !(await canMutateVault())) {
		return;
	}

	if (dirty) {
		if (!window.confirm('Save current edits before publishing public notes?')) {
			return;
		}

		await saveSelectedFile();

		if (dirty) {
			return;
		}
	}

	const profile = selectedPublicPublishProfile;
	const nextPublicRecords = getPublicPublishRecords(vaultIndex.records, profile);

	if (!nextPublicRecords.length) {
		status = profile
			? `No notes matched publish profile ${profile.name}.`
			: 'No public notes found. Add public:: true, share:: public, or #public.';
		return;
	}

	saving = true;
	errorMessage = '';

	try {
		const bundle = createPublicPublishBundle(vaultIndex.records, renderPublicRecordBodyHtml, {
			profile,
			subtitle: profile?.subtitle || 'Datahoarder public vault'
		});

		for (const file of bundle.files) {
			await writeOrCreateLocalTextFile(file.path, file.content, '.html');
		}

		await reloadVaultAfterFileOperation(
			`Published ${bundle.entries.length} ${profile ? `${profile.name} ` : 'public '}notes to ${bundle.outputDirectory}/.`,
			selectedPath
		);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

async function renameSelectedFile() {
	if (!vaultHandle || !selectedFile || loading || !(await canMutateVault())) {
		return;
	}

	const requestedPath = window.prompt('Rename or move file', selectedFile.path);

	if (requestedPath === null) {
		return;
	}

	try {
		errorMessage = '';
		const nextPath = normalizeLocalTextPath(
			requestedPath,
			selectedFile.extension || '.md'
		);
		assertNoManagedPathCollision(nextPath, selectedFile.path);
		const movedPath = await moveLocalFile(vaultHandle, selectedFile.path, nextPath, selectedContent);

		replaceStoredNotePath(selectedFile.path, movedPath);
		savedContent = selectedContent;
		await reloadVaultAfterFileOperation(`Renamed ${selectedFile.path} to ${movedPath}`, movedPath);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function deleteSelectedFile() {
	if (!vaultHandle || !selectedFile || loading || !(await canMutateVault())) {
		return;
	}

	if (!window.confirm(`Delete ${selectedFile.path}?`)) {
		return;
	}

	try {
		errorMessage = '';
		const deletedPath = selectedFile.path;

		await deleteLocalFile(vaultHandle, deletedPath);
		selectedPath = '';
		selectedContent = '';
		savedContent = '';
		await reloadVaultAfterFileOperation(`Deleted ${deletedPath}`);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function reloadVaultAfterFileOperation(nextStatus: string, preferredPath = '') {
	if (!vaultHandle) {
		return;
	}

	loading = true;

	try {
		const nextFiles = await readLocalVault(vaultHandle);
		files = nextFiles;

		await restoreSelectionAfterVaultLoad(nextFiles, preferredPath);
		await tick();

		const [nextVaultIndex, nextSavedVaultSearches, nextPublicPublishProfiles] = await Promise.all([
			buildLocalVaultIndex(nextFiles, { previousIndex: vaultIndex }),
			readSavedVaultSearches(nextFiles),
			readPublicPublishProfiles(nextFiles)
		]);

		vaultIndex = nextVaultIndex;
		savedVaultSearches = nextSavedVaultSearches;
		publicPublishProfiles = nextPublicPublishProfiles;
		pruneSelectedPublicPublishProfile();
		pruneStoredNoteLists(nextVaultIndex);
		vaultSearchQuery = '';
		status = nextStatus;
	} finally {
		loading = false;
	}
}

async function canLeaveSelectedFile() {
	return !dirty || window.confirm('Discard unsaved edits?');
}

async function canMutateVault() {
	if (!vaultHandle) {
		return false;
	}

	if (await verifyPermission(vaultHandle, 'readwrite', true)) {
		return true;
	}

	status = 'Folder permission was not granted.';
	return false;
}

function toggleSelectedPin() {
	if (!selectedRecord) {
		return;
	}

	togglePinnedPath(selectedRecord.path);
}

function togglePinnedPath(path: string) {
	if (!vaultIndex.recordsByPath.has(path)) {
		return;
	}

	if (pinnedNotePaths.includes(path)) {
		savePinnedNotePaths(pinnedNotePaths.filter((storedPath) => storedPath !== path));
		status = `Unpinned ${path}`;
		return;
	}

	savePinnedNotePaths([path, ...pinnedNotePaths]);
	status = `Pinned ${path}`;
}

function openStoredNoteRecord(record: VaultRecord) {
	void selectFile(record.routePath);
}

function openBacklink(backlink: VaultBacklink) {
	void selectFile(backlink.record.routePath);
}

function openCommandPalette(initialQuery = '') {
	commandPaletteQuery = initialQuery;
	commandPaletteOpen = true;
	void tick().then(() => commandPaletteInput?.focus());
}

function closeCommandPalette() {
	commandPaletteOpen = false;
	commandPaletteQuery = '';
}

function handleGlobalKeydown(event: KeyboardEvent) {
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
		event.preventDefault();
		openCommandPalette();
		return;
	}

	if (commandPaletteOpen && event.key === 'Escape') {
		event.preventDefault();
		closeCommandPalette();
	}
}

function handleCommandPaletteInputKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		event.preventDefault();
		closeCommandPalette();
		return;
	}

	if (event.key === 'Enter') {
		const firstItem = filteredCommandPaletteItems[0];

		if (firstItem) {
			event.preventDefault();
			runCommandPaletteItem(firstItem);
		}
	}
}

function runCommandPaletteItem(item: CommandPaletteItem) {
	closeCommandPalette();
	void item.run();
}

function getCommandPaletteItems(): CommandPaletteItem[] {
	const items: CommandPaletteItem[] = [];

	if (supported && !loading) {
		items.push({
			detail: 'Choose a local notes folder',
			id: 'open-folder',
			keywords: ['vault', 'folder', 'workspace'],
			run: chooseFolder,
			title: 'Open Folder'
		});
	}

	if (supported && vaultHandle && !loading) {
		items.push(
			{
				detail: 'Request access to the remembered folder',
				id: 'reopen-folder',
				keywords: ['vault', 'folder', 'permission'],
				run: reopenStoredFolder,
				title: 'Reopen Folder'
			},
			{
				detail: 'Reload files and rebuild the vault index',
				id: 'refresh-vault',
				keywords: ['reload', 'index', 'vault'],
				run: refreshVault,
				title: 'Refresh Vault'
			},
			{
				detail: 'Create a blank Markdown note',
				id: 'new-note',
				keywords: ['capture', 'quick note', 'markdown'],
				run: createNote,
				title: 'New Note'
			},
			{
				detail: 'Create an Excalidraw Markdown note',
				id: 'new-drawing',
				keywords: ['canvas', 'whiteboard', 'excalidraw'],
				run: createDrawingNote,
				title: 'New Drawing'
			},
			{
				detail: templateFiles.length ? 'Create a note from a local template' : 'No templates found',
				id: 'new-from-template',
				keywords: ['template', 'reuse', 'component'],
				run: createNoteFromTemplate,
				title: 'New From Template'
			},
			{
				detail: selectedPublicPublishProfile
					? `Publish ${selectedPublicPublishProfile.name} profile`
					: 'Publish notes marked public',
				id: 'publish-public',
				keywords: ['share', 'static', 'html'],
				run: publishPublicNotes,
				title: 'Publish Public'
			}
		);
	}

	if (selectedFile) {
		items.push({
			detail: `Export ${selectedFile.path} as standalone HTML`,
			id: 'export-html',
			keywords: ['download', 'standalone', 'public'],
			run: downloadSelectedHtmlExport,
			title: 'Export HTML'
		});
	}

	if (dirty && selectedFile) {
		items.push({
			detail: `Save ${selectedFile.path}`,
			id: 'save-file',
			keywords: ['write', 'persist'],
			run: saveSelectedFile,
			title: 'Save File'
		});
	}

	if (selectedRecord && !loading) {
		items.push(
			{
				detail: `${selectedFilePinned ? 'Remove pin from' : 'Pin'} ${selectedRecord.title}`,
				id: 'toggle-pin',
				keywords: ['quick note', 'favorite', 'recent'],
				run: toggleSelectedPin,
				title: selectedFilePinned ? 'Unpin Current Note' : 'Pin Current Note'
			},
			{
				detail: `Set an inline field on ${selectedRecord.title}`,
				id: 'set-field',
				keywords: ['metadata', 'property', 'field'],
				run: setSelectedInlineField,
				title: 'Set Field'
			}
		);
	}

	if (selectedExcalidrawNote) {
		items.push({
			detail: `Append an element to ${selectedFile?.path ?? 'the drawing'}`,
			id: 'add-canvas-element',
			keywords: ['drawing', 'excalidraw', 'whiteboard'],
			run: addCanvasElement,
			title: 'Add Canvas Element'
		});
	}

	if (selectedCollection) {
		items.push(
			{
				detail: selectedCollection.definition.name,
				id: 'collection-new-record',
				keywords: ['database', 'row', 'record'],
				run: createCollectionRecord,
				title: 'New Collection Record'
			},
			{
				detail: selectedCollection.definition.name,
				id: 'collection-add-field',
				keywords: ['database', 'schema', 'column'],
				run: addFieldToSelectedCollection,
				title: 'Add Collection Field'
			},
			{
				detail: `${collectionRecords.length} visible records`,
				id: 'collection-bulk-set-field',
				keywords: ['database', 'automation', 'mass update'],
				run: bulkSetCollectionField,
				title: 'Bulk Set Collection Field'
			},
			{
				detail: `${collectionRecords.length} visible records`,
				id: 'collection-export-csv',
				keywords: ['download', 'spreadsheet'],
				run: () => downloadCollectionExport('csv'),
				title: 'Export Collection CSV'
			},
			{
				detail: `${collectionRecords.length} visible records`,
				id: 'collection-export-json',
				keywords: ['download', 'data', 'automation'],
				run: () => downloadCollectionExport('json'),
				title: 'Export Collection JSON'
			}
		);
	}

	for (const search of savedVaultSearches) {
		items.push({
			detail: search.query,
			id: `saved-search:${search.path}`,
			keywords: ['saved search', 'query', search.name],
			run: () => applySavedVaultSearch(search),
			title: `Apply Saved Search: ${search.name}`
		});
	}

	for (const record of vaultIndex.records) {
		items.push({
			detail: record.path,
			id: `open-note:${record.path}`,
			keywords: ['open note', record.preview, record.tags.join(' ')],
			run: () => selectFile(record.routePath),
			title: `Open Note: ${record.title}`
		});
	}

	return items;
}

function getFilteredCommandPaletteItems(items: CommandPaletteItem[], query: string) {
	const tokens = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);

	if (!tokens.length) {
		return items.slice(0, maxCommandPaletteResults);
	}

	return items
		.filter((item) => {
			const haystack = [
				item.title,
				item.detail,
				...(item.keywords ?? [])
			].join('\n').toLowerCase();

			return tokens.every((token) => haystack.includes(token));
		})
		.slice(0, maxCommandPaletteResults);
}

function findTemplateFile(template: string) {
	const normalizedTemplate = template.trim().toLowerCase();

	if (!normalizedTemplate) {
		return null;
	}

	return (
		templateFiles.find((file) => file.path.toLowerCase() === normalizedTemplate) ??
		templateFiles.find((file) => file.routePath.toLowerCase() === normalizedTemplate) ??
		templateFiles.find((file) => getTemplateDisplayName(file.path).toLowerCase() === normalizedTemplate) ??
		null
	);
}

function recordRecentNote(path: string) {
	if (!vaultIndex.recordsByPath.has(path)) {
		return;
	}

	saveRecentNotePaths([path, ...recentNotePaths.filter((storedPath) => storedPath !== path)].slice(0, maxRecentNotes));
}

function replaceStoredNotePath(previousPath: string, nextPath: string) {
	const replacePath = (path: string) => (path === previousPath ? nextPath : path);

	savePinnedNotePaths(uniqueNotePaths(pinnedNotePaths.map(replacePath)));
	saveRecentNotePaths(uniqueNotePaths(recentNotePaths.map(replacePath)).slice(0, maxRecentNotes));
}

function pruneStoredNoteLists(nextVaultIndex = vaultIndex) {
	const isIndexed = (path: string) => nextVaultIndex.recordsByPath.has(path);

	savePinnedNotePaths(pinnedNotePaths.filter(isIndexed));
	saveRecentNotePaths(recentNotePaths.filter(isIndexed).slice(0, maxRecentNotes));
}

function getStoredNoteRecords(paths: string[]) {
	const records: VaultRecord[] = [];
	const seenPaths = new Set<string>();

	for (const path of paths) {
		if (seenPaths.has(path)) {
			continue;
		}

		const record = vaultIndex.recordsByPath.get(path);

		if (!record) {
			continue;
		}

		seenPaths.add(path);
		records.push(record);
	}

	return records;
}

function loadStoredNoteLists(vaultName: string) {
	pinnedNotePaths = readStoredNotePaths(pinnedNoteStoragePrefix, vaultName);
	recentNotePaths = readStoredNotePaths(recentNoteStoragePrefix, vaultName).slice(0, maxRecentNotes);
}

function savePinnedNotePaths(paths: string[]) {
	pinnedNotePaths = uniqueNotePaths(paths);
	writeStoredNotePaths(pinnedNoteStoragePrefix, pinnedNotePaths);
}

function saveRecentNotePaths(paths: string[]) {
	recentNotePaths = uniqueNotePaths(paths).slice(0, maxRecentNotes);
	writeStoredNotePaths(recentNoteStoragePrefix, recentNotePaths);
}

function readStoredNotePaths(prefix: string, vaultName: string) {
	try {
		const storedValue = window.localStorage.getItem(getNoteStorageKey(prefix, vaultName));
		const storedPaths = storedValue ? JSON.parse(storedValue) : [];

		if (!Array.isArray(storedPaths)) {
			return [];
		}

		return uniqueNotePaths(storedPaths.filter((path): path is string => typeof path === 'string'));
	} catch {
		return [];
	}
}

function writeStoredNotePaths(prefix: string, paths: string[]) {
	if (!vaultHandle) {
		return;
	}

	try {
		window.localStorage.setItem(getNoteStorageKey(prefix, vaultHandle.name), JSON.stringify(paths));
	} catch {
		// Browsers may deny localStorage in hardened profiles; the vault remains usable without it.
	}
}

function getNoteStorageKey(prefix: string, vaultName: string) {
	return `${prefix}:${vaultName || 'vault'}`;
}

function uniqueNotePaths(paths: string[]) {
	const seenPaths = new Set<string>();
	const uniquePaths: string[] = [];

	for (const path of paths) {
		const trimmedPath = path.trim();

		if (!trimmedPath || seenPaths.has(trimmedPath)) {
			continue;
		}

		seenPaths.add(trimmedPath);
		uniquePaths.push(trimmedPath);
	}

	return uniquePaths;
}

function getSelectedExportBodyHtml() {
	if (selectedCollection) {
		const summariesHtml = renderCollectionSummariesHtml(collectionSummaries);
		const withSummaries = (bodyHtml: string) => [summariesHtml, bodyHtml].filter(Boolean).join('\n');

		if (selectedCollection.view.type.toLowerCase() === 'kanban') {
			return withSummaries(renderCollectionKanbanHtml(collectionRecords, selectedCollection.columns, selectedCollection.view));
		}

		if (selectedCollection.view.type.toLowerCase() === 'timeline') {
			return withSummaries(renderCollectionTimelineHtml(collectionRecords, selectedCollection.columns, selectedCollection.view));
		}

		return withSummaries(renderCollectionTableHtml(collectionRecords, selectedCollection.columns));
	}

	if (
		selectedFile &&
		(selectedFile.extension === '.md' || selectedFile.extension === '.svx') &&
		!(selectedFile.extension === '.md' && isExcalidrawNote(selectedContent))
	) {
		return renderLocalMarkdown(selectedContent, selectedFile);
	}

	if (selectedFile?.extension === '.md' && isExcalidrawNote(selectedContent)) {
		return renderExcalidrawNotePreview(selectedContent);
	}

	if (selectedFile && isDatahoarderBoardFile(selectedFile.path)) {
		return renderLocalBoard(selectedContent, selectedFile.path);
	}

	if (previewHtml) {
		return previewHtml;
	}

	return renderSourceHtml(selectedContent);
}

function renderPublicRecordBodyHtml(
	record: VaultRecord,
	entry: PublicPublishEntry,
	entries: PublicPublishEntry[]
) {
	if (record.extension === '.md' && isExcalidrawNote(record.content)) {
		return renderExcalidrawNotePreview(record.content);
	}

	if (record.extension === '.md' || record.extension === '.svx') {
		const notePaths = entries.map((publicEntry) => publicEntry.routePath);

		return renderPortableMarkdown(record.content, {
			currentPath: record.routePath,
			notePaths,
			resolveEmbedContent: (notePath) => {
				const targetEntry = getPublicPublishEntry(entries, notePath);
				return targetEntry ? (vaultIndex.recordsByPath.get(targetEntry.sourcePath)?.content ?? null) : null;
			},
			resolveNoteHref: (notePath, heading) => {
				const targetEntry = getPublicPublishEntry(entries, notePath);
				return getPublicPublishHref(entry.outputPath, targetEntry?.outputPath ?? '', heading);
			}
		});
	}

	if (isDatahoarderBoardFile(record.path)) {
		return renderDatahoarderBoard(record.content, {
			path: record.path,
			resolveNoteHref: (notePath, heading) => {
				const targetEntry = getPublicPublishEntry(entries, notePath);

				return targetEntry ? getPublicPublishHref(entry.outputPath, targetEntry.outputPath, heading) : '';
			}
		});
	}

	return renderSourceHtml(record.content);
}

function getPublicPublishEntry(entries: PublicPublishEntry[], routePath: string) {
	const normalizedRoutePath = routePath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').toLowerCase();
	const normalizedRoutePathWithoutExtension = stripCompiledNoteExtension(normalizedRoutePath);

	return entries.find((entry) => {
		const entryRoutePath = entry.routePath.toLowerCase();
		const entrySourcePath = entry.sourcePath.toLowerCase();

		return (
			entryRoutePath === normalizedRoutePath ||
			entrySourcePath === normalizedRoutePath ||
			entryRoutePath === normalizedRoutePathWithoutExtension ||
			stripCompiledNoteExtension(entrySourcePath) === normalizedRoutePathWithoutExtension
		);
	}) ?? null;
}

function getLocalEmbedContent(notePath: string) {
	const normalizedNotePath = notePath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');

	return (
		vaultIndex.recordsByRoutePath.get(normalizedNotePath)?.content ??
		vaultIndex.recordsByPath.get(normalizedNotePath)?.content ??
		null
	);
}

async function writeOrCreateLocalTextFile(path: string, content: string, defaultExtension = '') {
	if (!vaultHandle) {
		throw new Error('Open a local folder before writing files.');
	}

	const normalizedPath = normalizeLocalTextPath(path, defaultExtension);
	const existingFile = files.find((file) => file.path.toLowerCase() === normalizedPath.toLowerCase());

	if (existingFile) {
		await writeLocalFile(existingFile, content);
		return existingFile.path;
	}

	return createLocalFile(vaultHandle, normalizedPath, content, defaultExtension);
}

function downloadTextFile(fileName: string, content: string, type: string) {
	const blob = new Blob([content], { type });
	const url = window.URL.createObjectURL(blob);
	const anchor = document.createElement('a');

	anchor.href = url;
	anchor.download = fileName;
	anchor.rel = 'noopener';
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	window.URL.revokeObjectURL(url);
}

function slugifyDownloadName(name: string) {
	const slug = name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');

	return slug || 'collection';
}

function renderLocalMarkdown(
	content: string,
	file: LocalVaultFile,
	options: { interactiveTaskLists?: boolean } = {}
) {
	return renderPortableMarkdown(content, {
		currentPath: file.routePath,
		interactiveTaskLists: options.interactiveTaskLists ?? false,
		notePaths: getLocalNotePaths(),
		resolveEmbedContent: getLocalEmbedContent,
		resolveNoteHref: getLocalNoteHref
	});
}

function renderLocalBoard(content: string, path: string) {
	return renderDatahoarderBoard(content, {
		path,
		resolveNoteHref: getLocalNoteHref
	});
}

function getLocalNotePaths() {
	return files
		.filter((file) => file.extension === '.md' || file.extension === '.svx' || file.extension === '.svelte')
		.map((file) => file.routePath);
}

function getLocalNoteHref(notePath: string, heading: string) {
	const params = new URLSearchParams({ note: notePath });

	if (heading) {
		params.set('heading', heading);
	}

	return `#${params.toString()}`;
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

	if (!files.some((file) => file.routePath === notePath || file.path === notePath)) {
		status = `Linked note not found: ${notePath}`;
		return;
	}

	void selectFile(notePath);
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

	if (!selectedFile || loading || saving || !Number.isInteger(taskIndex)) {
		input.checked = !input.checked;
		return;
	}

	if (selectedFile.extension !== '.md' && selectedFile.extension !== '.svx') {
		input.checked = !input.checked;
		return;
	}

	if (dirty && !window.confirm('Save current edits with this task update?')) {
		input.checked = !input.checked;
		return;
	}

	if (!(await canMutateVault())) {
		input.checked = !input.checked;
		return;
	}

	saving = true;
	errorMessage = '';

	try {
		const nextContent = toggleMarkdownTask(selectedContent, {
			checked: input.checked,
			taskIndex
		});

		await writeLocalFile(selectedFile, nextContent);
		selectedContent = nextContent;
		savedContent = nextContent;
		syncMonacoContent(nextContent);
		vaultIndex = await buildLocalVaultIndex(files, {
			changedPaths: [selectedFile.path],
			previousIndex: vaultIndex
		});
		status = `${input.checked ? 'Completed' : 'Reopened'} task ${taskIndex + 1} in ${selectedFile.path}`;
	} catch (error) {
		input.checked = !input.checked;
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

function previewLinkNavigation(node: HTMLElement) {
	node.addEventListener('click', handlePreviewClick);
	node.addEventListener('change', handlePreviewChange);

	return {
		destroy() {
			node.removeEventListener('click', handlePreviewClick);
			node.removeEventListener('change', handlePreviewChange);
		}
	};
}

function sortCollectionBy(column: string) {
	if (collectionSortColumn === column) {
		collectionSortDirection = collectionSortDirection === 'asc' ? 'desc' : 'asc';
		return;
	}

	collectionSortColumn = column;
	collectionSortDirection = 'asc';
}

function selectCollectionView(viewIndex: number) {
	collectionCellEdit = null;
	lastCollectionViewDefaultsKey = '';
	selectedCollectionViewIndex = viewIndex;
}

function applyCollectionViewDefaults(collection: ResolvedCollection) {
	collectionFilter = collection.view.filter;
	collectionSortColumn = getCollectionViewSortColumn(collection);
	collectionSortDirection = collection.view.sortDirection;
}

function getCollectionViewDefaultsKey(collection: ResolvedCollection) {
	return [
		collection.definition.path,
		collection.viewIndex,
		collection.view.filter,
		collection.view.sortColumn,
		collection.view.sortDirection
	].join('\u001e');
}

function getCollectionViewSortColumn(collection: ResolvedCollection) {
	return collection.columns.includes(collection.view.sortColumn)
		? collection.view.sortColumn
		: (collection.columns[0] ?? 'title');
}

function getCollectionSortIndicator(column: string) {
	if (collectionSortColumn !== column) {
		return '';
	}

	return collectionSortDirection;
}

function getCollectionColumnLabel(column: string) {
	return column.replace(/[-_]+/gu, ' ').replace(/\b\w/gu, (character) => character.toUpperCase());
}

function openCollectionRecord(record: VaultRecord) {
	void selectFile(record.routePath);
}

function isEditingCollectionCell(record: VaultRecord, column: string) {
	return collectionCellEdit?.recordPath === record.path && collectionCellEdit.column === column;
}

function getCollectionCellInputKind(column: string) {
	const type = selectedCollection ? (getCollectionField(selectedCollection.definition, column)?.type.toLowerCase() ?? '') : '';
	const options = getCollectionCellOptions(column);

	if (options.length || type === 'select') {
		return 'select';
	}

	if (type === 'number' || type === 'integer' || type === 'float') {
		return 'number';
	}

	if (type === 'date') {
		return 'date';
	}

	if (type === 'boolean' || type === 'bool') {
		return 'boolean';
	}

	return 'text';
}

function getCollectionCellOptions(column: string) {
	const field = selectedCollection ? getCollectionField(selectedCollection.definition, column) : null;
	const options = field?.options ?? [];

	if (!options.length) {
		return [];
	}

	const currentValue = collectionCellEdit?.column === column ? collectionCellEdit.value.trim() : '';

	return currentValue && !options.some((option) => option.toLowerCase() === currentValue.toLowerCase())
		? [currentValue, ...options]
		: options;
}

function submitCollectionCellEdit(event: SubmitEvent, record: VaultRecord, column: string) {
	event.preventDefault();
	void saveCollectionCellEdit(record, column);
}

function handleCollectionCellEditorKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		event.preventDefault();
		cancelCollectionCellEdit();
	}
}

function updateCollectionCellEditValueFromControl(event: Event) {
	const control = event.currentTarget as HTMLInputElement | HTMLSelectElement;

	updateCollectionCellEditValue(control.value);
}

function isEditableCollectionColumn(column: string) {
	return (
		!['basename', 'folder', 'path', 'preview', 'tags', 'title', 'updatedat'].includes(column.toLowerCase()) &&
		(!selectedCollection || !isComputedCollectionColumn(selectedCollection.definition, column))
	);
}

function hasOwnCaseInsensitiveProperty(properties: Record<string, unknown>, key: string) {
	const normalizedKey = key.trim().toLowerCase();

	return Object.keys(properties).some((propertyKey) => propertyKey.trim().toLowerCase() === normalizedKey);
}

function openSearchResult(result: VaultSearchResult) {
	void selectFile(result.record.routePath);
}

function pruneSelectedPublicPublishProfile() {
	if (
		selectedPublicPublishProfilePath &&
		!publicPublishProfiles.some((profile) => profile.path === selectedPublicPublishProfilePath)
	) {
		selectedPublicPublishProfilePath = '';
	}
}

function applySavedVaultSearch(search: SavedVaultSearch) {
	vaultSearchQuery = search.query;
	status = `Applied saved search ${search.name}`;
}

async function saveCurrentVaultSearch() {
	if (!vaultHandle || loading || saving) {
		return;
	}

	const query = vaultSearchQuery.trim();

	if (!query) {
		status = 'Enter a search query before saving it.';
		return;
	}

	if (!(await canMutateVault())) {
		return;
	}

	const requestedName = window.prompt('Saved search name', query);

	if (requestedName === null) {
		return;
	}

	const name = requestedName.trim();

	if (!name) {
		errorMessage = 'Saved search name is required.';
		return;
	}

	saving = true;
	errorMessage = '';

	try {
		const path = getSavedVaultSearchPath(name, files.map((file) => file.path));
		const content = createSavedVaultSearchContent({ name, query });

		await createLocalFile(vaultHandle, path, content, '.json');
		await reloadVaultAfterFileOperation(`Saved search ${name}.`, selectedPath || selectedFile?.path || '');
		vaultSearchQuery = query;
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

async function deleteSavedVaultSearch(search: SavedVaultSearch) {
	if (!vaultHandle || loading || saving) {
		return;
	}

	if (!window.confirm(`Delete saved search ${search.name}?`)) {
		return;
	}

	if (!(await canMutateVault())) {
		return;
	}

	saving = true;
	errorMessage = '';

	try {
		await deleteLocalFile(vaultHandle, search.path);
		await reloadVaultAfterFileOperation(`Deleted saved search ${search.name}.`, selectedPath || selectedFile?.path || '');
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

function getAvailableNotePath(basePath: string) {
	const normalizedBasePath = normalizeLocalTextPath(basePath, '.md');
	const existingPaths = new Set(files.map((file) => file.path.toLowerCase()));
	const existingRoutePaths = new Set(files.map((file) => file.routePath.toLowerCase()));

	if (
		!existingPaths.has(normalizedBasePath.toLowerCase()) &&
		!existingRoutePaths.has(getLocalRoutePath(normalizedBasePath).toLowerCase())
	) {
		return normalizedBasePath;
	}

	const extensionIndex = normalizedBasePath.lastIndexOf('.');
	const stem = extensionIndex > 0 ? normalizedBasePath.slice(0, extensionIndex) : normalizedBasePath;
	const extension = extensionIndex > 0 ? normalizedBasePath.slice(extensionIndex) : '.md';

	for (let index = 2; index < 1000; index += 1) {
		const candidate = `${stem} ${index}${extension}`;

		if (
			!existingPaths.has(candidate.toLowerCase()) &&
			!existingRoutePaths.has(getLocalRoutePath(candidate).toLowerCase())
		) {
			return candidate;
		}
	}

	return normalizedBasePath;
}

function assertNoManagedPathCollision(path: string, currentPath = '') {
	const normalizedPath = path.toLowerCase();
	const normalizedRoutePath = getLocalRoutePath(path).toLowerCase();
	const normalizedCurrentPath = currentPath.toLowerCase();

	for (const file of files) {
		if (file.path.toLowerCase() === normalizedCurrentPath) {
			continue;
		}

		if (
			file.path.toLowerCase() === normalizedPath ||
			file.routePath.toLowerCase() === normalizedRoutePath
		) {
			throw new Error(`A managed file already exists at ${file.path}.`);
		}
	}
}

async function initializeMonaco() {
	if (monacoState === 'loading' || monacoState === 'ready') {
		return;
	}

	monacoState = 'loading';

	try {
		if (!editorHost) {
			throw new Error('Editor host was not ready.');
		}

		const monaco = await loadMonaco();
		configureMonacoWorkers();

		if (!editorHost) {
			throw new Error('Editor host was not ready.');
		}

		monacoEditor = monaco.editor.create(editorHost, {
			automaticLayout: true,
			fontFamily: 'var(--font-mono)',
			fontSize: 14,
			language: getEditorLanguage(selectedFile),
			lineNumbersMinChars: 3,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			tabSize: 2,
			value: selectedContent,
			wordWrap: 'on'
		});
		monacoSubscription = monacoEditor.onDidChangeModelContent(() => {
			const nextValue = monacoEditor?.getValue() ?? '';

			if (nextValue !== selectedContent) {
				selectedContent = nextValue;
			}
		});
		monacoState = 'ready';
		await tick();
		monacoEditor.layout();
		updateMonacoLanguage(selectedFile);
	} catch {
		monacoState = 'fallback';
	}
}

async function loadMonaco() {
	monacoApi ??= await import('monaco-editor');

	return monacoApi;
}

function configureMonacoWorkers() {
	const scope = globalThis as MonacoEnvironmentGlobal;

	if (scope.MonacoEnvironment?.getWorker) {
		return;
	}

	scope.MonacoEnvironment = {
		...scope.MonacoEnvironment,
		getWorker(_workerId: string, label: string) {
			switch (label) {
				case 'css':
				case 'less':
				case 'scss':
					return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), {
						type: 'module'
					});
				case 'handlebars':
				case 'html':
				case 'razor':
					return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), {
						type: 'module'
					});
				case 'javascript':
				case 'typescript':
					return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), {
						type: 'module'
					});
				case 'json':
					return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), {
						type: 'module'
					});
				default:
					return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
						type: 'module'
					});
			}
		}
	};
}

function syncMonacoContent(content: string) {
	if (!monacoEditor || monacoEditor.getValue() === content) {
		return;
	}

	monacoEditor.setValue(content);
}

function updateMonacoLanguage(file: LocalVaultFile | null) {
	const model = monacoEditor?.getModel();

	if (!model || !monacoApi) {
		return;
	}

	monacoApi.editor.setModelLanguage(model, getEditorLanguage(file));
}

function queuePreviewMathTypeset() {
	const token = ++mathTypesetToken;

	void tick().then(async () => {
		const mathJax = await loadMathJax();

		if (token !== mathTypesetToken || !mathJax?.typesetPromise || !markdownPreviewHost) {
			return;
		}

		await mathJax.startup?.promise;
		await mathJax.typesetPromise([markdownPreviewHost]);
	});
}

async function loadMathJax() {
	const datahoarderWindow = window as unknown as DatahoarderWindow;

	if (datahoarderWindow.MathJax?.typesetPromise) {
		return datahoarderWindow.MathJax;
	}

	mathJaxLoadPromise ??= new Promise<MathJaxApi | null>((resolve) => {
		configureMathJax();

		const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${mathJaxScriptSrc}"]`);
		const script = existingScript ?? document.createElement('script');

		script.addEventListener('load', () => resolve(datahoarderWindow.MathJax ?? null), { once: true });
		script.addEventListener('error', () => resolve(null), { once: true });

		if (!existingScript) {
			script.async = true;
			script.src = mathJaxScriptSrc;
			document.head.append(script);
		}
	});

	return mathJaxLoadPromise;
}

function configureMathJax() {
	const datahoarderWindow = window as unknown as DatahoarderWindow;

	if (datahoarderWindow.MathJax?.typesetPromise) {
		return;
	}

	datahoarderWindow.MathJax = {
		...datahoarderWindow.MathJax,
		loader: {
			load: ['[tex]/ams']
		},
		tex: {
			packages: { '[+]': ['ams'] },
			inlineMath: [
				['$', '$'],
				['\\(', '\\)']
			],
			displayMath: [
				['$$', '$$'],
				['\\[', '\\]']
			],
			processEscapes: true,
			processEnvironments: true
		},
		svg: {
			fontCache: 'global'
		},
		options: {
			skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
		}
	};
}

function hasMath(content: string) {
	return /(?:\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\(.+?\\\)|(^|[^\\])\$[^\s$](?:[^$]*[^\s$])?\$)/u.test(
		content
	);
}


function getEditorLanguage(file: LocalVaultFile | null) {
	if (!file) {
		return 'markdown';
	}

	switch (file.extension) {
		case '.base':
		case '.yaml':
		case '.yml':
			return 'yaml';
		case '.css':
		case '.scss':
			return 'css';
		case '.html':
			return 'html';
		case '.js':
			return 'javascript';
		case '.json':
			return 'json';
		case '.svelte':
			return 'html';
		case '.ts':
			return 'typescript';
		default:
			return 'markdown';
	}
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Unknown error';
}

function escapeHtml(text: string) {
	return text.replace(/[&<>"']/gu, (character) => {
		switch (character) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			case "'":
				return '&#39;';
			default:
				return character;
		}
	});
}
</script>

<svelte:head>
	<title>Datahoarder</title>
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

<main class="datahoarder-shell">
	<header class="topbar">
		<div>
			<p>Datahoarder</p>
			<h1>Local Vault</h1>
		</div>

		<div class="actions">
			<button type="button" class="command-button" onclick={() => openCommandPalette()} aria-keyshortcuts="Control+K Meta+K">
				Command
			</button>
			<button type="button" onclick={chooseFolder} disabled={!supported || loading}>
				Open Folder
			</button>
			<button type="button" onclick={reopenStoredFolder} disabled={!supported || loading || !vaultHandle}>
				Reopen
			</button>
			<button type="button" onclick={refreshVault} disabled={!supported || loading || !vaultHandle}>
				Refresh
			</button>
			<button type="button" onclick={createNote} disabled={!supported || loading || !vaultHandle}>
				New Note
			</button>
			<button type="button" onclick={createDrawingNote} disabled={!supported || loading || !vaultHandle}>
				New Drawing
			</button>
			<button type="button" onclick={addCanvasElement} disabled={loading || saving || !selectedExcalidrawNote}>
				Add Canvas Element
			</button>
			<button type="button" onclick={createNoteFromTemplate} disabled={!supported || loading || !vaultHandle}>
				New From Template
			</button>
			<button type="button" onclick={renameSelectedFile} disabled={loading || !selectedFile}>
				Rename
			</button>
			<button
				type="button"
				onclick={toggleSelectedPin}
				disabled={loading || !selectedRecord}
				aria-pressed={selectedFilePinned}
			>
				{selectedFilePinned ? 'Unpin' : 'Pin'}
			</button>
			<button type="button" onclick={setSelectedInlineField} disabled={loading || !selectedRecord || saving}>
				Set Field
			</button>
			<button type="button" onclick={deleteSelectedFile} disabled={loading || !selectedFile}>
				Delete
			</button>
			<button type="button" onclick={downloadSelectedHtmlExport} disabled={loading || !selectedFile}>
				Export HTML
			</button>
			{#if publicPublishProfiles.length}
				<select
					class="publish-profile-select"
					bind:value={selectedPublicPublishProfilePath}
					aria-label="Publish profile"
					disabled={!supported || loading || !vaultHandle || saving}
				>
					<option value="">Public markers</option>
					{#each publicPublishProfiles as profile (profile.path)}
						<option value={profile.path}>{profile.name}</option>
					{/each}
				</select>
			{/if}
			<button
				type="button"
				onclick={publishPublicNotes}
				disabled={!supported || loading || !vaultHandle || saving}
				title={publicRecords.length ? `Publish ${publicRecords.length} notes` : 'No publishable notes found'}
			>
				Publish Public
			</button>
			<button type="button" class="primary" onclick={saveSelectedFile} disabled={!dirty || saving}>
				{saving ? 'Saving' : 'Save'}
			</button>
		</div>
	</header>

	{#if commandPaletteOpen}
		<div class="command-palette-backdrop">
			<button type="button" class="command-palette-scrim" onclick={closeCommandPalette} aria-label="Close command palette"></button>
			<div
				class="command-palette"
				role="dialog"
				aria-modal="true"
				aria-labelledby="command-palette-heading"
			>
				<header>
					<div>
						<p>Command Palette</p>
						<h2 id="command-palette-heading">Jump or act</h2>
					</div>
					<button type="button" onclick={closeCommandPalette} aria-label="Close command palette">
						Close
					</button>
				</header>

				<input
					bind:this={commandPaletteInput}
					type="search"
					bind:value={commandPaletteQuery}
					placeholder="Search commands and notes"
					aria-label="Command palette"
					onkeydown={handleCommandPaletteInputKeydown}
				/>

				{#if filteredCommandPaletteItems.length}
					<ul class="command-palette-results" aria-label="Command palette results">
						{#each filteredCommandPaletteItems as item (item.id)}
							<li>
								<button type="button" onclick={() => runCommandPaletteItem(item)}>
									<strong>{item.title}</strong>
									<span>{item.detail}</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="command-palette-empty">No matching commands.</p>
				{/if}
			</div>
		</div>
	{/if}

	<div class="workspace">
		<aside class="sidebar" aria-label="Local vault">
			<div class="sidebar-summary">
				<span>{files.length} files</span>
				<span>{noteCount} notes</span>
			</div>

			<div class="vault-search">
				<label for="vault-search-input">Search</label>
				<div class="vault-search-row">
					<input
						id="vault-search-input"
						type="search"
						bind:value={vaultSearchQuery}
						placeholder="Search vault"
						aria-label="Search vault"
						disabled={!vaultIndex.records.length}
					/>
					<button
						type="button"
						onclick={saveCurrentVaultSearch}
						disabled={!vaultHandle || loading || saving || !vaultSearchQuery.trim()}
					>
						Save
					</button>
				</div>

				{#if savedVaultSearches.length}
					<section class="saved-searches" aria-label="Saved searches">
						<ul>
							{#each savedVaultSearches as search (search.path)}
								<li>
									<button
										type="button"
										class="saved-search-apply"
										title={search.query}
										onclick={() => applySavedVaultSearch(search)}
									>
										<strong>{search.name}</strong>
										<span>{search.query}</span>
									</button>
									<button
										type="button"
										class="saved-search-delete"
										aria-label={`Delete saved search ${search.name}`}
										onclick={() => deleteSavedVaultSearch(search)}
										disabled={!vaultHandle || loading || saving}
									>
										Delete
									</button>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			</div>

			<div class="vault-browser">
				<div class="vault-main-browser">
					{#if searchingVault}
						<div class="search-results" aria-live="polite">
							<div class="search-count">
								<span>{vaultSearchResults.length} results</span>
							</div>

							{#if vaultSearchResults.length}
								<ul>
									{#each vaultSearchResults as result (result.record.path)}
										<li>
											<button
												type="button"
												class:active-search-result={result.record.path === selectedPath}
												onclick={() => openSearchResult(result)}
											>
												<strong>{result.record.title}</strong>
												<span>{result.record.path}</span>
												<small>{result.record.preview}</small>
												<em>{result.matches.join(', ')}</em>
											</button>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="empty-state">No matching notes.</p>
							{/if}
						</div>
					{:else if fileTree.length}
						<NoteTree nodes={fileTree} activePath={selectedPath} onSelect={selectFile} rootLabel="Files" />
					{:else}
						<p class="empty-state">No editable text files are indexed yet.</p>
					{/if}
				</div>

				{#if !searchingVault && (pinnedNotes.length || recentNotes.length)}
					<div class="quick-notes" aria-label="Quick notes">
						{#if pinnedNotes.length}
							<section class="quick-note-section" aria-labelledby="pinned-notes-heading">
								<h2 id="pinned-notes-heading">Pinned</h2>
								<ul>
									{#each pinnedNotes as record (record.path)}
										<li class:active-quick-note={record.path === selectedPath}>
											<button
												type="button"
												class="quick-note-link"
												onclick={() => openStoredNoteRecord(record)}
											>
												<strong>{record.title}</strong>
												<span>{record.path}</span>
											</button>
											<button
												type="button"
												class="quick-note-pin"
												aria-label={`Unpin ${record.title}`}
												aria-pressed={true}
												onclick={() => togglePinnedPath(record.path)}
											>
												Unpin
											</button>
										</li>
									{/each}
								</ul>
							</section>
						{/if}

						{#if recentNotes.length}
							<section class="quick-note-section" aria-labelledby="recent-notes-heading">
								<h2 id="recent-notes-heading">Recent</h2>
								<ul>
									{#each recentNotes as record (record.path)}
										<li class:active-quick-note={record.path === selectedPath}>
											<button
												type="button"
												class="quick-note-link"
												onclick={() => openStoredNoteRecord(record)}
											>
												<strong>{record.title}</strong>
												<span>{record.path}</span>
											</button>
											<button
												type="button"
												class="quick-note-pin"
												aria-label={`Pin ${record.title}`}
												aria-pressed={false}
												onclick={() => togglePinnedPath(record.path)}
											>
												Pin
											</button>
										</li>
									{/each}
								</ul>
							</section>
						{/if}
					</div>
				{/if}
			</div>
		</aside>

		<section class="editor-pane" aria-label="Editor">
			{#if selectedFile}
				<header class="file-header">
					<div>
						<p>{selectedFile.extension || 'text'}</p>
						<h2>{getNoteTitle(selectedFile.path)}</h2>
					</div>
					<span>{selectedFile.path}</span>
				</header>

				<div class="source-editor">
					<div class:monaco-pending={monacoState !== 'ready'} class="monaco-host" bind:this={editorHost}></div>
					{#if monacoState !== 'ready'}
						<textarea
							class="fallback-editor"
							bind:value={selectedContent}
							spellcheck="false"
							aria-label="File source"
						></textarea>
					{/if}
				</div>
			{:else}
				<div class="empty-editor">
					<h2>No File Selected</h2>
					<p>Open a folder, then choose a file.</p>
				</div>
			{/if}
		</section>

		<section class="preview-pane" aria-label="Preview">
			{#if selectedCollection}
				<article class="collection-preview">
					<header>
						<p>{selectedCollection.view.type} collection</p>
						<h2>{selectedCollection.definition.name}</h2>
					</header>

					{#if selectedCollection.definition.views.length > 1}
						<div class="collection-view-tabs" aria-label="Collection views">
							{#each selectedCollection.definition.views as view, index (`${index}:${view.name}`)}
								<button
									type="button"
									class:active={index === selectedCollection.viewIndex}
									aria-pressed={index === selectedCollection.viewIndex}
									onclick={() => selectCollectionView(index)}
								>
									<span>{view.name}</span>
									<small>{view.type}</small>
								</button>
							{/each}
						</div>
					{/if}

					<div class="collection-toolbar">
						<span>
							{collectionRecords.length} of {selectedCollection.records.length} records
						</span>
						<button
							type="button"
							onclick={createCollectionRecord}
							disabled={!vaultHandle || loading || Boolean(collectionRecordCreationError)}
							title={collectionRecordCreationError || 'Create collection record'}
						>
							New Record
						</button>
						<button type="button" onclick={addFieldToSelectedCollection} disabled={!vaultHandle || loading || saving}>
							Add Field
						</button>
						<button
							type="button"
							onclick={bulkSetCollectionField}
							disabled={!vaultHandle || loading || saving || !collectionRecords.length}
						>
							Bulk Set Field
						</button>
						<button type="button" onclick={() => downloadCollectionExport('csv')} disabled={loading}>
							Export CSV
						</button>
						<button type="button" onclick={() => downloadCollectionExport('json')} disabled={loading}>
							Export JSON
						</button>
						<input
							type="search"
							bind:value={collectionFilter}
							placeholder="Filter records"
							aria-label="Filter collection records"
						/>
					</div>

					{#if collectionSummaries.length}
						<div class="collection-summary-grid" aria-label="Collection summaries">
							{#each collectionSummaries as summary (summary.label)}
								<section class="collection-summary">
									<span>{summary.label}</span>
									<strong>{summary.value}</strong>

									{#if summary.items.length}
										<ul>
											{#each summary.items as item (item.label)}
												<li>
													<span>{item.label}</span>
													<strong>{item.value}</strong>
												</li>
											{/each}
										</ul>
									{/if}
								</section>
							{/each}
						</div>
					{/if}

					{#if collectionRecords.length}
						{#if selectedCollection.view.type.toLowerCase() === 'kanban'}
							<div class="collection-kanban-board" aria-label={`${selectedCollection.definition.name} kanban board`}>
								{#each collectionKanbanGroups as group (group.key)}
									<section class="collection-kanban-lane" aria-label={`${group.label} lane`}>
										<header>
											<h3>{group.label}</h3>
											<span>{group.records.length} records</span>
										</header>

										<div class="collection-kanban-cards">
											{#each group.records as record (record.path)}
												<article class="collection-kanban-card">
													<button
														type="button"
														class="record-link"
														onclick={() => openCollectionRecord(record)}
													>
														{formatCollectionRecordValue(record, 'title')}
													</button>

													<ul>
														{#each selectedCollection.columns.filter((column) => !['title', collectionKanbanGroupBy].includes(column.toLowerCase())) as column}
															<li>
																<span>{getCollectionColumnLabel(column)}</span>
																{#if isEditableCollectionColumn(column)}
																	{#if isEditingCollectionCell(record, column) && collectionCellEdit}
																		<form
																			class="collection-cell-form"
																			onsubmit={(event) => submitCollectionCellEdit(event, record, column)}
																		>
																			{#if getCollectionCellInputKind(column) === 'select'}
																				<select
																					value={collectionCellEdit.value}
																					onchange={updateCollectionCellEditValueFromControl}
																					onkeydown={handleCollectionCellEditorKeydown}
																					aria-label={`${getCollectionColumnLabel(column)} for ${record.title}`}
																				>
																					<option value="">No value</option>
																					{#each getCollectionCellOptions(column) as option (option)}
																						<option value={option}>{option}</option>
																					{/each}
																				</select>
																			{:else if getCollectionCellInputKind(column) === 'boolean'}
																				<select
																					value={collectionCellEdit.value}
																					onchange={updateCollectionCellEditValueFromControl}
																					onkeydown={handleCollectionCellEditorKeydown}
																					aria-label={`${getCollectionColumnLabel(column)} for ${record.title}`}
																				>
																					<option value="">No value</option>
																					<option value="true">true</option>
																					<option value="false">false</option>
																				</select>
																			{:else}
																				<input
																					type={getCollectionCellInputKind(column)}
																					value={collectionCellEdit.value}
																					oninput={updateCollectionCellEditValueFromControl}
																					onkeydown={handleCollectionCellEditorKeydown}
																					aria-label={`${getCollectionColumnLabel(column)} for ${record.title}`}
																				/>
																			{/if}
																			<button type="submit" disabled={saving} aria-label={`Save ${getCollectionColumnLabel(column)} for ${record.title}`}>
																				Save
																			</button>
																			<button type="button" onclick={cancelCollectionCellEdit} aria-label={`Cancel ${getCollectionColumnLabel(column)} for ${record.title}`}>
																				Cancel
																			</button>
																		</form>
																	{:else}
																		<button
																			type="button"
																			class="collection-cell-edit"
																			onclick={() => editCollectionRecordField(record, column)}
																			disabled={loading || saving}
																			aria-label={`Edit ${getCollectionColumnLabel(column)} for ${record.title}: ${formatCollectionRecordValue(record, column) || 'empty'}`}
																		>
																			{formatCollectionRecordValue(record, column) || 'Set value'}
																		</button>
																	{/if}
																{:else}
																	<strong>{formatCollectionRecordValue(record, column)}</strong>
																{/if}
															</li>
														{/each}
													</ul>
												</article>
											{/each}
										</div>
									</section>
								{/each}
							</div>
						{:else if selectedCollection.view.type.toLowerCase() === 'timeline'}
							<div class="collection-timeline-list" aria-label={`${selectedCollection.definition.name} timeline`}>
								{#each collectionTimelineItems as item (item.record.path)}
									<article class="collection-timeline-item">
										<time>{item.dateLabel}</time>

										<div class="collection-timeline-card">
											<button
												type="button"
												class="record-link"
												onclick={() => openCollectionRecord(item.record)}
											>
												{formatCollectionRecordValue(item.record, 'title')}
											</button>

											<ul>
												{#each selectedCollection.columns.filter((column) => !['title', collectionTimelineDateField.toLowerCase()].includes(column.toLowerCase())) as column}
													<li>
														<span>{getCollectionColumnLabel(column)}</span>
														{#if isEditableCollectionColumn(column)}
															{#if isEditingCollectionCell(item.record, column) && collectionCellEdit}
																<form
																	class="collection-cell-form"
																	onsubmit={(event) => submitCollectionCellEdit(event, item.record, column)}
																>
																	{#if getCollectionCellInputKind(column) === 'select'}
																		<select
																			value={collectionCellEdit.value}
																			onchange={updateCollectionCellEditValueFromControl}
																			onkeydown={handleCollectionCellEditorKeydown}
																			aria-label={`${getCollectionColumnLabel(column)} for ${item.record.title}`}
																		>
																			<option value="">No value</option>
																			{#each getCollectionCellOptions(column) as option (option)}
																				<option value={option}>{option}</option>
																			{/each}
																		</select>
																	{:else if getCollectionCellInputKind(column) === 'boolean'}
																		<select
																			value={collectionCellEdit.value}
																			onchange={updateCollectionCellEditValueFromControl}
																			onkeydown={handleCollectionCellEditorKeydown}
																			aria-label={`${getCollectionColumnLabel(column)} for ${item.record.title}`}
																		>
																			<option value="">No value</option>
																			<option value="true">true</option>
																			<option value="false">false</option>
																		</select>
																	{:else}
																		<input
																			type={getCollectionCellInputKind(column)}
																			value={collectionCellEdit.value}
																			oninput={updateCollectionCellEditValueFromControl}
																			onkeydown={handleCollectionCellEditorKeydown}
																			aria-label={`${getCollectionColumnLabel(column)} for ${item.record.title}`}
																		/>
																	{/if}
																	<button type="submit" disabled={saving} aria-label={`Save ${getCollectionColumnLabel(column)} for ${item.record.title}`}>
																		Save
																	</button>
																	<button type="button" onclick={cancelCollectionCellEdit} aria-label={`Cancel ${getCollectionColumnLabel(column)} for ${item.record.title}`}>
																		Cancel
																	</button>
																</form>
															{:else}
																<button
																	type="button"
																	class="collection-cell-edit"
																	onclick={() => editCollectionRecordField(item.record, column)}
																	disabled={loading || saving}
																	aria-label={`Edit ${getCollectionColumnLabel(column)} for ${item.record.title}: ${formatCollectionRecordValue(item.record, column) || 'empty'}`}
																>
																	{formatCollectionRecordValue(item.record, column) || 'Set value'}
																</button>
															{/if}
														{:else}
															<strong>{formatCollectionRecordValue(item.record, column)}</strong>
														{/if}
													</li>
												{/each}
											</ul>
										</div>
									</article>
								{/each}
							</div>
						{:else}
							<div class="collection-table-wrap">
							<table>
								<thead>
									<tr>
										{#each selectedCollection.columns as column}
											<th>
												<button
													type="button"
													class="table-sort"
													onclick={() => sortCollectionBy(column)}
													aria-label={`Sort by ${getCollectionColumnLabel(column)}`}
												>
													<span>{getCollectionColumnLabel(column)}</span>
													<small>{getCollectionSortIndicator(column)}</small>
												</button>
											</th>
										{/each}
									</tr>
								</thead>
								<tbody>
									{#each collectionRecords as record}
										<tr>
											{#each selectedCollection.columns as column}
												<td>
													{#if column === 'title'}
														<button
															type="button"
															class="record-link"
															onclick={() => openCollectionRecord(record)}
														>
															{formatCollectionRecordValue(record, column)}
														</button>
													{:else}
														{#if isEditableCollectionColumn(column)}
															{#if isEditingCollectionCell(record, column) && collectionCellEdit}
																<form
																	class="collection-cell-form"
																	onsubmit={(event) => submitCollectionCellEdit(event, record, column)}
																>
																	{#if getCollectionCellInputKind(column) === 'select'}
																		<select
																			value={collectionCellEdit.value}
																			onchange={updateCollectionCellEditValueFromControl}
																			onkeydown={handleCollectionCellEditorKeydown}
																			aria-label={`${getCollectionColumnLabel(column)} for ${record.title}`}
																		>
																			<option value="">No value</option>
																			{#each getCollectionCellOptions(column) as option (option)}
																				<option value={option}>{option}</option>
																			{/each}
																		</select>
																	{:else if getCollectionCellInputKind(column) === 'boolean'}
																		<select
																			value={collectionCellEdit.value}
																			onchange={updateCollectionCellEditValueFromControl}
																			onkeydown={handleCollectionCellEditorKeydown}
																			aria-label={`${getCollectionColumnLabel(column)} for ${record.title}`}
																		>
																			<option value="">No value</option>
																			<option value="true">true</option>
																			<option value="false">false</option>
																		</select>
																	{:else}
																		<input
																			type={getCollectionCellInputKind(column)}
																			value={collectionCellEdit.value}
																			oninput={updateCollectionCellEditValueFromControl}
																			onkeydown={handleCollectionCellEditorKeydown}
																			aria-label={`${getCollectionColumnLabel(column)} for ${record.title}`}
																		/>
																	{/if}
																	<button type="submit" disabled={saving} aria-label={`Save ${getCollectionColumnLabel(column)} for ${record.title}`}>
																		Save
																	</button>
																	<button type="button" onclick={cancelCollectionCellEdit} aria-label={`Cancel ${getCollectionColumnLabel(column)} for ${record.title}`}>
																		Cancel
																	</button>
																</form>
															{:else}
																<button
																	type="button"
																	class="collection-cell-edit"
																	onclick={() => editCollectionRecordField(record, column)}
																	disabled={loading || saving}
																	aria-label={`Edit ${getCollectionColumnLabel(column)} for ${record.title}: ${formatCollectionRecordValue(record, column) || 'empty'}`}
																>
																	{formatCollectionRecordValue(record, column) || 'Set value'}
																</button>
															{/if}
														{:else}
															{formatCollectionRecordValue(record, column)}
														{/if}
													{/if}
												</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						{/if}
					{:else}
						<div class="preview-empty collection-empty">
							<h2>No Records</h2>
							<p>Adjust the collection source or clear the filter.</p>
						</div>
					{/if}

					<details class="collection-source">
						<summary>Source</summary>
						<pre>{selectedContent}</pre>
					</details>
				</article>
			{:else if selectedFile?.extension === '.base'}
				<header>
					<p>.base</p>
					<h2>{getNoteTitle(selectedFile.path)}</h2>
				</header>

				{#if baseViews.length}
					<div class="base-views">
						{#each baseViews as view}
							<section>
								<h3>{view.name}</h3>
								<span>{view.type}</span>
							</section>
						{/each}
					</div>
				{/if}

				<pre>{selectedContent}</pre>
			{:else if previewHtml}
				<article class="markdown-preview" bind:this={markdownPreviewHost} use:previewLinkNavigation>
					{@html previewHtml}
				</article>

				{#if selectedBacklinks.length}
					<section class="backlinks" aria-label="Backlinks">
						<header>
							<p>{selectedBacklinks.length} backlinks</p>
							<h2>Backlinks</h2>
						</header>

						<ul>
							{#each selectedBacklinks as backlink (backlink.record.path)}
								<li>
									<button type="button" onclick={() => openBacklink(backlink)}>
										<strong>{backlink.record.title}</strong>
										<span>{backlink.record.path}</span>
										<small>{backlink.links.map((link) => link.label).join(', ')}</small>
									</button>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{:else if selectedFile}
				<div class="preview-empty">
					<h2>Source Only</h2>
					<p>Hosted preview renders portable markdown, base files, and Datahoarder board files. Custom Svelte execution stays in the notes project.</p>
				</div>
			{:else}
				<div class="preview-empty">
					<h2>Preview</h2>
					<p>Markdown and base previews appear here.</p>
				</div>
			{/if}
		</section>
	</div>

	<div class="bottom-banners">
		{#if errorMessage}
			<p class="error-message">{errorMessage}</p>
		{/if}

		{#if status || monacoState === 'fallback' || monacoState === 'loading' || dirty}
			<section class="status-row" aria-live="polite">
				{#if status}
					<span>{status}</span>
				{/if}
				{#if monacoState === 'fallback'}
					<span>Textarea fallback active.</span>
				{:else if monacoState === 'loading'}
					<span>Loading Monaco editor.</span>
				{/if}
				{#if dirty}
					<strong>Unsaved</strong>
				{/if}
			</section>
		{/if}
	</div>
</main>

<style>
:global(body) {
	margin: 0;
	background: oklch(0.97 0.015 235);
}

.datahoarder-shell {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr) auto;
	height: 100vh;
	height: 100dvh;
	min-height: 0;
	overflow: hidden;
	color: oklch(0.22 0.035 245);
}

.topbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.85rem 1rem;
	border-bottom: 1px solid oklch(0.78 0.03 235);
	background: oklch(0.99 0.01 235);
}

.topbar p,
.topbar h1,
.file-header p,
.file-header h2,
.preview-pane h2,
.preview-pane h3,
.preview-pane p {
	margin: 0;
}

.topbar p,
.file-header p,
.preview-pane header p {
	color: oklch(0.42 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
}

.topbar h1 {
	font-size: 1.2rem;
	line-height: 1.1;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	justify-content: flex-end;
}

button {
	min-height: 2rem;
	padding: 0.25rem 0.65rem;
	color: inherit;
	font: inherit;
	background: oklch(0.94 0.025 235);
	border: 1px solid oklch(0.73 0.04 235);
	border-radius: 0.35rem;
	cursor: pointer;
}

button:hover:not(:disabled) {
	background: oklch(0.9 0.04 220);
}

button:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 2px;
}

button:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}

.command-button {
	color: oklch(0.25 0.06 245);
	background: oklch(0.93 0.035 155);
	border-color: oklch(0.66 0.11 155);
}

.command-palette-backdrop {
	position: fixed;
	inset: 0;
	z-index: 30;
	display: grid;
	place-items: start center;
	padding: clamp(1rem, 8vh, 4rem) 1rem 1rem;
	background: oklch(0.16 0.035 245 / 0.42);
}

.command-palette-scrim {
	position: absolute;
	inset: 0;
	min-height: 0;
	padding: 0;
	background: transparent;
	border: 0;
	border-radius: 0;
}

.command-palette-scrim:hover:not(:disabled) {
	background: transparent;
}

.command-palette {
	position: relative;
	z-index: 1;
	display: grid;
	gap: 0.75rem;
	width: min(100%, 42rem);
	max-height: min(42rem, calc(100vh - 2rem));
	padding: 0.85rem;
	overflow: hidden;
	background: oklch(0.99 0.008 235);
	border: 1px solid oklch(0.76 0.04 235);
	border-radius: 0.45rem;
	box-shadow: 0 1.2rem 3rem oklch(0.16 0.04 245 / 0.24);
}

.command-palette header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
}

.command-palette p,
.command-palette h2 {
	margin: 0;
}

.command-palette header p {
	color: oklch(0.42 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
}

.command-palette h2 {
	font-size: 1.15rem;
	line-height: 1.1;
}

.command-palette input {
	width: 100%;
	min-height: 2.45rem;
	padding: 0.45rem 0.65rem;
	color: inherit;
	font: inherit;
	background: oklch(0.995 0.006 235);
	border: 1px solid oklch(0.72 0.045 235);
	border-radius: 0.35rem;
}

.command-palette input:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 2px;
}

.command-palette-results {
	display: grid;
	gap: 0.35rem;
	min-height: 0;
	margin: 0;
	padding: 0;
	overflow: auto;
	list-style: none;
}

.command-palette-results button {
	display: grid;
	gap: 0.12rem;
	width: 100%;
	padding: 0.55rem 0.65rem;
	text-align: left;
	background: oklch(0.955 0.018 235);
}

.command-palette-results button:hover:not(:disabled) {
	background: oklch(0.9 0.04 205);
}

.command-palette-results strong,
.command-palette-results span {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.command-palette-results strong {
	color: oklch(0.25 0.06 245);
}

.command-palette-results span,
.command-palette-empty {
	color: oklch(0.42 0.045 245);
	font-size: 0.82rem;
}

.command-palette-empty {
	margin: 0;
}

.publish-profile-select {
	max-width: 12rem;
	min-height: 2rem;
	padding: 0.25rem 0.5rem;
	color: inherit;
	font: inherit;
	background: oklch(0.985 0.006 235);
	border: 1px solid oklch(0.73 0.04 235);
	border-radius: 0.35rem;
}

.publish-profile-select:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 2px;
}

.publish-profile-select:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}

.primary {
	color: white;
	background: oklch(0.48 0.13 190);
	border-color: oklch(0.42 0.12 190);
}

.bottom-banners {
	min-height: 0;
}

.status-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.55rem;
	align-items: center;
	min-height: 2.15rem;
	padding: 0.35rem 1rem;
	color: oklch(0.34 0.04 245);
	font-family: var(--font-mono);
	font-size: 0.78rem;
	border-top: 1px solid oklch(0.82 0.025 235);
}

.status-row strong {
	color: oklch(0.47 0.14 55);
}

.error-message {
	margin: 0;
	padding: 0.55rem 1rem;
	color: oklch(0.34 0.13 30);
	background: oklch(0.94 0.07 45);
	border-top: 1px solid oklch(0.8 0.08 45);
}

.workspace {
	--vault-sidebar-width: 32rem;

	display: grid;
	grid-template-columns: var(--vault-sidebar-width) minmax(20rem, 1fr) minmax(18rem, 0.85fr);
	min-height: 0;
	overflow: hidden;
}

.sidebar,
.editor-pane,
.preview-pane {
	min-width: 0;
	min-height: 0;
	overflow: hidden;
	border-right: 1px solid oklch(0.8 0.025 235);
}

.sidebar {
	position: relative;
	z-index: 2;
	display: grid;
	grid-template-rows: auto auto minmax(0, 1fr);
	gap: 0.75rem;
	padding: 0.85rem;
	background: oklch(0.98 0.012 235);
}

.sidebar-summary {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.sidebar-summary span {
	padding: 0.3rem 0.45rem;
	font-family: var(--font-mono);
	font-size: 0.74rem;
	background: oklch(0.92 0.035 205);
	border: 1px solid oklch(0.75 0.045 210);
	border-radius: 0.35rem;
}

.vault-search {
	display: grid;
	gap: 0.3rem;
	min-width: 0;
}

.vault-search label,
.search-count span {
	color: oklch(0.42 0.06 255);
	font-family: var(--font-mono);
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
}

.vault-search-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.35rem;
	align-items: center;
	min-width: 0;
}

.vault-search input {
	width: 100%;
	min-height: 2rem;
	padding: 0.3rem 0.5rem;
	color: inherit;
	background: oklch(0.995 0.006 235);
	border: 1px solid oklch(0.75 0.04 235);
	border-radius: 0.35rem;
}

.vault-search input:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 2px;
}

.vault-search input:disabled {
	cursor: not-allowed;
	opacity: 0.6;
}

.vault-search-row button,
.saved-search-delete {
	min-height: 2rem;
	padding: 0.3rem 0.48rem;
	color: oklch(0.34 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.68rem;
	font-weight: 700;
	text-transform: uppercase;
}

.saved-searches {
	min-width: 0;
	max-height: 8.25rem;
	overflow: auto;
}

.saved-searches ul {
	display: grid;
	gap: 0.25rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.saved-searches li {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.3rem;
	align-items: stretch;
	min-width: 0;
}

.saved-search-apply {
	display: grid;
	gap: 0.05rem;
	min-width: 0;
	min-height: 2rem;
	padding: 0.3rem 0.45rem;
	text-align: left;
	background: oklch(0.95 0.02 155);
}

.saved-search-apply:hover:not(:disabled),
.saved-search-apply:focus-visible {
	background: oklch(0.89 0.045 155);
}

.saved-search-apply strong,
.saved-search-apply span {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.saved-search-apply strong {
	color: oklch(0.25 0.055 245);
	font-size: 0.8rem;
}

.saved-search-apply span {
	color: oklch(0.42 0.035 245);
	font-family: var(--font-mono);
	font-size: 0.68rem;
}

.vault-browser {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	min-height: 0;
	overflow: hidden;
}

.vault-main-browser {
	display: grid;
	flex: 1 1 auto;
	min-height: 0;
	overflow: hidden;
}

.quick-notes {
	display: grid;
	gap: 0.65rem;
	max-height: 15rem;
	padding-right: 0.15rem;
	overflow: auto;
}

.quick-note-section {
	display: grid;
	gap: 0.3rem;
}

.quick-note-section h2 {
	margin: 0;
	color: oklch(0.42 0.06 255);
	font-family: var(--font-mono);
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
}

.quick-note-section ul {
	display: grid;
	gap: 0.25rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.quick-note-section li {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.3rem;
	align-items: stretch;
	min-width: 0;
}

.quick-note-link,
.quick-note-pin {
	min-height: 1.9rem;
}

.quick-note-link {
	display: grid;
	gap: 0.05rem;
	min-width: 0;
	padding: 0.28rem 0.45rem;
	text-align: left;
	background: oklch(0.955 0.018 235);
}

.quick-note-link strong,
.quick-note-link span {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.quick-note-link strong {
	color: oklch(0.25 0.055 245);
	font-size: 0.84rem;
}

.quick-note-link span {
	color: oklch(0.42 0.035 245);
	font-family: var(--font-mono);
	font-size: 0.68rem;
}

.quick-note-pin {
	padding: 0 0.42rem;
	color: oklch(0.34 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.68rem;
	font-weight: 700;
	text-transform: uppercase;
}

.quick-note-section li:hover .quick-note-link,
.active-quick-note .quick-note-link {
	background: oklch(0.88 0.05 205);
}

.search-results {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	gap: 0.5rem;
	min-height: 0;
	overflow: hidden;
}

.search-results ul {
	display: grid;
	align-content: start;
	gap: 0.35rem;
	min-height: 0;
	margin: 0;
	padding: 0;
	overflow: auto;
	list-style: none;
}

.search-results button {
	display: grid;
	gap: 0.12rem;
	width: 100%;
	padding: 0.45rem 0.55rem;
	text-align: left;
	background: oklch(0.955 0.018 235);
}

.search-results button:hover:not(:disabled),
.active-search-result {
	background: oklch(0.88 0.05 205);
}

.search-results strong,
.search-results span,
.search-results small,
.search-results em {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.search-results strong {
	color: oklch(0.25 0.055 245);
}

.search-results span {
	color: oklch(0.42 0.035 245);
	font-family: var(--font-mono);
	font-size: 0.72rem;
}

.search-results small {
	color: oklch(0.36 0.04 245);
	font-size: 0.78rem;
}

.search-results em {
	color: oklch(0.38 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.68rem;
	font-style: normal;
	text-transform: uppercase;
}

.empty-state,
.preview-empty p,
.empty-editor p {
	color: oklch(0.42 0.035 245);
}

.editor-pane {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	background: oklch(0.985 0.006 235);
}

.file-header {
	display: flex;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.75rem 0.9rem;
	border-bottom: 1px solid oklch(0.82 0.025 235);
}

.file-header h2 {
	font-size: 1rem;
}

.file-header > span {
	align-self: end;
	overflow: hidden;
	max-width: 60%;
	color: oklch(0.42 0.035 245);
	font-family: var(--font-mono);
	font-size: 0.75rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.source-editor,
.monaco-host,
.fallback-editor {
	width: 100%;
	height: 100%;
	min-height: 0;
}

.source-editor {
	position: relative;
	overflow: hidden;
}

.monaco-pending {
	visibility: hidden;
	pointer-events: none;
}

.fallback-editor {
	position: absolute;
	inset: 0;
}

.fallback-editor {
	resize: none;
	padding: 0.85rem;
	color: oklch(0.21 0.035 245);
	font-family: var(--font-mono);
	font-size: 0.9rem;
	line-height: 1.45;
	background: oklch(0.99 0.006 235);
	border: 0;
	outline: none;
}

.empty-editor,
.preview-empty {
	display: grid;
	align-content: center;
	gap: 0.5rem;
	height: 100%;
	padding: 1rem;
	text-align: center;
}

.preview-pane {
	display: grid;
	align-content: start;
	gap: 1rem;
	padding: 1rem;
	overflow: auto;
	background: oklch(0.99 0.01 95);
	border-right: none;
}

.preview-pane header {
	display: grid;
	gap: 0.25rem;
}

.base-views {
	display: grid;
	gap: 0.45rem;
}

.base-views section {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.7rem;
	padding: 0.6rem 0.7rem;
	background: oklch(0.96 0.025 105);
	border: 1px solid oklch(0.78 0.05 100);
	border-radius: 0.35rem;
}

.base-views span {
	color: oklch(0.36 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.75rem;
	text-transform: uppercase;
}

.collection-preview {
	display: grid;
	gap: 0.85rem;
	min-width: 0;
}

.collection-view-tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
}

.collection-view-tabs button {
	display: inline-flex;
	align-items: baseline;
	gap: 0.35rem;
	min-height: 2rem;
	padding: 0.32rem 0.55rem;
	color: oklch(0.34 0.055 245);
	background: oklch(0.97 0.015 100);
	border: 1px solid oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

.collection-view-tabs button.active {
	color: oklch(0.22 0.06 245);
	background: oklch(0.91 0.04 150);
	border-color: oklch(0.62 0.12 155);
}

.collection-view-tabs small {
	color: inherit;
	font-family: var(--font-mono);
	font-size: 0.68rem;
	text-transform: uppercase;
	opacity: 0.72;
}

.collection-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.65rem;
}

.collection-toolbar span {
	color: oklch(0.38 0.04 245);
	font-family: var(--font-mono);
	font-size: 0.78rem;
}

.collection-toolbar input {
	min-width: min(100%, 14rem);
	min-height: 2rem;
	padding: 0.3rem 0.5rem;
	color: inherit;
	background: oklch(0.98 0.01 95);
	border: 1px solid oklch(0.76 0.04 105);
	border-radius: 0.35rem;
}

.collection-toolbar input:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 2px;
}

.collection-summary-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
	gap: 0.65rem;
	min-width: 0;
}

.collection-summary {
	display: grid;
	gap: 0.45rem;
	min-width: 0;
	padding: 0.7rem;
	background: oklch(0.995 0.006 95);
	border: 1px solid oklch(0.83 0.025 100);
	border-radius: 0.35rem;
}

.collection-summary > span {
	color: oklch(0.42 0.055 245);
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
}

.collection-summary > strong {
	color: oklch(0.25 0.05 245);
	font-size: 1.35rem;
	line-height: 1.1;
	overflow-wrap: anywhere;
}

.collection-summary ul {
	display: grid;
	gap: 0.25rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.collection-summary li {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
	color: oklch(0.42 0.045 245);
	font-size: 0.84rem;
}

.collection-summary li strong {
	color: oklch(0.28 0.05 245);
}

.collection-table-wrap {
	max-width: 100%;
	overflow: auto;
	border: 1px solid oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

.collection-kanban-board {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
	gap: 0.8rem;
	align-items: start;
	min-width: 0;
}

.collection-kanban-lane {
	display: grid;
	gap: 0.65rem;
	min-width: 0;
	padding: 0.7rem;
	background: oklch(0.965 0.018 105);
	border: 1px solid oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

.collection-kanban-lane header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 0.6rem;
	margin: 0;
	padding: 0;
	border: 0;
}

.collection-kanban-lane h3,
.collection-kanban-lane span,
.collection-kanban-card ul {
	margin: 0;
}

.collection-kanban-lane h3 {
	font-size: 0.95rem;
	line-height: 1.2;
}

.collection-kanban-lane header span {
	color: oklch(0.4 0.055 245);
	font-family: var(--font-mono);
	font-size: 0.72rem;
}

.collection-kanban-cards {
	display: grid;
	gap: 0.55rem;
}

.collection-kanban-card {
	display: grid;
	gap: 0.55rem;
	padding: 0.7rem;
	background: oklch(0.995 0.006 95);
	border: 1px solid oklch(0.83 0.025 100);
	border-radius: 0.35rem;
}

.collection-kanban-card ul {
	display: grid;
	gap: 0.45rem;
	padding: 0;
	list-style: none;
}

.collection-kanban-card li {
	display: grid;
	gap: 0.12rem;
}

.collection-kanban-card li > span {
	color: oklch(0.42 0.055 245);
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
}

.collection-kanban-card li > strong {
	font-size: 0.9rem;
}

.collection-timeline-list {
	display: grid;
	gap: 0.75rem;
	min-width: 0;
}

.collection-timeline-item {
	display: grid;
	grid-template-columns: minmax(7rem, 10rem) minmax(0, 1fr);
	gap: 0.75rem;
	align-items: start;
	min-width: 0;
}

.collection-timeline-item time {
	color: oklch(0.38 0.06 245);
	font-family: var(--font-mono);
	font-size: 0.78rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.collection-timeline-card {
	display: grid;
	gap: 0.55rem;
	min-width: 0;
	padding: 0.7rem;
	background: oklch(0.995 0.006 95);
	border: 1px solid oklch(0.83 0.025 100);
	border-radius: 0.35rem;
}

.collection-timeline-card ul {
	display: grid;
	gap: 0.45rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.collection-timeline-card li {
	display: grid;
	gap: 0.12rem;
	min-width: 0;
}

.collection-timeline-card li > span {
	color: oklch(0.42 0.055 245);
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
}

.collection-timeline-card li > strong {
	font-size: 0.9rem;
}

table {
	width: 100%;
	min-width: 36rem;
	border-collapse: collapse;
	background: oklch(0.995 0.005 95);
}

th,
td {
	padding: 0.5rem 0.6rem;
	text-align: left;
	vertical-align: top;
	border-bottom: 1px solid oklch(0.86 0.025 100);
}

th {
	position: sticky;
	top: 0;
	z-index: 1;
	background: oklch(0.96 0.025 105);
}

tbody tr:last-child td {
	border-bottom: 0;
}

td {
	max-width: 18rem;
	overflow-wrap: anywhere;
	font-size: 0.9rem;
}

.table-sort,
.record-link,
.collection-cell-edit {
	min-height: 0;
	padding: 0;
	border: 0;
	border-radius: 0;
	background: none;
}

.table-sort {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 0.5rem;
	width: 100%;
	color: oklch(0.28 0.05 245);
	font-weight: 700;
}

.table-sort:hover:not(:disabled),
.record-link:hover:not(:disabled),
.collection-cell-edit:hover:not(:disabled) {
	background: none;
}

.table-sort small {
	color: oklch(0.4 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.68rem;
	font-weight: 700;
	text-transform: uppercase;
}

.record-link {
	color: oklch(0.34 0.1 190);
	font-weight: 700;
	text-align: left;
	text-decoration: underline;
	text-decoration-thickness: 1px;
	text-underline-offset: 0.16em;
}

.collection-cell-edit {
	display: block;
	width: 100%;
	color: inherit;
	text-align: left;
	text-decoration: underline dotted oklch(0.55 0.08 190);
	text-decoration-thickness: 1px;
	text-underline-offset: 0.18em;
}

.collection-cell-edit:hover:not(:disabled),
.collection-cell-edit:focus-visible {
	color: oklch(0.28 0.1 190);
}

.collection-cell-form {
	display: grid;
	grid-template-columns: minmax(8rem, 1fr) auto auto;
	gap: 0.35rem;
	align-items: center;
	min-width: min(100%, 16rem);
}

.collection-cell-form input,
.collection-cell-form select {
	min-width: 0;
	min-height: 1.9rem;
	padding: 0.25rem 0.4rem;
	color: inherit;
	background: oklch(0.99 0.006 95);
	border: 1px solid oklch(0.7 0.06 105);
	border-radius: 0.3rem;
}

.collection-cell-form input:focus-visible,
.collection-cell-form select:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 1px;
}

.collection-cell-form button {
	min-height: 1.9rem;
	padding: 0.25rem 0.45rem;
	font-size: 0.78rem;
}

.collection-source {
	display: grid;
	gap: 0.55rem;
}

.collection-source summary {
	width: fit-content;
	color: oklch(0.3 0.05 245);
	font-weight: 700;
	cursor: pointer;
}

.collection-empty {
	min-height: 12rem;
	border: 1px dashed oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

.backlinks {
	display: grid;
	gap: 0.65rem;
	min-width: 0;
	padding-top: 0.85rem;
	border-top: 1px solid oklch(0.84 0.025 100);
}

.backlinks ul {
	display: grid;
	gap: 0.45rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.backlinks button {
	display: grid;
	gap: 0.12rem;
	width: 100%;
	padding: 0.55rem 0.65rem;
	text-align: left;
	background: oklch(0.975 0.012 95);
	border: 1px solid oklch(0.83 0.025 100);
	border-radius: 0.35rem;
}

.backlinks button:hover:not(:disabled) {
	background: oklch(0.94 0.025 120);
}

.backlinks strong,
.backlinks span,
.backlinks small {
	min-width: 0;
	overflow-wrap: anywhere;
}

.backlinks strong {
	color: oklch(0.26 0.08 190);
}

.backlinks span,
.backlinks small {
	color: oklch(0.42 0.045 245);
	font-size: 0.78rem;
}

.backlinks small {
	font-family: var(--font-mono);
}

pre {
	max-width: 100%;
	margin: 0;
	overflow: auto;
	white-space: pre-wrap;
}

.markdown-preview {
	display: grid;
	gap: 0.75rem;
	line-height: 1.45;
}

.markdown-preview :global(h1),
.markdown-preview :global(h2),
.markdown-preview :global(h3),
.markdown-preview :global(p),
.markdown-preview :global(ul),
.markdown-preview :global(ol),
.markdown-preview :global(blockquote),
.markdown-preview :global(.note-embed),
.markdown-preview :global(.markdown-table-wrapper),
.markdown-preview :global(.datahoarder-board),
.markdown-preview :global(.datahoarder-metrics),
.markdown-preview :global(pre) {
	margin: 0;
}

.markdown-preview :global(h1) {
	font-size: 2rem;
	line-height: 1.05;
}

.markdown-preview :global(h2) {
	font-size: 1.35rem;
	line-height: 1.1;
}

.markdown-preview :global(blockquote) {
	padding-left: 0.75rem;
	color: oklch(0.35 0.045 245);
	border-left: 3px solid oklch(0.7 0.07 190);
}

.markdown-preview :global(code),
.markdown-preview :global(pre) {
	font-family: var(--font-mono);
}

.markdown-preview :global(pre) {
	padding: 0.7rem;
	background: oklch(0.94 0.018 235);
	border-radius: 0.35rem;
}

.markdown-preview :global(.markdown-table-wrapper) {
	max-width: 100%;
	overflow: auto;
	border: 1px solid oklch(0.82 0.025 100);
	border-radius: 0.35rem;
}

.markdown-preview :global(.markdown-table) {
	min-width: min(32rem, 100%);
	border: 0;
}

.markdown-preview :global(.markdown-table th),
.markdown-preview :global(.markdown-table td) {
	border-bottom: 1px solid oklch(0.86 0.025 100);
}

.markdown-preview :global(.markdown-table th) {
	position: static;
	top: auto;
	z-index: auto;
	background: oklch(0.96 0.025 105);
}

.markdown-preview :global(.markdown-table tr:last-child td) {
	border-bottom: 0;
}

.markdown-preview :global(.markdown-table [data-align='center']) {
	text-align: center;
}

.markdown-preview :global(.markdown-table [data-align='right']) {
	text-align: right;
}

.markdown-preview :global(.task-list-item) {
	display: flex;
	gap: 0.45rem;
	align-items: flex-start;
	list-style: none;
}

.markdown-preview :global(.task-list-item input) {
	flex: 0 0 auto;
	width: 1rem;
	height: 1rem;
	margin: 0.22rem 0 0;
	accent-color: oklch(0.62 0.15 220);
}

.markdown-preview :global(.task-list-item span) {
	min-width: 0;
}

.markdown-preview :global(.note-embed) {
	display: grid;
	gap: 0.65rem;
	padding: 0.75rem;
	background: oklch(0.985 0.012 95);
	border: 1px solid oklch(0.78 0.04 100);
	border-left: 4px solid oklch(0.63 0.12 155);
	border-radius: 0.35rem;
}

.markdown-preview :global(.note-embed header) {
	display: flex;
	margin: 0;
	padding: 0;
	border: 0;
}

.markdown-preview :global(.note-embed header a) {
	color: oklch(0.28 0.08 155);
	font-size: 0.82rem;
	font-weight: 700;
	text-decoration: none;
}

.markdown-preview :global(.note-embed-body) {
	display: grid;
	gap: 0.65rem;
}

.markdown-preview :global(.note-embed-missing) {
	color: oklch(0.42 0.055 25);
	background: oklch(0.98 0.018 45);
	border-left-color: oklch(0.66 0.12 35);
}

.markdown-preview :global(.excalidraw-preview-svg) {
	width: 100%;
	max-height: 42rem;
	background: oklch(0.995 0.006 95);
	border: 1px solid oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

.markdown-preview :global(.datahoarder-sankey) {
	display: grid;
	gap: 0.45rem;
	padding: 0.75rem;
	background: oklch(0.995 0.006 95);
	border: 1px solid oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

.markdown-preview :global(.datahoarder-sankey-svg) {
	width: 100%;
	height: auto;
	min-height: 14rem;
}

.markdown-preview :global(.datahoarder-sankey-link) {
	stroke: oklch(0.62 0.15 220);
	stroke-linecap: round;
	stroke-opacity: 0.36;
}

.markdown-preview :global(.datahoarder-sankey-link-1) {
	stroke: oklch(0.62 0.13 155);
}

.markdown-preview :global(.datahoarder-sankey-link-2) {
	stroke: oklch(0.72 0.15 80);
}

.markdown-preview :global(.datahoarder-sankey-link-3) {
	stroke: oklch(0.62 0.16 35);
}

.markdown-preview :global(.datahoarder-sankey-link-4) {
	stroke: oklch(0.58 0.17 300);
}

.markdown-preview :global(.datahoarder-sankey-link-5) {
	stroke: oklch(0.64 0.13 190);
}

.markdown-preview :global(.datahoarder-sankey-link-6) {
	stroke: oklch(0.63 0.17 345);
}

.markdown-preview :global(.datahoarder-sankey-link-7) {
	stroke: oklch(0.5 0.05 245);
}

.markdown-preview :global(.datahoarder-sankey-node rect) {
	fill: oklch(0.32 0.06 245);
}

.markdown-preview :global(.datahoarder-sankey-label) {
	fill: oklch(0.22 0.05 245);
	font-size: 0.82rem;
	font-weight: 700;
}

.markdown-preview :global(.datahoarder-sankey-value) {
	fill: oklch(0.42 0.045 245);
	font-size: 0.72rem;
}

.markdown-preview :global(.datahoarder-sankey figcaption),
.markdown-preview :global(.datahoarder-sankey-empty) {
	color: oklch(0.42 0.045 245);
	font-family: var(--font-mono);
	font-size: 0.78rem;
}

.markdown-preview :global(.datahoarder-metrics) {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
	gap: 0.6rem;
}

.markdown-preview :global(.datahoarder-metric) {
	display: grid;
	gap: 0.35rem;
	min-width: 0;
	padding: 0.75rem;
	background: oklch(0.995 0.006 95);
	border: 1px solid oklch(0.78 0.04 100);
	border-left: 4px solid oklch(0.52 0.07 245);
	border-radius: 0.35rem;
}

.markdown-preview :global(.datahoarder-metric-label) {
	color: oklch(0.42 0.045 245);
	font-family: var(--font-mono);
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	overflow-wrap: anywhere;
}

.markdown-preview :global(.datahoarder-metric-value) {
	color: oklch(0.2 0.055 245);
	font-size: 1.35rem;
	line-height: 1.1;
	overflow-wrap: anywhere;
}

.markdown-preview :global(.datahoarder-metric-detail) {
	color: oklch(0.36 0.045 245);
	font-size: 0.82rem;
	overflow-wrap: anywhere;
}

.markdown-preview :global(.datahoarder-metric-good) {
	border-left-color: oklch(0.62 0.13 155);
}

.markdown-preview :global(.datahoarder-metric-warning) {
	border-left-color: oklch(0.72 0.15 80);
}

.markdown-preview :global(.datahoarder-metric-bad) {
	border-left-color: oklch(0.62 0.16 35);
}

.markdown-preview :global(.datahoarder-metric-info) {
	border-left-color: oklch(0.62 0.15 220);
}

.markdown-preview :global(.datahoarder-metrics-empty) {
	color: oklch(0.42 0.045 245);
	font-family: var(--font-mono);
	font-size: 0.78rem;
}

.markdown-preview :global(.datahoarder-board) {
	display: grid;
	gap: 0.55rem;
}

.markdown-preview :global(.datahoarder-board figcaption) {
	color: oklch(0.28 0.06 245);
	font-size: 0.9rem;
	font-weight: 700;
}

.markdown-preview :global(.datahoarder-board-canvas) {
	position: relative;
	min-height: 18rem;
	overflow: auto;
	background: oklch(0.985 0.01 235);
	border: 1px solid oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

.markdown-preview :global(.datahoarder-board-edges) {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
}

.markdown-preview :global(.datahoarder-board-edges marker path) {
	fill: oklch(0.45 0.08 220);
}

.markdown-preview :global(.datahoarder-board-edge path) {
	fill: none;
	stroke: oklch(0.45 0.08 220);
	stroke-width: 2.5;
	stroke-linecap: round;
	stroke-opacity: 0.58;
	marker-end: url(#datahoarder-board-arrow);
}

.markdown-preview :global(.datahoarder-board-edge text) {
	fill: oklch(0.32 0.06 245);
	font-family: var(--font-mono);
	font-size: 0.75rem;
	font-weight: 700;
	paint-order: stroke;
	stroke: oklch(0.985 0.01 235);
	stroke-width: 4;
}

.markdown-preview :global(.datahoarder-board-node) {
	position: absolute;
	display: grid;
	align-content: start;
	gap: 0.35rem;
	min-width: 7rem;
	padding: 0.55rem 0.65rem;
	overflow: hidden;
	background: oklch(0.995 0.006 95);
	border: 1px solid oklch(0.76 0.04 100);
	border-left: 4px solid oklch(0.52 0.06 245);
	border-radius: 0.35rem;
	box-shadow: 0 0.45rem 1rem oklch(0.28 0.05 245 / 0.12);
}

.markdown-preview :global(.datahoarder-board-node h3),
.markdown-preview :global(.datahoarder-board-node p) {
	margin: 0;
	min-width: 0;
	overflow-wrap: anywhere;
}

.markdown-preview :global(.datahoarder-board-node h3) {
	font-size: 0.92rem;
	line-height: 1.15;
}

.markdown-preview :global(.datahoarder-board-node h3 a) {
	color: oklch(0.3 0.1 190);
	text-decoration-thickness: 1px;
	text-underline-offset: 0.16em;
}

.markdown-preview :global(.datahoarder-board-node p) {
	color: oklch(0.36 0.045 245);
	font-size: 0.78rem;
	white-space: pre-wrap;
}

.markdown-preview :global(.datahoarder-board-node-blue) {
	border-left-color: oklch(0.62 0.15 220);
}

.markdown-preview :global(.datahoarder-board-node-green) {
	border-left-color: oklch(0.62 0.13 155);
}

.markdown-preview :global(.datahoarder-board-node-yellow) {
	border-left-color: oklch(0.72 0.15 80);
}

.markdown-preview :global(.datahoarder-board-node-red) {
	border-left-color: oklch(0.62 0.16 35);
}

.markdown-preview :global(.datahoarder-board-node-purple) {
	border-left-color: oklch(0.58 0.17 300);
}

.markdown-preview :global(.datahoarder-board-empty) {
	color: oklch(0.42 0.045 245);
	font-family: var(--font-mono);
	font-size: 0.78rem;
}

@media (max-width: 1340px) {
	.workspace {
		grid-template-columns: var(--vault-sidebar-width) minmax(0, 1fr);
	}

	.preview-pane {
		grid-column: 1 / -1;
		min-height: 28rem;
		border-top: 1px solid oklch(0.8 0.025 235);
	}
}

@media (max-width: 760px) {
	.topbar,
	.file-header {
		align-items: stretch;
		flex-direction: column;
	}

	.actions {
		justify-content: stretch;
	}

	.actions button {
		flex: 1 1 7rem;
	}

	.workspace {
		grid-template-columns: 1fr;
		overflow: auto;
	}

	.sidebar {
		height: 42vh;
		border-bottom: 1px solid oklch(0.8 0.025 235);
	}

	.editor-pane {
		height: 58vh;
	}

	.preview-pane {
		min-height: 24rem;
	}

	.collection-timeline-item {
		grid-template-columns: 1fr;
		gap: 0.35rem;
	}

	.file-header > span {
		max-width: 100%;
	}
}
</style>
