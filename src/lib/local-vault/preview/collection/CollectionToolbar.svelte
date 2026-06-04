<script lang="ts">
import type { ResolvedCollection } from '../../../collections/index.js';

type Props = {
	collectionFilter: string;
	collectionRecordCreationError: string;
	recordsCount: number;
	hasVault: boolean;
	loading: boolean;
	saving: boolean;
	selectedCollection: ResolvedCollection;
	addFieldToSelectedCollection: () => void;
	bulkSetCollectionField: () => void;
	createCollectionRecord: () => void;
	downloadCollectionExport: (format: 'csv' | 'json') => void;
	setCollectionFilter: (filter: string) => void;
};

let {
	collectionFilter,
	collectionRecordCreationError,
	recordsCount,
	hasVault,
	loading,
	saving,
	selectedCollection,
	addFieldToSelectedCollection,
	bulkSetCollectionField,
	createCollectionRecord,
	downloadCollectionExport,
	setCollectionFilter
}: Props = $props();

function handleFilterInput(event: Event) {
	setCollectionFilter((event.currentTarget as HTMLInputElement).value);
}
</script>

<div class="collection-toolbar">
	<span>
		{recordsCount} of {selectedCollection.records.length} records
	</span>
	<button
		type="button"
		onclick={createCollectionRecord}
		disabled={!hasVault || loading || Boolean(collectionRecordCreationError)}
		title={collectionRecordCreationError || 'Create collection record'}
	>
		New Record
	</button>
	<button type="button" onclick={addFieldToSelectedCollection} disabled={!hasVault || loading || saving}>
		Add Field
	</button>
	<button
		type="button"
		onclick={bulkSetCollectionField}
		disabled={!hasVault || loading || saving || !recordsCount}
	>
		Bulk Set Field
	</button>
	<button type="button" onclick={() => downloadCollectionExport('csv')} disabled={loading}>
		Export CSV
	</button>
	<button type="button" onclick={() => downloadCollectionExport('json')} disabled={loading}>
		Export JSON
	</button>
	<input
		type="search"
		value={collectionFilter}
		placeholder="Filter records"
		aria-label="Filter collection records"
		oninput={handleFilterInput}
	/>
</div>

<style lang="scss">
.collection-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.65rem;

	span {
		color: oklch(0.38 0.04 245);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}

	input {
		min-width: min(100%, 14rem);
		min-height: 2rem;
		padding: 0.3rem 0.5rem;

		color: inherit;

		background: oklch(0.98 0.01 95);
		border: 1px solid oklch(0.76 0.04 105);
		border-radius: 0.35rem;

		&:focus-visible {
			outline: 2px solid oklch(0.55 0.13 205);
			outline-offset: 2px;
		}
	}
}
</style>
