<script lang="ts">
import type { CollectionTimelineItem, ResolvedCollection } from '../../../collections/index.js';
import type { VaultRecord } from '../../../vault/index.js';
import type { CollectionCellEdit } from '../../shared/types.js';
import { getCollectionColumnLabel } from '../collection-view.js';
import CollectionRecordLink from './CollectionRecordLink.svelte';
import EditableCollectionField from './EditableCollectionField.svelte';

type Props = {
	collectionCellEdit: CollectionCellEdit | null;
	collectionTimelineDateField: string;
	items: CollectionTimelineItem[];
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
	collectionTimelineDateField,
	items,
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

<div class="collection-timeline-list" aria-label={`${selectedCollection.definition.name} timeline`}>
	{#each items as item (item.record.path)}
		<article class="collection-timeline-item">
			<time>{item.dateLabel}</time>

			<div class="collection-timeline-card">
				<CollectionRecordLink
					record={item.record}
					value={formatCollectionRecordValue(item.record, 'title')}
					{openCollectionRecord}
				/>

				<ul>
					{#each selectedCollection.columns.filter((column) => !['title', collectionTimelineDateField.toLowerCase()].includes(column.toLowerCase())) as column}
						<li>
							<span>{getCollectionColumnLabel(column)}</span>
							<EditableCollectionField
								{collectionCellEdit}
								{column}
								display="strong"
								{loading}
								record={item.record}
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
			</div>
		</article>
	{/each}
</div>

<style lang="scss">
.collection-timeline-list {
	display: grid;
	gap: 0.75rem;
	min-width: 0;
}

.collection-timeline-item {
	display: grid;
	grid-template-columns: minmax(7rem, 10rem) minmax(0, 1fr);
	gap: 0.75rem;
	align-items: start;
	min-width: 0;

	time {
		color: oklch(0.38 0.06 245);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 700;

		overflow-wrap: anywhere;
	}
}

.collection-timeline-card {
	display: grid;
	gap: 0.55rem;
	min-width: 0;
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
		min-width: 0;

		> span {
			color: oklch(0.42 0.055 245);
			font-size: 0.72rem;
			font-weight: 700;
			text-transform: uppercase;
		}
	}
}

@media (max-width: 760px) {
	.collection-timeline-item {
		grid-template-columns: 1fr;
		gap: 0.35rem;
	}
}
</style>
