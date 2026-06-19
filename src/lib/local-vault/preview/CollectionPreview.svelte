<script lang="ts">
import type {
	CollectionKanbanGroup,
	CollectionSummaryResult,
	CollectionTimelineItem,
	ResolvedCollection
} from '../../collections/index.js';
import type { VaultRecord } from '../../vault/index.js';
import type { CollectionCellEdit } from '../shared/types.js';
import CollectionCardsView from './collection/CollectionCardsView.svelte';
import CollectionKanbanView from './collection/CollectionKanbanView.svelte';
import CollectionSource from './collection/CollectionSource.svelte';
import CollectionSummaryGrid from './collection/CollectionSummaryGrid.svelte';
import CollectionTableView from './collection/CollectionTableView.svelte';
import CollectionTimelineView from './collection/CollectionTimelineView.svelte';
import CollectionToolbar from './collection/CollectionToolbar.svelte';
import CollectionViewTabs from './collection/CollectionViewTabs.svelte';
import PreviewEmpty from './PreviewEmpty.svelte';

type Props = {
	collectionCellEdit: CollectionCellEdit | null;
	collectionFilter: string;
	collectionKanbanGroupBy: string;
	collectionKanbanGroups: CollectionKanbanGroup[];
	collectionRecordCreationError: string;
	collectionRecords: VaultRecord[];
	collectionSortColumn: string;
	collectionSortDirection: 'asc' | 'desc';
	collectionSummaries: CollectionSummaryResult[];
	collectionTimelineDateField: string;
	collectionTimelineItems: CollectionTimelineItem[];
	hasVault: boolean;
	loading: boolean;
	saving: boolean;
	selectedCollection: ResolvedCollection;
	selectedContent: string;
	addFieldToSelectedCollection: () => void;
	cancelCollectionCellEdit: () => void;
	createCollectionRecord: () => void;
	downloadCollectionExport: (format: 'csv' | 'json') => void;
	editCollectionRecordField: (record: VaultRecord, column: string) => void;
	formatCollectionRecordValue: (record: VaultRecord, column: string) => string;
	isEditingCollectionCell: (record: VaultRecord, column: string) => boolean;
	openCollectionRecord: (record: VaultRecord) => void;
	saveCollectionCellEdit: (record: VaultRecord, column: string) => Promise<void>;
	selectCollectionView: (viewIndex: number) => void;
	setCollectionFilter: (filter: string) => void;
	sortCollectionBy: (column: string) => void;
	updateCollectionCellEditValue: (value: string) => void;
};

let {
	collectionCellEdit,
	collectionFilter,
	collectionKanbanGroupBy,
	collectionKanbanGroups,
	collectionRecordCreationError,
	collectionRecords,
	collectionSortColumn,
	collectionSortDirection,
	collectionSummaries,
	collectionTimelineDateField,
	collectionTimelineItems,
	hasVault,
	loading,
	saving,
	selectedCollection,
	selectedContent,
	addFieldToSelectedCollection,
	cancelCollectionCellEdit,
	createCollectionRecord,
	downloadCollectionExport,
	editCollectionRecordField,
	formatCollectionRecordValue,
	isEditingCollectionCell,
	openCollectionRecord,
	saveCollectionCellEdit,
	selectCollectionView,
	setCollectionFilter,
	sortCollectionBy,
	updateCollectionCellEditValue
}: Props = $props();
</script>

<article class="collection-preview">
	<header>
		<p>{selectedCollection.view.type} collection</p>
		<h2>{selectedCollection.definition.name}</h2>
	</header>

	<CollectionViewTabs {selectedCollection} {selectCollectionView} />

	<CollectionToolbar
		{collectionFilter}
		{collectionRecordCreationError}
		recordsCount={collectionRecords.length}
		{hasVault}
		{loading}
		{saving}
		{selectedCollection}
		{addFieldToSelectedCollection}
		{createCollectionRecord}
		{downloadCollectionExport}
		{setCollectionFilter}
	/>

	<CollectionSummaryGrid summaries={collectionSummaries} />

	{#if collectionRecords.length}
		{#if selectedCollection.view.type.toLowerCase() === 'cards'}
			<CollectionCardsView
				{collectionCellEdit}
				{collectionRecords}
				{loading}
				{saving}
				{selectedCollection}
				{cancelCollectionCellEdit}
				{editCollectionRecordField}
				{formatCollectionRecordValue}
				{isEditingCollectionCell}
				{openCollectionRecord}
				{saveCollectionCellEdit}
				{updateCollectionCellEditValue}
			/>
		{:else if selectedCollection.view.type.toLowerCase() === 'kanban'}
			<CollectionKanbanView
				{collectionCellEdit}
				{collectionKanbanGroupBy}
				groups={collectionKanbanGroups}
				{loading}
				{saving}
				{selectedCollection}
				{cancelCollectionCellEdit}
				{editCollectionRecordField}
				{formatCollectionRecordValue}
				{isEditingCollectionCell}
				{openCollectionRecord}
				{saveCollectionCellEdit}
				{updateCollectionCellEditValue}
			/>
		{:else if selectedCollection.view.type.toLowerCase() === 'timeline'}
			<CollectionTimelineView
				{collectionCellEdit}
				{collectionTimelineDateField}
				items={collectionTimelineItems}
				{loading}
				{saving}
				{selectedCollection}
				{cancelCollectionCellEdit}
				{editCollectionRecordField}
				{formatCollectionRecordValue}
				{isEditingCollectionCell}
				{openCollectionRecord}
				{saveCollectionCellEdit}
				{updateCollectionCellEditValue}
			/>
		{:else}
			<CollectionTableView
				{collectionCellEdit}
				{collectionRecords}
				{collectionSortColumn}
				{collectionSortDirection}
				{loading}
				{saving}
				{selectedCollection}
				{cancelCollectionCellEdit}
				{editCollectionRecordField}
				{formatCollectionRecordValue}
				{isEditingCollectionCell}
				{openCollectionRecord}
				{saveCollectionCellEdit}
				{sortCollectionBy}
				{updateCollectionCellEditValue}
			/>
		{/if}
	{:else}
		<PreviewEmpty
			variant="collection"
			title="No Records"
			description="Adjust the collection source or clear the filter."
		/>
	{/if}

	<CollectionSource content={selectedContent} />
</article>

<style lang="scss">
.collection-preview {
	display: grid;
	gap: 0.85rem;
	min-width: 0;

	header {
		display: grid;
		gap: 0.25rem;

		p,
		h2 {
			margin: 0;
		}

		p {
			color: oklch(0.42 0.08 180);
			font-family: var(--font-mono);
			font-size: 0.74rem;
			font-weight: 700;
			text-transform: uppercase;
		}
	}
}
</style>
