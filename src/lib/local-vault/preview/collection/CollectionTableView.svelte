<script lang="ts">
import type { ResolvedCollection } from '../../../collections/index.js';
import type { VaultRecord } from '../../../vault/index.js';
import type { CollectionCellEdit } from '../../shared/types.js';
import { getCollectionColumnLabel, getCollectionSortIndicator } from '../collection-view.js';
import CollectionRecordLink from './CollectionRecordLink.svelte';
import EditableCollectionField from './EditableCollectionField.svelte';

type Props = {
	collectionCellEdit: CollectionCellEdit | null;
	collectionRecords: VaultRecord[];
	collectionSortColumn: string;
	collectionSortDirection: 'asc' | 'desc';
	loading: boolean;
	saving: boolean;
	selectedCollection: ResolvedCollection;
	cancelCollectionCellEdit: () => void;
	editCollectionRecordField: (record: VaultRecord, column: string) => void;
	formatCollectionRecordValue: (record: VaultRecord, column: string) => string;
	isEditingCollectionCell: (record: VaultRecord, column: string) => boolean;
	openCollectionRecord: (record: VaultRecord) => void;
	saveCollectionCellEdit: (record: VaultRecord, column: string) => Promise<void>;
	sortCollectionBy: (column: string) => void;
	updateCollectionCellEditValue: (value: string) => void;
};

let {
	collectionCellEdit,
	collectionRecords,
	collectionSortColumn,
	collectionSortDirection,
	loading,
	saving,
	selectedCollection,
	cancelCollectionCellEdit,
	editCollectionRecordField,
	formatCollectionRecordValue,
	isEditingCollectionCell,
	openCollectionRecord,
	saveCollectionCellEdit,
	sortCollectionBy,
	updateCollectionCellEditValue
}: Props = $props();
</script>

<div class="collection-table-wrap">
	<table>
		<thead>
			<tr>
				{#each selectedCollection.columns as column}
					<th>
						<button
							type="button"
							class="table-sort"
							onclick={() => sortCollectionBy(column)}
							aria-label={`Sort by ${getCollectionColumnLabel(column)}`}
						>
							<span>{getCollectionColumnLabel(column)}</span>
							<small>{getCollectionSortIndicator(column, collectionSortColumn, collectionSortDirection)}</small>
						</button>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each collectionRecords as record}
				<tr>
					{#each selectedCollection.columns as column}
						<td>
							{#if column === 'title'}
								<CollectionRecordLink
									{record}
									value={formatCollectionRecordValue(record, column)}
									{openCollectionRecord}
								/>
							{:else}
								<EditableCollectionField
									{collectionCellEdit}
									{column}
									{loading}
									{record}
									{saving}
									{selectedCollection}
									{cancelCollectionCellEdit}
									{editCollectionRecordField}
									{formatCollectionRecordValue}
									{isEditingCollectionCell}
									{saveCollectionCellEdit}
									{updateCollectionCellEditValue}
								/>
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style lang="scss">
.collection-table-wrap {
	max-width: 100%;
	overflow: auto;

	border: 1px solid oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

table {
	width: 100%;
	min-width: 36rem;

	border-collapse: collapse;
	background: oklch(0.995 0.005 95);
}

th,
td {
	padding: 0.5rem 0.6rem;

	text-align: left;
	vertical-align: top;

	border-bottom: 1px solid oklch(0.86 0.025 100);
}

th {
	position: sticky;
	top: 0;
	z-index: 1;

	background: oklch(0.96 0.025 105);
}

td {
	max-width: 18rem;

	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

tbody {
	tr:last-child td {
		border-bottom: 0;
	}
}

.table-sort {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 0.5rem;
	width: 100%;
	min-height: 0;
	padding: 0;

	color: oklch(0.28 0.05 245);
	font-weight: 700;

	background: none;
	border: 0;
	border-radius: 0;

	&:hover:not(:disabled) {
		background: none;
	}

	small {
		color: oklch(0.4 0.08 180);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
	}
}
</style>
