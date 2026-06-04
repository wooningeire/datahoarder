<script lang="ts">
import type {
	CollectionKanbanGroup,
	CollectionSummaryResult,
	CollectionTimelineItem,
	ResolvedCollection
} from '../collections/index.js';
import type { VaultRecord } from '../vault/index.js';
import CollectionCellEditor from './CollectionCellEditor.svelte';
import {
	getCollectionCellInputKind,
	getCollectionCellOptions,
	getCollectionColumnLabel,
	getCollectionSortIndicator,
	isEditableCollectionColumn
} from './collection-view.js';
import type { CollectionCellEdit } from './types.js';

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
	bulkSetCollectionField: () => void;
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
	bulkSetCollectionField,
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

function handleFilterInput(event: Event) {
	setCollectionFilter((event.currentTarget as HTMLInputElement).value);
}
</script>

<article class="collection-preview">
	<header>
		<p>{selectedCollection.view.type} collection</p>
		<h2>{selectedCollection.definition.name}</h2>
	</header>

	{#if selectedCollection.definition.views.length > 1}
		<div class="collection-view-tabs" aria-label="Collection views">
			{#each selectedCollection.definition.views as view, index (`${index}:${view.name}`)}
				<button
					type="button"
					class:active={index === selectedCollection.viewIndex}
					aria-pressed={index === selectedCollection.viewIndex}
					onclick={() => selectCollectionView(index)}
				>
					<span>{view.name}</span>
					<small>{view.type}</small>
				</button>
			{/each}
		</div>
	{/if}

	<div class="collection-toolbar">
		<span>
			{collectionRecords.length} of {selectedCollection.records.length} records
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
			disabled={!hasVault || loading || saving || !collectionRecords.length}
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

	{#if collectionSummaries.length}
		<div class="collection-summary-grid" aria-label="Collection summaries">
			{#each collectionSummaries as summary (summary.label)}
				<section class="collection-summary">
					<span>{summary.label}</span>
					<strong>{summary.value}</strong>

					{#if summary.items.length}
						<ul>
							{#each summary.items as item (item.label)}
								<li>
									<span>{item.label}</span>
									<strong>{item.value}</strong>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		</div>
	{/if}

	{#if collectionRecords.length}
		{#if selectedCollection.view.type.toLowerCase() === 'kanban'}
			<div class="collection-kanban-board" aria-label={`${selectedCollection.definition.name} kanban board`}>
				{#each collectionKanbanGroups as group (group.key)}
					<section class="collection-kanban-lane" aria-label={`${group.label} lane`}>
						<header>
							<h3>{group.label}</h3>
							<span>{group.records.length} records</span>
						</header>

						<div class="collection-kanban-cards">
							{#each group.records as record (record.path)}
								<article class="collection-kanban-card">
									<button type="button" class="record-link" onclick={() => openCollectionRecord(record)}>
										{formatCollectionRecordValue(record, 'title')}
									</button>

									<ul>
										{#each selectedCollection.columns.filter((column) => !['title', collectionKanbanGroupBy].includes(column.toLowerCase())) as column}
											<li>
												<span>{getCollectionColumnLabel(column)}</span>
												{#if isEditableCollectionColumn(selectedCollection, column)}
													{#if isEditingCollectionCell(record, column) && collectionCellEdit}
														<CollectionCellEditor
															inputKind={getCollectionCellInputKind(selectedCollection, column, collectionCellEdit.value)}
															label={getCollectionColumnLabel(column)}
															options={getCollectionCellOptions(selectedCollection, column, collectionCellEdit.value)}
															recordTitle={record.title}
															value={collectionCellEdit.value}
															{saving}
															cancel={cancelCollectionCellEdit}
															save={() => saveCollectionCellEdit(record, column)}
															updateValue={updateCollectionCellEditValue}
														/>
													{:else}
														<button
															type="button"
															class="collection-cell-edit"
															onclick={() => editCollectionRecordField(record, column)}
															disabled={loading || saving}
															aria-label={`Edit ${getCollectionColumnLabel(column)} for ${record.title}: ${formatCollectionRecordValue(record, column) || 'empty'}`}
														>
															{formatCollectionRecordValue(record, column) || 'Set value'}
														</button>
													{/if}
												{:else}
													<strong>{formatCollectionRecordValue(record, column)}</strong>
												{/if}
											</li>
										{/each}
									</ul>
								</article>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{:else if selectedCollection.view.type.toLowerCase() === 'timeline'}
			<div class="collection-timeline-list" aria-label={`${selectedCollection.definition.name} timeline`}>
				{#each collectionTimelineItems as item (item.record.path)}
					<article class="collection-timeline-item">
						<time>{item.dateLabel}</time>

						<div class="collection-timeline-card">
							<button type="button" class="record-link" onclick={() => openCollectionRecord(item.record)}>
								{formatCollectionRecordValue(item.record, 'title')}
							</button>

							<ul>
								{#each selectedCollection.columns.filter((column) => !['title', collectionTimelineDateField.toLowerCase()].includes(column.toLowerCase())) as column}
									<li>
										<span>{getCollectionColumnLabel(column)}</span>
										{#if isEditableCollectionColumn(selectedCollection, column)}
											{#if isEditingCollectionCell(item.record, column) && collectionCellEdit}
												<CollectionCellEditor
													inputKind={getCollectionCellInputKind(selectedCollection, column, collectionCellEdit.value)}
													label={getCollectionColumnLabel(column)}
													options={getCollectionCellOptions(selectedCollection, column, collectionCellEdit.value)}
													recordTitle={item.record.title}
													value={collectionCellEdit.value}
													{saving}
													cancel={cancelCollectionCellEdit}
													save={() => saveCollectionCellEdit(item.record, column)}
													updateValue={updateCollectionCellEditValue}
												/>
											{:else}
												<button
													type="button"
													class="collection-cell-edit"
													onclick={() => editCollectionRecordField(item.record, column)}
													disabled={loading || saving}
													aria-label={`Edit ${getCollectionColumnLabel(column)} for ${item.record.title}: ${formatCollectionRecordValue(item.record, column) || 'empty'}`}
												>
													{formatCollectionRecordValue(item.record, column) || 'Set value'}
												</button>
											{/if}
										{:else}
											<strong>{formatCollectionRecordValue(item.record, column)}</strong>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					</article>
				{/each}
			</div>
		{:else}
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
											<button type="button" class="record-link" onclick={() => openCollectionRecord(record)}>
												{formatCollectionRecordValue(record, column)}
											</button>
										{:else}
											{#if isEditableCollectionColumn(selectedCollection, column)}
												{#if isEditingCollectionCell(record, column) && collectionCellEdit}
													<CollectionCellEditor
														inputKind={getCollectionCellInputKind(selectedCollection, column, collectionCellEdit.value)}
														label={getCollectionColumnLabel(column)}
														options={getCollectionCellOptions(selectedCollection, column, collectionCellEdit.value)}
														recordTitle={record.title}
														value={collectionCellEdit.value}
														{saving}
														cancel={cancelCollectionCellEdit}
														save={() => saveCollectionCellEdit(record, column)}
														updateValue={updateCollectionCellEditValue}
													/>
												{:else}
													<button
														type="button"
														class="collection-cell-edit"
														onclick={() => editCollectionRecordField(record, column)}
														disabled={loading || saving}
														aria-label={`Edit ${getCollectionColumnLabel(column)} for ${record.title}: ${formatCollectionRecordValue(record, column) || 'empty'}`}
													>
														{formatCollectionRecordValue(record, column) || 'Set value'}
													</button>
												{/if}
											{:else}
												{formatCollectionRecordValue(record, column)}
											{/if}
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else}
		<div class="preview-empty collection-empty">
			<h2>No Records</h2>
			<p>Adjust the collection source or clear the filter.</p>
		</div>
	{/if}

	<details class="collection-source">
		<summary>Source</summary>
		<pre>{selectedContent}</pre>
	</details>
</article>
