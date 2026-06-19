<script lang="ts">
import type { LocalVaultShellStore } from "../shell/Store.svelte.js";

type Props = {
    store: LocalVaultShellStore,
};

let { store }: Props = $props();

const getOpenFileParts = (path: string) => {
    const fileName = path.split("/").at(-1) ?? path;
    const directory = path.slice(0, Math.max(0, path.length - fileName.length));

    return {
        directory,
        fileName,
    };
};

let openDirectoryName = $derived(store.vaultHandle?.name ?? "No folder open");
let openFilePath = $derived(store.selectedFile?.path ?? "No file selected");
let openFileParts = $derived(getOpenFileParts(openFilePath));
</script>

<header class="topbar">
    <div class="open-context">
        <p class="open-directory" title={openDirectoryName}>{openDirectoryName}</p>
        <h1 class="open-file" title={openFilePath} aria-label={openFilePath}>
            {#if openFileParts.directory}
                <span class="open-file-directory">{openFileParts.directory}</span>
            {/if}
            <span>{openFileParts.fileName}</span>
        </h1>
    </div>

    <div class="actions">
        <button
            type="button"
            class="directory-panel-toggle"
            aria-controls="vault-directory-panel"
            aria-expanded={store.directoryPanelOpen}
            onclick={store.toggleDirectoryPanel}
        >
            {store.directoryPanelOpen ? "Hide Files" : "Show Files"}
        </button>
        <button
            type="button"
            class="command-button"
            onclick={() => store.interactionActions.openCommandPalette()}
            aria-keyshortcuts="Control+K Meta+K"
        >
            Command
        </button>
        <button type="button" onclick={store.vaultActions.chooseFolder} disabled={!store.supported || store.loading}>
            Open Folder
        </button>
        <button
            type="button"
            onclick={store.vaultActions.reopenStoredFolder}
            disabled={!store.supported || store.loading || !store.vaultHandle}
        >
            Reopen
        </button>
        <button
            type="button"
            onclick={store.vaultActions.refreshVault}
            disabled={!store.supported || store.loading || !store.vaultHandle}
        >
            Refresh
        </button>
        <button
            type="button"
            onclick={store.noteActions.addCanvasElement}
            disabled={store.loading || store.saving || !store.selectedExcalidrawNote}
        >
            Add Canvas Element
        </button>
        <button
            type="button"
            onclick={store.vaultActions.renameSelectedFile}
            disabled={store.loading || !store.selectedFile}
        >
            Rename
        </button>
        <button
            type="button"
            onclick={store.toggleSelectedPin}
            disabled={store.loading || !store.selectedRecord}
            aria-pressed={store.selectedFilePinned}
        >
            {store.selectedFilePinned ? "Unpin" : "Pin"}
        </button>
        <button
            type="button"
            onclick={store.noteActions.setSelectedInlineField}
            disabled={store.loading || !store.selectedRecord || store.saving}
        >
            Set Field
        </button>
        <button
            type="button"
            onclick={store.vaultActions.deleteSelectedFile}
            disabled={store.loading || !store.selectedFile}
        >
            Delete
        </button>
        <button
            type="button"
            onclick={store.publishActions.downloadSelectedHtmlExport}
            disabled={store.loading || !store.selectedFile}
        >
            Export HTML
        </button>
        <button
            type="button"
            class="primary"
            onclick={store.vaultActions.saveSelectedFile}
            disabled={!store.dirty || store.saving}
        >
            {store.saving ? "Saving" : "Save"}
        </button>
    </div>
</header>

<style lang="scss">
.topbar {
    display: grid;
    grid-template-columns: minmax(12rem, 1fr) auto;
    align-items: center;
    gap: 1rem;
    min-width: 0;
    padding: 0.45rem 0.75rem;

    background: oklch(0.99 0.01 235);
    border-bottom: 1px solid oklch(0.78 0.03 235);
}

.open-context {
    display: grid;
    gap: 0.12rem;
    min-width: 0;
}

.open-directory,
.open-file {
    min-width: 0;
    margin: 0;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.open-directory {
    color: oklch(0.42 0.08 180);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
}

.open-file {
    color: oklch(0.16 0.035 245);
    font-size: 1rem;
    line-height: 1.15;
}

.open-file-directory {
    color: oklch(0.42 0.035 245);
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 500;
}

.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    justify-content: flex-end;
    min-width: 0;
}

.command-button {
    color: oklch(0.25 0.06 245);
    background: oklch(0.93 0.035 155);
    border-color: oklch(0.66 0.11 155);
}

.directory-panel-toggle {
    color: oklch(0.25 0.06 255);
    background: oklch(0.94 0.035 220);
    border-color: oklch(0.68 0.08 225);
}

@media (max-width: 760px) {
    .topbar {
        grid-template-columns: minmax(0, 1fr);
    }

    .actions {
        justify-content: stretch;
    }

    .actions button {
        flex: 1 1 7rem;
    }
}
</style>
