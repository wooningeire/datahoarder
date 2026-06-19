<script lang="ts">
import NoteTree from '../../note-ui/NoteTree.svelte';
import QuickNotes from './QuickNotes.svelte';
import SidebarSummary from './SidebarSummary.svelte';
import VaultSearchPanel from './VaultSearchPanel.svelte';
import VaultSearchResults from './VaultSearchResults.svelte';
import type { LocalVaultShellStore } from "../shell/Store.svelte.js";

type Props = {
    store: LocalVaultShellStore,
};

let { store }: Props = $props();
</script>

<aside id="vault-directory-panel" class="sidebar" aria-label="Local vault">
	<SidebarSummary filesCount={store.files.length} noteCount={store.noteCount} />

	<VaultSearchPanel
		hasVault={Boolean(store.vaultHandle)}
		loading={store.loading}
		savedVaultSearches={store.savedVaultSearches}
		saving={store.saving}
		vaultHasRecords={Boolean(store.vaultIndex.records.length)}
		vaultSearchQuery={store.vaultSearchQuery}
		applySavedVaultSearch={store.interactionActions.applySavedVaultSearch}
		deleteSavedVaultSearch={store.interactionActions.deleteSavedVaultSearch}
		saveCurrentVaultSearch={store.interactionActions.saveCurrentVaultSearch}
		setVaultSearchQuery={store.interactionActions.setVaultSearchQuery}
	/>

	<div class="vault-browser">
		<div class="vault-main-browser">
			{#if store.searchingVault}
				<VaultSearchResults
					results={store.vaultSearchResults}
					selectedPath={store.selectedPath}
					openSearchResult={store.interactionActions.openSearchResult}
				/>
			{:else if store.vaultHandle}
				<NoteTree
					nodes={store.fileTree}
					activePath={store.selectedPath}
					createDisabled={store.loading || store.saving}
					createDrawingNote={store.noteActions.createDrawingNote}
					createFolder={store.noteActions.createFolder}
					createNote={store.noteActions.createNote}
					createNoteFromTemplate={store.noteActions.createNoteFromTemplate}
					inlineFileCreate={store.requestState.getInlineFileCreateProps()}
					cancelInlineFileCreate={store.requestState.cancelInlineFileCreate}
					onSelect={store.vaultActions.selectFile}
					rootLabel="Files"
					submitInlineFileCreate={store.requestState.submitInlineFileCreate}
					updateInlineFileCreateName={store.requestState.updateInlineFileCreateName}
				/>
			{:else}
				<p class="empty-state">No editable text files are indexed yet.</p>
			{/if}
		</div>

		{#if !store.searchingVault}
			<QuickNotes
				recentNotes={store.recentNotes}
				selectedPath={store.selectedPath}
				openStoredNoteRecord={store.interactionActions.openStoredNoteRecord}
			/>
		{/if}
	</div>
</aside>

<style lang="scss">
.sidebar {
	position: relative;
	z-index: 2;
	display: grid;
	grid-template-rows: auto auto minmax(0, 1fr);
	gap: 0.75rem;
	min-width: 0;
	min-height: 0;
	padding: 0.85rem;
	overflow: hidden;

	background: oklch(0.98 0.012 235);
	border-right: 1px solid oklch(0.8 0.025 235);
}

.vault-browser {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	height: 100%;
	min-height: 0;
	overflow: hidden;
}

.vault-main-browser {
	display: grid;
	grid-template-rows: minmax(0, 1fr);
	flex: 1 1 0;
	min-height: 0;
	overflow: hidden;
}

.empty-state {
	color: oklch(0.42 0.035 245);
}

@media (max-width: 760px) {
	.sidebar {
		height: 42vh;
		border-bottom: 1px solid oklch(0.8 0.025 235);
	}
}
</style>
