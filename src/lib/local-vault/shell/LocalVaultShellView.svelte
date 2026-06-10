<script lang="ts">
import CommandPalette from "../components/CommandPalette.svelte";
import RequestDialog from "../components/RequestDialog.svelte";
import StatusBanners from "../components/StatusBanners.svelte";
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

    <div class="workspace">
        <VaultSidebar {store} />

        <EditorPane {store} />

        <PreviewPane {store} />
    </div>

    <StatusBanners errorMessage={store.errorMessage} status={store.status} />
</main>

<style lang="scss">
.datahoarder-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
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
