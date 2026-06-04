<script lang="ts">
import NoteTree from '../../note-ui/NoteTree.svelte';
import QuickNotes from './QuickNotes.svelte';
import SidebarSummary from './SidebarSummary.svelte';
import type { NoteTreeNode } from '../../note-model/tree.js';
import type { SavedVaultSearch } from '../../vault/saved-search.js';
import type { VaultIndex } from '../../vault/index.js';
import type { VaultSearchResult } from '../../vault/search.js';
import type { InlineFileCreate } from '../shared/types.js';
import VaultSearchPanel from './VaultSearchPanel.svelte';
import VaultSearchResults from './VaultSearchResults.svelte';

type VaultRecord = VaultIndex['records'][number];

type Props = {
	fileTree: NoteTreeNode[];
	filesCount: number;
	hasVault: boolean;
	loading: boolean;
	noteCount: number;
	pinnedNotes: VaultRecord[];
	recentNotes: VaultRecord[];
	savedVaultSearches: SavedVaultSearch[];
	saving: boolean;
	searchingVault: boolean;
	selectedPath: string;
	inlineFileCreate: InlineFileCreate | null;
	vaultHasRecords: boolean;
	vaultSearchQuery: string;
	vaultSearchResults: VaultSearchResult[];
	applySavedVaultSearch: (search: SavedVaultSearch) => void;
	cancelInlineFileCreate: () => void;
	createDrawingNote: (directoryPath: string) => void;
	createNote: (directoryPath: string) => void;
	createNoteFromTemplate: (directoryPath: string) => void;
	deleteSavedVaultSearch: (search: SavedVaultSearch) => void;
	openSearchResult: (result: VaultSearchResult) => void;
	openStoredNoteRecord: (record: VaultRecord) => void;
	saveCurrentVaultSearch: () => void;
	selectFile: (filePath: string) => void;
	setVaultSearchQuery: (query: string) => void;
	submitInlineFileCreate: () => void;
	togglePinnedPath: (path: string) => void;
	updateInlineFileCreateName: (fileName: string) => void;
};

let {
	fileTree,
	filesCount,
	hasVault,
	loading,
	noteCount,
	pinnedNotes,
	recentNotes,
	savedVaultSearches,
	saving,
	searchingVault,
	selectedPath,
	inlineFileCreate,
	vaultHasRecords,
	vaultSearchQuery,
	vaultSearchResults,
	applySavedVaultSearch,
	cancelInlineFileCreate,
	createDrawingNote,
	createNote,
	createNoteFromTemplate,
	deleteSavedVaultSearch,
	openSearchResult,
	openStoredNoteRecord,
	saveCurrentVaultSearch,
	selectFile,
	setVaultSearchQuery,
	submitInlineFileCreate,
	togglePinnedPath,
	updateInlineFileCreateName
}: Props = $props();
</script>

<aside class="sidebar" aria-label="Local vault">
	<SidebarSummary {filesCount} {noteCount} />

	<VaultSearchPanel
		{hasVault}
		{loading}
		{savedVaultSearches}
		{saving}
		{vaultHasRecords}
		{vaultSearchQuery}
		{applySavedVaultSearch}
		{deleteSavedVaultSearch}
		{saveCurrentVaultSearch}
		{setVaultSearchQuery}
	/>

	<div class="vault-browser">
		<div class="vault-main-browser">
			{#if searchingVault}
				<VaultSearchResults
					results={vaultSearchResults}
					{selectedPath}
					{openSearchResult}
				/>
			{:else if hasVault}
				<NoteTree
					nodes={fileTree}
					activePath={selectedPath}
					createDisabled={loading || saving}
					{createDrawingNote}
					{createNote}
					{createNoteFromTemplate}
					{inlineFileCreate}
					{cancelInlineFileCreate}
					onSelect={selectFile}
					rootLabel="Files"
					{submitInlineFileCreate}
					{updateInlineFileCreateName}
				/>
			{:else}
				<p class="empty-state">No editable text files are indexed yet.</p>
			{/if}
		</div>

		{#if !searchingVault}
			<QuickNotes
				{pinnedNotes}
				{recentNotes}
				{selectedPath}
				{openStoredNoteRecord}
				{togglePinnedPath}
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
