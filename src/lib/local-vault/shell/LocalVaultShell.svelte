<script lang="ts">
import LocalVaultShellView from "./LocalVaultShellView.svelte";
import { onMount } from "svelte";
import { createLocalVaultShellStore } from "./Store.svelte.js";

const store = createLocalVaultShellStore();

$effect(() => {
    store.syncCollectionFileState();
});

$effect(() => {
    store.syncSelectedCollectionViewState();
});

onMount(() => {
    void store.initializeVaultAccess();
});
</script>

<svelte:head>
	<title>Datahoarder</title>
</svelte:head>

<svelte:window onkeydown={store.interactionActions.handleGlobalKeydown} />

<LocalVaultShellView {store} />
