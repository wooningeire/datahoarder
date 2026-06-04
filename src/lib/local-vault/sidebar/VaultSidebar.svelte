<script lang="ts">
import NoteTree from '../../note-ui/NoteTree.svelte';
import type { NoteTreeNode } from '../../note-model/tree.js';
import type { SavedVaultSearch } from '../../vault/saved-search.js';
import type { VaultIndex } from '../../vault/index.js';
import type { VaultSearchResult } from '../../vault/search.js';

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
	vaultHasRecords: boolean;
	vaultSearchQuery: string;
	vaultSearchResults: VaultSearchResult[];
	applySavedVaultSearch: (search: SavedVaultSearch) => void;
	createDrawingNote: (directoryPath: string) => void;
	createNote: (directoryPath: string) => void;
	createNoteFromTemplate: (directoryPath: string) => void;
	deleteSavedVaultSearch: (search: SavedVaultSearch) => void;
	openSearchResult: (result: VaultSearchResult) => void;
	openStoredNoteRecord: (record: VaultRecord) => void;
	saveCurrentVaultSearch: () => void;
	selectFile: (filePath: string) => void;
	setVaultSearchQuery: (query: string) => void;
	togglePinnedPath: (path: string) => void;
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
	vaultHasRecords,
	vaultSearchQuery,
	vaultSearchResults,
	applySavedVaultSearch,
	createDrawingNote,
	createNote,
	createNoteFromTemplate,
	deleteSavedVaultSearch,
	openSearchResult,
	openStoredNoteRecord,
	saveCurrentVaultSearch,
	selectFile,
	setVaultSearchQuery,
	togglePinnedPath
}: Props = $props();

function handleVaultSearchInput(event: Event) {
	setVaultSearchQuery((event.currentTarget as HTMLInputElement).value);
}
</script>

<aside class="sidebar" aria-label="Local vault">
	<div class="sidebar-summary">
		<span>{filesCount} files</span>
		<span>{noteCount} notes</span>
	</div>

	<div class="vault-search">
		<label for="vault-search-input">Search</label>
		<div class="vault-search-row">
			<input
				id="vault-search-input"
				type="search"
				value={vaultSearchQuery}
				placeholder="Search vault"
				aria-label="Search vault"
				disabled={!vaultHasRecords}
				oninput={handleVaultSearchInput}
			/>
			<button
				type="button"
				onclick={saveCurrentVaultSearch}
				disabled={!hasVault || loading || saving || !vaultSearchQuery.trim()}
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
								disabled={!hasVault || loading || saving}
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
			{:else if hasVault}
				<NoteTree
					nodes={fileTree}
					activePath={selectedPath}
					createDisabled={loading || saving}
					{createDrawingNote}
					{createNote}
					{createNoteFromTemplate}
					onSelect={selectFile}
					rootLabel="Files"
				/>
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
