<script lang="ts">
import type { CollectionKanbanGroup, ResolvedCollection } from '../../../collections/index.js';
import type { VaultRecord } from '../../../vault/index.js';
import type { CollectionCellEdit } from '../../shared/types.js';
import { getCollectionColumnLabel } from '../collection-view.js';
import CollectionRecordLink from './CollectionRecordLink.svelte';
import EditableCollectionField from './EditableCollectionField.svelte';

type Props = {
	collectionCellEdit: CollectionCellEdit | null;
	collectionKanbanGroupBy: string;
	groups: CollectionKanbanGroup[];
	loading: boolean;
	saving: boolean;
	selectedCollection: ResolvedCollection;
	cancelCollectionCellEdit: () => void;
	editCollectionRecordField: (record: VaultRecord, column: string) => void;
	formatCollectionRecordValue: (record: VaultRecord, column: string) => string;
	isEditingCollectionCell: (record: VaultRecord, column: string) => boolean;
	openCollectionRecord: (record: VaultRecord) => void;
	saveCollectionCellEdit: (record: VaultRecord, column: string) => Promise<void>;
	updateCollectionCellEditValue: (value: string) => void;
};

let {
	collectionCellEdit,
	collectionKanbanGroupBy,
	groups,
	loading,
	saving,
	selectedCollection,
	cancelCollectionCellEdit,
	editCollectionRecordField,
	formatCollectionRecordValue,
	isEditingCollectionCell,
	openCollectionRecord,
	saveCollectionCellEdit,
	updateCollectionCellEditValue
}: Props = $props();
</script>

<div class="collection-kanban-board" aria-label={`${selectedCollection.definition.name} kanban board`}>
	{#each groups as group (group.key)}
		<section class="collection-kanban-lane" aria-label={`${group.label} lane`}>
			<header>
				<h3>{group.label}</h3>
				<span>{group.records.length} records</span>
			</header>

			<div class="collection-kanban-cards">
				{#each group.records as record (record.path)}
					<article class="collection-kanban-card">
						<CollectionRecordLink
							{record}
							value={formatCollectionRecordValue(record, 'title')}
							{openCollectionRecord}
						/>

						<ul>
							{#each selectedCollection.columns.filter((column) => !['title', collectionKanbanGroupBy].includes(column.toLowerCase())) as column}
								<li>
									<span>{getCollectionColumnLabel(column)}</span>
									<EditableCollectionField
										{collectionCellEdit}
										{column}
										display="strong"
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
								</li>
							{/each}
						</ul>
					</article>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style lang="scss">
.collection-kanban-board {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
	gap: 0.8rem;
	align-items: start;
	min-width: 0;
}

.collection-kanban-lane {
	display: grid;
	gap: 0.65rem;
	min-width: 0;
	padding: 0.7rem;

	background: oklch(0.965 0.018 105);
	border: 1px solid oklch(0.78 0.04 100);
	border-radius: 0.35rem;

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		margin: 0;
		padding: 0;

		border: 0;

		span {
			color: oklch(0.4 0.055 245);
			font-family: var(--font-mono);
			font-size: 0.72rem;
		}
	}

	h3 {
		margin: 0;

		font-size: 0.95rem;
		line-height: 1.2;
	}
}

.collection-kanban-cards {
	display: grid;
	gap: 0.55rem;
}

.collection-kanban-card {
	display: grid;
	gap: 0.55rem;
	padding: 0.7rem;

	background: oklch(0.995 0.006 95);
	border: 1px solid oklch(0.83 0.025 100);
	border-radius: 0.35rem;

	ul {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;

		list-style: none;
	}

	li {
		display: grid;
		gap: 0.12rem;

		> span {
			color: oklch(0.42 0.055 245);
			font-size: 0.72rem;
			font-weight: 700;
			text-transform: uppercase;
		}
	}
}
</style>
