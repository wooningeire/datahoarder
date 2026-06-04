<script lang="ts">
import type { SavedVaultSearch } from '../../vault/saved-search.js';

type Props = {
	hasVault: boolean;
	loading: boolean;
	savedVaultSearches: SavedVaultSearch[];
	saving: boolean;
	vaultHasRecords: boolean;
	vaultSearchQuery: string;
	applySavedVaultSearch: (search: SavedVaultSearch) => void;
	deleteSavedVaultSearch: (search: SavedVaultSearch) => void;
	saveCurrentVaultSearch: () => void;
	setVaultSearchQuery: (query: string) => void;
};

let {
	hasVault,
	loading,
	savedVaultSearches,
	saving,
	vaultHasRecords,
	vaultSearchQuery,
	applySavedVaultSearch,
	deleteSavedVaultSearch,
	saveCurrentVaultSearch,
	setVaultSearchQuery
}: Props = $props();

function handleVaultSearchInput(event: Event) {
	setVaultSearchQuery((event.currentTarget as HTMLInputElement).value);
}
</script>

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

<style lang="scss">
.vault-search {
	display: grid;
	gap: 0.3rem;
	min-width: 0;

	label {
		color: oklch(0.42 0.06 255);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	input {
		width: 100%;
		min-height: 2rem;
		padding: 0.3rem 0.5rem;

		color: inherit;

		background: oklch(0.995 0.006 235);
		border: 1px solid oklch(0.75 0.04 235);
		border-radius: 0.35rem;

		&:focus-visible {
			outline: 2px solid oklch(0.55 0.13 205);
			outline-offset: 2px;
		}

		&:disabled {
			cursor: not-allowed;
			opacity: 0.6;
		}
	}
}

.vault-search-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.35rem;
	align-items: center;
	min-width: 0;

	button {
		min-height: 2rem;
		padding: 0.3rem 0.48rem;

		color: oklch(0.34 0.08 180);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
	}
}

.saved-searches {
	min-width: 0;
	max-height: 8.25rem;
	overflow: auto;

	ul {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding: 0;

		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.3rem;
		align-items: stretch;
		min-width: 0;
	}
}

.saved-search-apply {
	display: grid;
	gap: 0.05rem;
	min-width: 0;
	min-height: 2rem;
	padding: 0.3rem 0.45rem;

	text-align: left;

	background: oklch(0.95 0.02 155);

	&:hover:not(:disabled),
	&:focus-visible {
		background: oklch(0.89 0.045 155);
	}

	strong,
	span {
		min-width: 0;
		overflow: hidden;

		text-overflow: ellipsis;
		white-space: nowrap;
	}

	strong {
		color: oklch(0.25 0.055 245);
		font-size: 0.8rem;
	}

	span {
		color: oklch(0.42 0.035 245);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}
}

.saved-search-delete {
	min-height: 2rem;
	padding: 0.3rem 0.48rem;

	color: oklch(0.34 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.68rem;
	font-weight: 700;
	text-transform: uppercase;
}
</style>
