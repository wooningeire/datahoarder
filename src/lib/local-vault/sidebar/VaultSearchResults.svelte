<script lang="ts">
import type { VaultSearchResult } from '../../vault/search.js';

type Props = {
	results: VaultSearchResult[];
	selectedPath: string;
	openSearchResult: (result: VaultSearchResult) => void;
};

let { results, selectedPath, openSearchResult }: Props = $props();
</script>

<div class="search-results" aria-live="polite">
	<div class="search-count">
		<span>{results.length} results</span>
	</div>

	{#if results.length}
		<ul>
			{#each results as result (result.record.path)}
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

<style lang="scss">
.search-results {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	gap: 0.5rem;
	min-height: 0;
	overflow: hidden;

	ul {
		display: grid;
		align-content: start;
		gap: 0.35rem;
		min-height: 0;
		margin: 0;
		padding: 0;
		overflow: auto;

		list-style: none;
	}

	button {
		display: grid;
		gap: 0.12rem;
		width: 100%;
		padding: 0.45rem 0.55rem;

		text-align: left;

		background: oklch(0.955 0.018 235);

		&:hover:not(:disabled),
		&.active-search-result {
			background: oklch(0.88 0.05 205);
		}
	}

	strong,
	span,
	small,
	em {
		min-width: 0;
		overflow: hidden;

		text-overflow: ellipsis;
		white-space: nowrap;
	}

	strong {
		color: oklch(0.25 0.055 245);
	}

	span {
		color: oklch(0.42 0.035 245);
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	small {
		color: oklch(0.36 0.04 245);
		font-size: 0.78rem;
	}

	em {
		color: oklch(0.38 0.08 180);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-style: normal;
		text-transform: uppercase;
	}
}

.search-count span {
	color: oklch(0.42 0.06 255);
	font-family: var(--font-mono);
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
}

.empty-state {
	color: oklch(0.42 0.035 245);
}
</style>
