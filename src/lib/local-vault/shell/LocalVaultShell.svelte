<script lang="ts">
import CommandPalette from '../components/CommandPalette.svelte';
import EditorPane from '../editor/EditorPane.svelte';
import PreviewPane from '../preview/PreviewPane.svelte';
import RequestDialog from '../components/RequestDialog.svelte';
import StatusBanners from '../components/StatusBanners.svelte';
import Topbar from '../components/Topbar.svelte';
import VaultSidebar from '../sidebar/VaultSidebar.svelte';
import { onMount } from 'svelte';
import { getBaseViews } from '../../note-model/base.js';
import {
	filterCollectionRecords,
	formatCollectionRecordValue,
	getCollectionRecordCreationError,
	getCollectionTimelineItems,
	getCollectionViewDateField,
	getCollectionViewGroupBy,
	groupCollectionRecordsForKanban,
	isDatahoarderCollectionFile,
	isObsidianBaseFile,
	resolveDatahoarderCollection,
	resolveObsidianBaseCollection,
	sortCollectionRecords,
	sortCollectionRecordsForTimeline,
	summarizeCollectionRecords,
	type ResolvedCollection
} from '../../collections/index.js';
import {
	buildLocalVaultTree,
	canUseServerVault,
	canUseFileSystemAccess,
	canUseTauriNativeFileAccess,
	type LocalDirectoryHandle,
	type LocalVaultFile
} from '../../vault/local-files.js';
import { buildCommandPaletteItems, filterCommandPaletteItems } from './command-palette.js';
import { createCollectionActions } from '../actions/collection-actions.js';
import {
	getCollectionViewDefaultsKey,
	getCollectionViewSortColumn
} from '../preview/collection-view.js';
import { createInteractionActions } from '../actions/interaction-actions.js';
import { createNoteActions } from '../actions/note-actions.js';
import { createPublishActions } from '../actions/publish-actions.js';
import {
	getRecentNotePaths,
	getStoredNoteRecords,
	maxRecentNotes,
	normalizeStoredNotePaths,
	pruneStoredNotePaths,
	readStoredNoteLists,
	replaceStoredNotePaths,
	writeStoredPinnedNotePaths,
	writeStoredRecentNotePaths
} from './stored-notes.js';
import type { CollectionCellEdit } from '../shared/types.js';
import type {
	InlineFileCreate,
	InlineFileCreateRequest,
	RequestDialogConfig,
	RequestDialogValues,
	RequestTextOptions
} from '../shared/types.js';
import { createVaultFileActions } from '../actions/vault-file-actions.js';
import { isNoteTemplatePath } from '../../note-model/template.js';
import {
	getPublicPublishRecords,
	type PublicPublishProfile
} from '../../publishing/public-publish.js';
import { isExcalidrawNote, isWhiteboardNote } from '../../note-model/raw.js';
import type { SavedVaultSearch } from '../../vault/saved-search.js';
import {
	createEmptyVaultIndex,
	getVaultBacklinks,
	type VaultIndex,
	type VaultRecord
} from '../../vault/index.js';
import { searchVaultRecords } from '../../vault/search.js';

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
let inputRequest = $state<{
	config: RequestDialogConfig;
	resolve: (values: RequestDialogValues | null) => void;
	values: RequestDialogValues;
} | null>(null);
let inlineFileCreate = $state<{
	id: string;
	request: InlineFileCreateRequest;
	fileName: string;
	resolve: (fileName: string | null) => void;
} | null>(null);
let lastCollectionFilePath = $state('');
let lastCollectionViewDefaultsKey = $state('');
let previewHtml = $state('');
let monacoState = $state<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
let inlineFileCreateSequence = 0;

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
let selectedPublicPublishProfile = $derived(
	publicPublishProfiles.find((profile) => profile.path === selectedPublicPublishProfilePath) ?? null
);
let publicRecords = $derived(getPublicPublishRecords(vaultIndex.records, selectedPublicPublishProfile));
let selectedExcalidrawNote = $derived(
	Boolean(
		(selectedFile?.extension === '.md' && isExcalidrawNote(selectedContent)) ||
		(selectedFile?.extension === '.svx' && isWhiteboardNote(selectedContent))
	)
);
let selectedFilePinned = $derived(selectedFile ? pinnedNotePaths.includes(selectedFile.path) : false);
let pinnedNotes = $derived(
	getStoredNoteRecords(pinnedNotePaths.filter((path) => path !== selectedFile?.path), vaultIndex.recordsByPath)
);
let recentNotes = $derived(
	getStoredNoteRecords(
		recentNotePaths.filter((path) => path !== selectedFile?.path && !pinnedNotePaths.includes(path)),
		vaultIndex.recordsByPath
	)
);
let baseViews = $derived(selectedFile?.extension === '.base' ? getBaseViews(selectedContent) : []);
let selectedCollection = $derived.by<ResolvedCollection | null>(() => {
	if (!selectedFile) {
		return null;
	}

	if (isDatahoarderCollectionFile(selectedFile.path)) {
		return resolveDatahoarderCollection(selectedContent, selectedFile.path, vaultIndex, selectedCollectionViewIndex);
	}

	if (isObsidianBaseFile(selectedFile.path)) {
		return resolveObsidianBaseCollection(selectedContent, selectedFile.path, vaultIndex, selectedCollectionViewIndex);
	}

	return null;
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
const shellActionContext = {
	get commandPaletteOpen() {
		return commandPaletteOpen;
	},
	set commandPaletteOpen(value) {
		commandPaletteOpen = value;
	},
	get commandPaletteQuery() {
		return commandPaletteQuery;
	},
	set commandPaletteQuery(value) {
		commandPaletteQuery = value;
	},
	get collectionCellEdit() {
		return collectionCellEdit;
	},
	set collectionCellEdit(value) {
		collectionCellEdit = value;
	},
	get collectionFilter() {
		return collectionFilter;
	},
	set collectionFilter(value) {
		collectionFilter = value;
	},
	get collectionRecordCreationError() {
		return collectionRecordCreationError;
	},
	get collectionRecords() {
		return collectionRecords;
	},
	get collectionSortColumn() {
		return collectionSortColumn;
	},
	set collectionSortColumn(value) {
		collectionSortColumn = value;
	},
	get collectionSortDirection() {
		return collectionSortDirection;
	},
	set collectionSortDirection(value) {
		collectionSortDirection = value;
	},
	get collectionSummaries() {
		return collectionSummaries;
	},
	get dirty() {
		return dirty;
	},
	get errorMessage() {
		return errorMessage;
	},
	set errorMessage(value) {
		errorMessage = value;
	},
	get files() {
		return files;
	},
	set files(value) {
		files = value;
	},
	get lastCollectionViewDefaultsKey() {
		return lastCollectionViewDefaultsKey;
	},
	set lastCollectionViewDefaultsKey(value) {
		lastCollectionViewDefaultsKey = value;
	},
	get loading() {
		return loading;
	},
	set loading(value) {
		loading = value;
	},
	get previewHtml() {
		return previewHtml;
	},
	get publicPublishProfiles() {
		return publicPublishProfiles;
	},
	set publicPublishProfiles(value) {
		publicPublishProfiles = value;
	},
	get savedContent() {
		return savedContent;
	},
	set savedContent(value) {
		savedContent = value;
	},
	get savedVaultSearches() {
		return savedVaultSearches;
	},
	set savedVaultSearches(value) {
		savedVaultSearches = value;
	},
	get saving() {
		return saving;
	},
	set saving(value) {
		saving = value;
	},
	get selectedCollection() {
		return selectedCollection;
	},
	get selectedCollectionViewIndex() {
		return selectedCollectionViewIndex;
	},
	set selectedCollectionViewIndex(value) {
		selectedCollectionViewIndex = value;
	},
	get selectedContent() {
		return selectedContent;
	},
	set selectedContent(value) {
		selectedContent = value;
	},
	get selectedExcalidrawNote() {
		return selectedExcalidrawNote;
	},
	get selectedFile() {
		return selectedFile;
	},
	get selectedPath() {
		return selectedPath;
	},
	set selectedPath(value) {
		selectedPath = value;
	},
	get selectedPublicPublishProfile() {
		return selectedPublicPublishProfile;
	},
	get selectedPublicPublishProfilePath() {
		return selectedPublicPublishProfilePath;
	},
	set selectedPublicPublishProfilePath(value) {
		selectedPublicPublishProfilePath = value;
	},
	get selectedRecord() {
		return selectedRecord;
	},
	get status() {
		return status;
	},
	set status(value) {
		status = value;
	},
	get templateFiles() {
		return templateFiles;
	},
	get vaultHandle() {
		return vaultHandle;
	},
	set vaultHandle(value) {
		vaultHandle = value;
	},
	get vaultIndex() {
		return vaultIndex;
	},
	set vaultIndex(value) {
		vaultIndex = value;
	},
	get vaultSearchQuery() {
		return vaultSearchQuery;
	},
	set vaultSearchQuery(value) {
		vaultSearchQuery = value;
	},
	canLeaveSelectedFile: () => vaultActions.canLeaveSelectedFile(),
	canMutateVault: () => vaultActions.canMutateVault(),
	getErrorMessage,
	loadStoredNoteLists,
	pruneSelectedPublicPublishProfile,
	pruneStoredNoteLists,
	recordRecentNote,
	reloadVaultAfterFileOperation: (nextStatus: string, preferredPath?: string) =>
		vaultActions.reloadVaultAfterFileOperation(nextStatus, preferredPath),
	replaceStoredNotePath,
	requestInlineFileCreate,
	requestForm,
	requestText,
	saveSelectedFile: () => vaultActions.saveSelectedFile(),
	selectFile: (filePath: string) => vaultActions.selectFile(filePath)
};
const vaultActions = createVaultFileActions(shellActionContext);
const interactionActions = createInteractionActions(shellActionContext);
const noteActions = createNoteActions(shellActionContext);
const collectionActions = createCollectionActions(shellActionContext);
const publishActions = createPublishActions(shellActionContext);
let commandPaletteItems = $derived.by(() =>
	buildCommandPaletteItems({
		collectionRecordsCount: collectionRecords.length,
		dirty,
		hasVault: Boolean(vaultHandle),
		loading,
		savedVaultSearches,
		selectedCollection,
		selectedExcalidrawNote,
		selectedFile,
		selectedFilePinned,
		selectedPublicPublishProfileName: selectedPublicPublishProfile?.name ?? '',
		selectedRecord,
		supported,
		templateFilesCount: templateFiles.length,
		vaultRecords: vaultIndex.records,
		addCanvasElement: noteActions.addCanvasElement,
		addFieldToSelectedCollection: noteActions.addFieldToSelectedCollection,
		applySavedVaultSearch: interactionActions.applySavedVaultSearch,
		bulkSetCollectionField: collectionActions.bulkSetCollectionField,
		chooseFolder: vaultActions.chooseFolder,
		createCollectionRecord: noteActions.createCollectionRecord,
		createDrawingNote: noteActions.createDrawingNote,
		createNote: noteActions.createNote,
		createNoteFromTemplate: noteActions.createNoteFromTemplate,
		downloadCollectionExport: publishActions.downloadCollectionExport,
		downloadSelectedHtmlExport: publishActions.downloadSelectedHtmlExport,
		publishPublicNotes: publishActions.publishPublicNotes,
		refreshVault: vaultActions.refreshVault,
		reopenStoredFolder: vaultActions.reopenStoredFolder,
		saveSelectedFile: vaultActions.saveSelectedFile,
		selectFile: vaultActions.selectFile,
		setSelectedInlineField: noteActions.setSelectedInlineField,
		toggleSelectedPin
	})
);
let filteredCommandPaletteItems = $derived.by(() =>
	filterCommandPaletteItems(commandPaletteItems, commandPaletteQuery)
);

$effect(() => {
	const collectionFilePath =
		selectedFile && (isDatahoarderCollectionFile(selectedFile.path) || isObsidianBaseFile(selectedFile.path))
			? selectedFile.path
			: '';

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
		collectionActions.applyCollectionViewDefaults(selectedCollection);
		return;
	}

	if (!selectedCollection.columns.includes(collectionSortColumn)) {
		collectionSortColumn = getCollectionViewSortColumn(selectedCollection);
	}
});

onMount(() => {
	void initializeVaultAccess();
});

async function initializeVaultAccess() {
	const serverVaultSupported = await canUseServerVault();
	const tauriNativeSupported = canUseTauriNativeFileAccess();

	supported = tauriNativeSupported || serverVaultSupported || canUseFileSystemAccess();

	if (!supported) {
		status = 'Set DATAHOARDER_OPEN_FOLDER, use Tauri native access, or use Chrome or Edge over HTTPS.';
		return;
	}

	void vaultActions.restoreVaultHandle();
}

function setSelectedContent(content: string) {
	selectedContent = content;
}

function setMonacoState(state: 'fallback' | 'idle' | 'loading' | 'ready') {
	monacoState = state;
}

function setPreviewHtml(html: string) {
	previewHtml = html;
}

function requestForm(config: RequestDialogConfig) {
	inputRequest?.resolve(null);
	inlineFileCreate?.resolve(null);
	inlineFileCreate = null;

	return new Promise<RequestDialogValues | null>((resolve) => {
		inputRequest = {
			config,
			resolve,
			values: Object.fromEntries(config.fields.map((field) => [field.id, field.value]))
		};
	});
}

async function requestText(options: RequestTextOptions) {
	const result = await requestForm({
		description: options.description,
		fields: [
			{
				id: 'value',
				inputKind: options.inputKind ?? 'text',
				label: options.label ?? options.title,
				placeholder: options.placeholder,
				required: options.required,
				value: options.value ?? ''
			}
		],
		submitLabel: options.submitLabel,
		title: options.title
	});

	return result?.value ?? null;
}

function requestInlineFileCreate(request: InlineFileCreateRequest) {
	inputRequest?.resolve(null);
	inputRequest = null;
	inlineFileCreate?.resolve(null);
	vaultSearchQuery = '';

	return new Promise<string | null>((resolve) => {
		inlineFileCreateSequence += 1;
		inlineFileCreate = {
			fileName: getInlineFileCreateStem(request.fileName, request.extension),
			id: `inline-file-create-${inlineFileCreateSequence}`,
			request,
			resolve
		};
	});
}

function updateInputRequestValue(id: string, value: string) {
	if (!inputRequest) {
		return;
	}

	inputRequest = {
		...inputRequest,
		values: {
			...inputRequest.values,
			[id]: value
		}
	};
}

function cancelInputRequest() {
	const activeRequest = inputRequest;

	if (!activeRequest) {
		return;
	}

	inputRequest = null;
	activeRequest.resolve(null);
}

function submitInputRequest(values: RequestDialogValues) {
	const activeRequest = inputRequest;

	if (!activeRequest) {
		return;
	}

	inputRequest = null;
	activeRequest.resolve(values);
}

function getInlineFileCreateProps(): InlineFileCreate | null {
	if (!inlineFileCreate) {
		return null;
	}

	return {
		...inlineFileCreate.request,
		fileName: inlineFileCreate.fileName,
		id: inlineFileCreate.id
	};
}

function updateInlineFileCreateName(fileName: string) {
	if (!inlineFileCreate) {
		return;
	}

	inlineFileCreate = {
		...inlineFileCreate,
		fileName
	};
}

function cancelInlineFileCreate() {
	const activeRequest = inlineFileCreate;

	if (!activeRequest) {
		return;
	}

	inlineFileCreate = null;
	activeRequest.resolve(null);
}

function submitInlineFileCreate() {
	const activeRequest = inlineFileCreate;

	if (!activeRequest) {
		return;
	}

	inlineFileCreate = null;
	activeRequest.resolve(activeRequest.fileName);
}

function getInlineFileCreateStem(fileName: string, extension: string) {
	const normalizedExtension = extension.trim();

	if (!normalizedExtension) {
		return fileName;
	}

	return fileName.toLowerCase().endsWith(normalizedExtension.toLowerCase())
		? fileName.slice(0, -normalizedExtension.length)
		: fileName;
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

function recordRecentNote(path: string) {
	saveRecentNotePaths(getRecentNotePaths(path, recentNotePaths, vaultIndex.recordsByPath));
}

function replaceStoredNotePath(previousPath: string, nextPath: string) {
	const nextLists = replaceStoredNotePaths(previousPath, nextPath, {
		pinned: pinnedNotePaths,
		recent: recentNotePaths
	});

	savePinnedNotePaths(nextLists.pinned);
	saveRecentNotePaths(nextLists.recent);
}

function pruneStoredNoteLists(nextVaultIndex = vaultIndex) {
	const nextLists = pruneStoredNotePaths(
		{
			pinned: pinnedNotePaths,
			recent: recentNotePaths
		},
		nextVaultIndex.recordsByPath
	);

	savePinnedNotePaths(nextLists.pinned);
	saveRecentNotePaths(nextLists.recent);
}

function loadStoredNoteLists(vaultName: string) {
	const lists = readStoredNoteLists(vaultName);

	pinnedNotePaths = lists.pinned;
	recentNotePaths = lists.recent;
}

function savePinnedNotePaths(paths: string[]) {
	pinnedNotePaths = normalizeStoredNotePaths(paths);

	if (vaultHandle) {
		writeStoredPinnedNotePaths(vaultHandle.name, pinnedNotePaths);
	}
}

function saveRecentNotePaths(paths: string[]) {
	recentNotePaths = normalizeStoredNotePaths(paths, maxRecentNotes);

	if (vaultHandle) {
		writeStoredRecentNotePaths(vaultHandle.name, recentNotePaths);
	}
}

function pruneSelectedPublicPublishProfile() {
	if (
		selectedPublicPublishProfilePath &&
		!publicPublishProfiles.some((profile) => profile.path === selectedPublicPublishProfilePath)
	) {
		selectedPublicPublishProfilePath = '';
	}
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
		return error.message;
	}

	return 'Unknown error';
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

<svelte:window onkeydown={interactionActions.handleGlobalKeydown} />

<main class="datahoarder-shell">
	<Topbar
		{dirty}
		hasSelectedExcalidrawNote={selectedExcalidrawNote}
		hasSelectedFile={Boolean(selectedFile)}
		hasSelectedRecord={Boolean(selectedRecord)}
		hasVault={Boolean(vaultHandle)}
		{loading}
		{publicPublishProfiles}
		publicRecordsCount={publicRecords.length}
		{saving}
		{selectedFilePinned}
		{selectedPublicPublishProfilePath}
		{supported}
		addCanvasElement={noteActions.addCanvasElement}
		chooseFolder={vaultActions.chooseFolder}
		deleteSelectedFile={vaultActions.deleteSelectedFile}
		downloadSelectedHtmlExport={publishActions.downloadSelectedHtmlExport}
		openCommandPalette={() => interactionActions.openCommandPalette()}
		publishPublicNotes={publishActions.publishPublicNotes}
		refreshVault={vaultActions.refreshVault}
		renameSelectedFile={vaultActions.renameSelectedFile}
		reopenStoredFolder={vaultActions.reopenStoredFolder}
		saveSelectedFile={vaultActions.saveSelectedFile}
		selectPublicPublishProfile={interactionActions.selectPublicPublishProfile}
		setSelectedInlineField={noteActions.setSelectedInlineField}
		{toggleSelectedPin}
	/>

	{#if commandPaletteOpen}
		<CommandPalette
			items={filteredCommandPaletteItems}
			query={commandPaletteQuery}
			close={interactionActions.closeCommandPalette}
			runItem={interactionActions.runCommandPaletteItem}
			setQuery={interactionActions.setCommandPaletteQuery}
		/>
	{/if}

	{#if inputRequest}
		<RequestDialog
			config={inputRequest.config}
			values={inputRequest.values}
			cancel={cancelInputRequest}
			submit={submitInputRequest}
			updateValue={updateInputRequestValue}
		/>
	{/if}

	<div class="workspace">
		<VaultSidebar
			{fileTree}
			filesCount={files.length}
			hasVault={Boolean(vaultHandle)}
			{loading}
			{noteCount}
			{pinnedNotes}
			{recentNotes}
			{savedVaultSearches}
			{saving}
			{searchingVault}
			{selectedPath}
			inlineFileCreate={getInlineFileCreateProps()}
			vaultHasRecords={Boolean(vaultIndex.records.length)}
			{vaultSearchQuery}
			{vaultSearchResults}
			applySavedVaultSearch={interactionActions.applySavedVaultSearch}
			createDrawingNote={noteActions.createDrawingNote}
			createNote={noteActions.createNote}
			createNoteFromTemplate={noteActions.createNoteFromTemplate}
			{cancelInlineFileCreate}
			deleteSavedVaultSearch={interactionActions.deleteSavedVaultSearch}
			openSearchResult={interactionActions.openSearchResult}
			openStoredNoteRecord={interactionActions.openStoredNoteRecord}
			saveCurrentVaultSearch={interactionActions.saveCurrentVaultSearch}
			selectFile={vaultActions.selectFile}
			setVaultSearchQuery={interactionActions.setVaultSearchQuery}
			{submitInlineFileCreate}
			{togglePinnedPath}
			{updateInlineFileCreateName}
		/>

		<EditorPane
			{selectedContent}
			{selectedFile}
			{setMonacoState}
			{setSelectedContent}
		/>

		<PreviewPane
			{baseViews}
			{collectionCellEdit}
			{collectionFilter}
			{collectionKanbanGroupBy}
			{collectionKanbanGroups}
			{collectionRecordCreationError}
			{collectionRecords}
			{collectionSortColumn}
			{collectionSortDirection}
			{collectionSummaries}
			{collectionTimelineDateField}
			{collectionTimelineItems}
			{files}
			hasVault={Boolean(vaultHandle)}
			{loading}
			{saving}
			{selectedBacklinks}
			{selectedCollection}
			{selectedContent}
			{selectedFile}
			{vaultIndex}
			addFieldToSelectedCollection={noteActions.addFieldToSelectedCollection}
			bulkSetCollectionField={collectionActions.bulkSetCollectionField}
			cancelCollectionCellEdit={collectionActions.cancelCollectionCellEdit}
			createCollectionRecord={noteActions.createCollectionRecord}
			downloadCollectionExport={publishActions.downloadCollectionExport}
			editCollectionRecordField={collectionActions.editCollectionRecordField}
			{formatCollectionRecordValue}
			handlePreviewChange={interactionActions.handlePreviewChange}
			handlePreviewClick={interactionActions.handlePreviewClick}
			isEditingCollectionCell={collectionActions.isEditingCollectionCell}
			openBacklink={interactionActions.openBacklink}
			openCollectionRecord={collectionActions.openCollectionRecord}
			saveCollectionCellEdit={collectionActions.saveCollectionCellEdit}
			selectCollectionView={collectionActions.selectCollectionView}
			setCollectionFilter={collectionActions.setCollectionFilter}
			{setPreviewHtml}
			{setSelectedContent}
			sortCollectionBy={collectionActions.sortCollectionBy}
			updateCollectionCellEditValue={collectionActions.updateCollectionCellEditValue}
		/>

	</div>

	<StatusBanners {errorMessage} />
</main>

<style lang="scss">
.datahoarder-shell {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	grid-template-rows: auto minmax(0, 1fr);
	height: 100vh;
	height: 100dvh;
	min-height: 0;
	overflow: hidden;
	color: oklch(0.22 0.035 245);
}

.workspace {
	--vault-sidebar-width: 32rem;

	display: grid;
	grid-row: 2;
	grid-column: 1;
	grid-template-columns: var(--vault-sidebar-width) minmax(20rem, 1fr) minmax(18rem, 0.85fr);
	grid-template-rows: minmax(0, 1fr);
	min-height: 0;
	overflow: hidden;
}

@media (max-width: 1340px) {
	.workspace {
		grid-template-columns: var(--vault-sidebar-width) minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) minmax(14rem, 0.72fr);
	}
}

@media (max-width: 760px) {
	.workspace {
		grid-template-columns: 1fr;
		grid-template-rows: auto auto auto;
		overflow: auto;
	}
}
</style>
