<script lang="ts">
import CommandPalette from "../components/CommandPalette.svelte";
import RequestDialog from "../components/RequestDialog.svelte";
import StatusBanners from "../components/StatusBanners.svelte";
import Topbar from "../components/Topbar.svelte";
import EditorPane from "../editor/EditorPane.svelte";
import PreviewPane from "../preview/PreviewPane.svelte";
import VaultSidebar from "../sidebar/VaultSidebar.svelte";
import { formatCollectionRecordValue } from "../../collections/index.js";
import type { CollectionActions } from "../actions/collection-actions.js";
import type { InteractionActions } from "../actions/interaction-actions.js";
import type { NoteActions } from "../actions/note-actions.js";
import type { PublishActions } from "../actions/publish-actions.js";
import type { VaultFileActions } from "../actions/vault-file-actions.js";
import type { ShellRequestState } from "./request-state.svelte.js";
import type { StoredNoteState } from "./stored-note-state.svelte.js";

type ShellViewState = Record<string, any>;

type Props = {
    collectionActions: CollectionActions,
    interactionActions: InteractionActions,
    noteActions: NoteActions,
    publishActions: PublishActions,
    requestState: ShellRequestState,
    setMonacoState: (state: "fallback" | "idle" | "loading" | "ready") => void,
    setPreviewHtml: (html: string) => void,
    setSelectedContent: (content: string) => void,
    storedNotes: StoredNoteState,
    toggleSelectedPin: () => void,
    vaultActions: VaultFileActions,
    view: ShellViewState,
};

let {
    collectionActions,
    interactionActions,
    noteActions,
    publishActions,
    requestState,
    setMonacoState,
    setPreviewHtml,
    setSelectedContent,
    storedNotes,
    toggleSelectedPin,
    vaultActions,
    view,
}: Props = $props();
</script>

<main class="datahoarder-shell">
    <Topbar
        dirty={view.dirty}
        hasSelectedExcalidrawNote={view.selectedExcalidrawNote}
        hasSelectedFile={Boolean(view.selectedFile)}
        hasSelectedRecord={Boolean(view.selectedRecord)}
        hasVault={Boolean(view.vaultHandle)}
        loading={view.loading}
        publicPublishProfiles={view.publicPublishProfiles}
        publicRecordsCount={view.publicRecords.length}
        saving={view.saving}
        selectedFilePinned={view.selectedFilePinned}
        selectedPublicPublishProfilePath={view.selectedPublicPublishProfilePath}
        supported={view.supported}
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

    {#if view.commandPaletteOpen}
        <CommandPalette
            items={view.filteredCommandPaletteItems}
            query={view.commandPaletteQuery}
            close={interactionActions.closeCommandPalette}
            runItem={interactionActions.runCommandPaletteItem}
            setQuery={interactionActions.setCommandPaletteQuery}
        />
    {/if}

    {#if requestState.inputRequest}
        <RequestDialog
            config={requestState.inputRequest.config}
            values={requestState.inputRequest.values}
            cancel={requestState.cancelInputRequest}
            submit={requestState.submitInputRequest}
            updateValue={requestState.updateInputRequestValue}
        />
    {/if}

    <div class="workspace">
        <VaultSidebar
            fileTree={view.fileTree}
            filesCount={view.files.length}
            hasVault={Boolean(view.vaultHandle)}
            loading={view.loading}
            noteCount={view.noteCount}
            pinnedNotes={view.pinnedNotes}
            recentNotes={view.recentNotes}
            savedVaultSearches={view.savedVaultSearches}
            saving={view.saving}
            searchingVault={view.searchingVault}
            selectedPath={view.selectedPath}
            inlineFileCreate={requestState.getInlineFileCreateProps()}
            vaultHasRecords={Boolean(view.vaultIndex.records.length)}
            vaultSearchQuery={view.vaultSearchQuery}
            vaultSearchResults={view.vaultSearchResults}
            applySavedVaultSearch={interactionActions.applySavedVaultSearch}
            createDrawingNote={noteActions.createDrawingNote}
            createNote={noteActions.createNote}
            createNoteFromTemplate={noteActions.createNoteFromTemplate}
            cancelInlineFileCreate={requestState.cancelInlineFileCreate}
            deleteSavedVaultSearch={interactionActions.deleteSavedVaultSearch}
            openSearchResult={interactionActions.openSearchResult}
            openStoredNoteRecord={interactionActions.openStoredNoteRecord}
            saveCurrentVaultSearch={interactionActions.saveCurrentVaultSearch}
            selectFile={vaultActions.selectFile}
            setVaultSearchQuery={interactionActions.setVaultSearchQuery}
            submitInlineFileCreate={requestState.submitInlineFileCreate}
            togglePinnedPath={storedNotes.togglePinnedPath}
            updateInlineFileCreateName={requestState.updateInlineFileCreateName}
        />

        <EditorPane
            selectedContent={view.selectedContent}
            selectedFile={view.selectedFile}
            {setMonacoState}
            {setSelectedContent}
        />

        <PreviewPane
            baseViews={view.baseViews}
            collectionCellEdit={view.collectionCellEdit}
            collectionFilter={view.collectionFilter}
            collectionKanbanGroupBy={view.collectionKanbanGroupBy}
            collectionKanbanGroups={view.collectionKanbanGroups}
            collectionRecordCreationError={view.collectionRecordCreationError}
            collectionRecords={view.collectionRecords}
            collectionSortColumn={view.collectionSortColumn}
            collectionSortDirection={view.collectionSortDirection}
            collectionSummaries={view.collectionSummaries}
            collectionTimelineDateField={view.collectionTimelineDateField}
            collectionTimelineItems={view.collectionTimelineItems}
            files={view.files}
            hasVault={Boolean(view.vaultHandle)}
            loading={view.loading}
            saving={view.saving}
            selectedBacklinks={view.selectedBacklinks}
            selectedCollection={view.selectedCollection}
            selectedContent={view.selectedContent}
            selectedFile={view.selectedFile}
            vaultIndex={view.vaultIndex}
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

    <StatusBanners errorMessage={view.errorMessage} status={view.status} />
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
