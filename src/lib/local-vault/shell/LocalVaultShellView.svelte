<script lang="ts">
import CommandPalette from "../components/CommandPalette.svelte";
import RequestDialog from "../components/RequestDialog.svelte";
import Topbar from "../components/Topbar.svelte";
import EditorPane from "../editor/EditorPane.svelte";
import PreviewPane from "../preview/PreviewPane.svelte";
import VaultSidebar from "../sidebar/VaultSidebar.svelte";
import type { LocalVaultShellStore } from "./Store.svelte.js";

type Props = {
    store: LocalVaultShellStore,
};

let { store }: Props = $props();
</script>

<main class="datahoarder-shell">
    <Topbar {store} />

    {#if store.commandPaletteOpen}
        <CommandPalette
            items={store.filteredCommandPaletteItems}
            query={store.commandPaletteQuery}
            close={store.interactionActions.closeCommandPalette}
            runItem={store.interactionActions.runCommandPaletteItem}
            setQuery={store.interactionActions.setCommandPaletteQuery}
        />
    {/if}

    {#if store.requestState.inputRequest}
        <RequestDialog
            config={store.requestState.inputRequest.config}
            values={store.requestState.inputRequest.values}
            cancel={store.requestState.cancelInputRequest}
            submit={store.requestState.submitInputRequest}
            updateValue={store.requestState.updateInputRequestValue}
        />
    {/if}

    <div class:directory-panel-collapsed={!store.directoryPanelOpen} class="workspace">
        {#if store.directoryPanelOpen}
            <VaultSidebar {store} />
        {/if}

        <EditorPane {store} />

        <PreviewPane {store} />
    </div>
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
    --content-pane-min-width: 20rem;

    display: grid;
    grid-row: 2;
    grid-column: 1;
    grid-template-columns:
        var(--vault-sidebar-width)
        repeat(2, minmax(var(--content-pane-min-width), 1fr));
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
}

.workspace.directory-panel-collapsed {
    grid-template-columns: repeat(2, minmax(var(--content-pane-min-width), 1fr));
}

@media (max-width: 83.75rem) {
    .workspace {
        grid-template-columns: var(--vault-sidebar-width) minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr) minmax(14rem, 0.72fr);
    }

    .workspace :global(.sidebar) {
        grid-row: 1 / -1;
    }

    .workspace.directory-panel-collapsed {
        grid-template-columns: repeat(2, minmax(var(--content-pane-min-width), 1fr));
        grid-template-rows: minmax(0, 1fr);
    }

    .workspace.directory-panel-collapsed :global(.preview-pane) {
        border-top: 0;
    }
}

@media (max-width: 47.5rem) {
    .workspace {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto;
        overflow: auto;
    }

    .workspace :global(.sidebar) {
        grid-row: auto;
    }

    .workspace.directory-panel-collapsed {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto;
    }

    .workspace.directory-panel-collapsed :global(.preview-pane) {
        border-top: 1px solid oklch(0.8 0.025 235);
    }
}
</style>
