import { getBaseViews } from "../../note-model/base.js";
import { isExcalidrawNote, isWhiteboardNote } from "../../note-model/raw.js";
import { isNoteTemplatePath } from "../../note-model/template.js";
import {
    buildLocalVaultTree,
    canUseFileSystemAccess,
    canUseServerVault,
    canUseTauriNativeFileAccess,
    type LocalDirectoryHandle,
    type LocalVaultDirectory,
    type LocalVaultFile,
} from "../../vault/local-files.js";
import {
    createEmptyVaultIndex,
    getVaultBacklinks,
    type VaultIndex,
} from "../../vault/index.js";
import type { SavedVaultSearch } from "../../vault/saved-search.js";
import { searchVaultRecords } from "../../vault/search.js";
import { createCollectionActions } from "../actions/collection-actions.js";
import { createInteractionActions } from "../actions/interaction-actions.js";
import { createNoteActions } from "../actions/note-actions.js";
import { createPublishActions } from "../actions/publish-actions.js";
import { createVaultFileActions } from "../actions/vault-file-actions.js";
import { getCollectionViewDefaultsKey, getCollectionViewSortColumn } from "../preview/collection-view.js";
import type { CollectionCellEdit } from "../shared/types.js";
import { buildCommandPaletteItems, filterCommandPaletteItems } from "./command-palette.js";
import { createShellRequestState } from "./request-state.svelte.js";
import {
    getCollectionRecordCreationError,
    getCollectionRecordsForView,
    getCollectionSummariesForView,
    getCollectionViewDateField,
    getCollectionViewGroupBy,
    getKanbanGroupsForView,
    getTimelineItemsForView,
    isDatahoarderCollectionFile,
    isObsidianBaseFile,
    resolveSelectedCollection,
    type ResolvedCollection,
} from "./shell-collection-state.js";
import { getErrorMessage as getShellErrorMessage } from "./shell-utils.js";
import { createStoredNoteState } from "./stored-note-state.svelte.js";
import { getStoredNoteRecords } from "./stored-notes.js";

export type MonacoState = "fallback" | "idle" | "loading" | "ready";

export class LocalVaultShellStore {
    supported = $state(false);
    vaultHandle = $state<LocalDirectoryHandle | null>(null);
    files = $state<LocalVaultFile[]>([]);
    directories = $state<LocalVaultDirectory[]>([]);
    vaultIndex = $state<VaultIndex>(createEmptyVaultIndex());
    selectedPath = $state("");
    selectedContent = $state("");
    savedContent = $state("");
    savedVaultSearches = $state<SavedVaultSearch[]>([]);
    status = $state("Choose a local folder to begin.");
    loading = $state(false);
    saving = $state(false);
    errorMessage = $state("");
    vaultSearchQuery = $state("");
    collectionFilter = $state("");
    collectionCellEdit = $state<CollectionCellEdit | null>(null);
    selectedCollectionViewIndex = $state(0);
    collectionSortColumn = $state("title");
    collectionSortDirection = $state<"asc" | "desc">("asc");
    commandPaletteOpen = $state(false);
    commandPaletteQuery = $state("");
    directoryPanelOpen = $state(true);
    lastCollectionFilePath = $state("");
    lastCollectionViewDefaultsKey = $state("");
    previewHtml = $state("");
    monacoState = $state<MonacoState>("idle");

    requestState = createShellRequestState({
        clearVaultSearchQuery: () => {
            this.vaultSearchQuery = "";
        },
    });
    storedNotes = createStoredNoteState({
        getVaultHandle: () => this.vaultHandle,
        getVaultIndex: () => this.vaultIndex,
        setStatus: (nextStatus) => {
            this.status = nextStatus;
        },
    });

    selectedFile = $derived(
        this.files.find((file) => file.path === this.selectedPath) ??
            this.files.find((file) => file.routePath === this.selectedPath) ??
            null,
    );
    fileTree = $derived(buildLocalVaultTree(this.files, this.directories));
    noteCount = $derived(
        this.files.filter((file) => file.extension === ".md" || file.extension === ".svx").length,
    );
    dirty = $derived(this.selectedContent !== this.savedContent);
    templateFiles = $derived(this.files.filter((file) => isNoteTemplatePath(file.path)));
    searchingVault = $derived(this.vaultSearchQuery.trim().length > 0);
    vaultSearchResults = $derived(searchVaultRecords(this.vaultIndex.records, this.vaultSearchQuery));
    selectedRecord = $derived(
        this.selectedFile ? (this.vaultIndex.recordsByPath.get(this.selectedFile.path) ?? null) : null,
    );
    selectedBacklinks = $derived(
        this.selectedRecord ? getVaultBacklinks(this.vaultIndex, this.selectedRecord) : [],
    );
    selectedExcalidrawNote = $derived(
        Boolean(
            (this.selectedFile?.extension === ".md" && isExcalidrawNote(this.selectedContent)) ||
                (this.selectedFile?.extension === ".svx" && isWhiteboardNote(this.selectedContent)),
        ),
    );
    selectedFilePinned = $derived(
        this.selectedFile ? this.storedNotes.pinnedNotePaths.includes(this.selectedFile.path) : false,
    );
    pinnedNotes = $derived(
        getStoredNoteRecords(
            this.storedNotes.pinnedNotePaths.filter((path) => path !== this.selectedFile?.path),
            this.vaultIndex.recordsByPath,
        ),
    );
    recentNotes = $derived(
        getStoredNoteRecords(
            this.storedNotes.recentNotePaths.filter(
                (path) => path !== this.selectedFile?.path && !this.storedNotes.pinnedNotePaths.includes(path),
            ),
            this.vaultIndex.recordsByPath,
        ),
    );
    baseViews = $derived(this.selectedFile?.extension === ".base" ? getBaseViews(this.selectedContent) : []);
    selectedCollection = $derived<ResolvedCollection | null>(
        resolveSelectedCollection(
            this.selectedFile,
            this.selectedContent,
            this.vaultIndex,
            this.selectedCollectionViewIndex,
        ),
    );
    collectionRecordCreationError = $derived(
        this.selectedCollection ? getCollectionRecordCreationError(this.selectedCollection.definition) : "",
    );
    collectionTimelineDateField = $derived(
        this.selectedCollection ? getCollectionViewDateField(this.selectedCollection.view) : "date",
    );
    collectionRecords = $derived(
        getCollectionRecordsForView(
            this.selectedCollection,
            this.collectionFilter,
            this.collectionSortColumn,
            this.collectionSortDirection,
            this.collectionTimelineDateField,
        ),
    );
    collectionKanbanGroupBy = $derived(
        this.selectedCollection ? getCollectionViewGroupBy(this.selectedCollection.view) : "status",
    );
    collectionKanbanGroups = $derived(
        getKanbanGroupsForView(
            this.selectedCollection,
            this.collectionRecords,
            this.collectionKanbanGroupBy,
        ),
    );
    collectionTimelineItems = $derived(
        getTimelineItemsForView(
            this.selectedCollection,
            this.collectionRecords,
            this.collectionTimelineDateField,
        ),
    );
    collectionSummaries = $derived(getCollectionSummariesForView(this.selectedCollection, this.collectionRecords));

    getErrorMessage = getShellErrorMessage;
    loadStoredNoteLists = this.storedNotes.loadStoredNoteLists;
    pruneStoredNoteLists = this.storedNotes.pruneStoredNoteLists;
    recordRecentNote = this.storedNotes.recordRecentNote;
    replaceStoredNotePath = this.storedNotes.replaceStoredNotePath;
    requestInlineFileCreate = this.requestState.requestInlineFileCreate;
    requestForm = this.requestState.requestForm;
    requestText = this.requestState.requestText;

    canLeaveSelectedFile = (): Promise<boolean> => this.vaultActions.canLeaveSelectedFile();
    canMutateVault = (): Promise<boolean> => this.vaultActions.canMutateVault();
    reloadVaultAfterFileOperation = (
        nextStatus: string,
        preferredPath?: string,
    ): Promise<void> => this.vaultActions.reloadVaultAfterFileOperation(nextStatus, preferredPath);
    saveSelectedFile = (): Promise<void> => this.vaultActions.saveSelectedFile();
    selectFile = (filePath: string): Promise<void> => this.vaultActions.selectFile(filePath);

    vaultActions = createVaultFileActions(this);
    interactionActions = createInteractionActions(this);
    noteActions = createNoteActions(this);
    collectionActions = createCollectionActions(this);
    publishActions = createPublishActions(this);

    toggleSelectedPin = (): void => {
        this.storedNotes.toggleSelectedPin(this.selectedRecord);
    };

    toggleDirectoryPanel = (): void => {
        this.directoryPanelOpen = !this.directoryPanelOpen;
    };

    commandPaletteItems = $derived.by(() =>
        buildCommandPaletteItems({
            collectionRecordsCount: this.collectionRecords.length,
            dirty: this.dirty,
            hasVault: Boolean(this.vaultHandle),
            loading: this.loading,
            savedVaultSearches: this.savedVaultSearches,
            selectedCollection: this.selectedCollection,
            selectedExcalidrawNote: this.selectedExcalidrawNote,
            selectedFile: this.selectedFile,
            selectedFilePinned: this.selectedFilePinned,
            selectedRecord: this.selectedRecord,
            supported: this.supported,
            templateFilesCount: this.templateFiles.length,
            vaultRecords: this.vaultIndex.records,
            addCanvasElement: this.noteActions.addCanvasElement,
            addFieldToSelectedCollection: this.noteActions.addFieldToSelectedCollection,
            applySavedVaultSearch: this.interactionActions.applySavedVaultSearch,
            bulkSetCollectionField: this.collectionActions.bulkSetCollectionField,
            chooseFolder: this.vaultActions.chooseFolder,
            createCollectionRecord: this.noteActions.createCollectionRecord,
            createDrawingNote: this.noteActions.createDrawingNote,
            createFolder: this.noteActions.createFolder,
            createNote: this.noteActions.createNote,
            createNoteFromTemplate: this.noteActions.createNoteFromTemplate,
            downloadCollectionExport: this.publishActions.downloadCollectionExport,
            downloadSelectedHtmlExport: this.publishActions.downloadSelectedHtmlExport,
            refreshVault: this.vaultActions.refreshVault,
            reopenStoredFolder: this.vaultActions.reopenStoredFolder,
            saveSelectedFile: this.vaultActions.saveSelectedFile,
            selectFile: this.vaultActions.selectFile,
            setSelectedInlineField: this.noteActions.setSelectedInlineField,
            toggleSelectedPin: this.toggleSelectedPin,
        }),
    );
    filteredCommandPaletteItems = $derived.by(() =>
        filterCommandPaletteItems(this.commandPaletteItems, this.commandPaletteQuery),
    );

    initializeVaultAccess = async (): Promise<void> => {
        const serverVaultSupported = await canUseServerVault();
        const tauriNativeSupported = canUseTauriNativeFileAccess();

        this.supported = tauriNativeSupported || serverVaultSupported || canUseFileSystemAccess();

        if (!this.supported) {
            this.status = "Set DATAHOARDER_OPEN_FOLDER, use Tauri native access, or use Chrome or Edge over HTTPS.";
            return;
        }

        void this.vaultActions.restoreVaultHandle();
    };

    setSelectedContent = (content: string): void => {
        this.selectedContent = content;
    };

    setMonacoState = (state: MonacoState): void => {
        this.monacoState = state;
    };

    setPreviewHtml = (html: string): void => {
        this.previewHtml = html;
    };

    syncCollectionFileState = (): void => {
        const collectionFilePath =
            this.selectedFile &&
            (isDatahoarderCollectionFile(this.selectedFile.path) || isObsidianBaseFile(this.selectedFile.path))
                ? this.selectedFile.path
                : "";

        if (collectionFilePath !== this.lastCollectionFilePath) {
            this.lastCollectionFilePath = collectionFilePath;
            this.collectionCellEdit = null;
            this.lastCollectionViewDefaultsKey = "";
            this.selectedCollectionViewIndex = 0;
            this.collectionFilter = "";
            this.collectionSortColumn = "title";
            this.collectionSortDirection = "asc";
        }
    };

    syncSelectedCollectionViewState = (): void => {
        if (!this.selectedCollection) {
            this.selectedCollectionViewIndex = 0;
            this.lastCollectionViewDefaultsKey = "";
            return;
        }

        if (this.selectedCollectionViewIndex !== this.selectedCollection.viewIndex) {
            this.selectedCollectionViewIndex = this.selectedCollection.viewIndex;
        }

        const viewDefaultsKey = getCollectionViewDefaultsKey(this.selectedCollection);

        if (viewDefaultsKey !== this.lastCollectionViewDefaultsKey) {
            this.lastCollectionViewDefaultsKey = viewDefaultsKey;
            this.collectionActions.applyCollectionViewDefaults(this.selectedCollection);
            return;
        }

        if (!this.selectedCollection.columns.includes(this.collectionSortColumn)) {
            this.collectionSortColumn = getCollectionViewSortColumn(this.selectedCollection);
        }
    };
}

export const createLocalVaultShellStore = (): LocalVaultShellStore => new LocalVaultShellStore();
