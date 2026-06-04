<script lang="ts">
import type { ResolvedCollection } from '../../../collections/index.js';
import type { VaultRecord } from '../../../vault/index.js';
import type { CollectionCellEdit } from '../../shared/types.js';
import CollectionCellEditor from '../CollectionCellEditor.svelte';
import {
	getCollectionCellInputKind,
	getCollectionCellOptions,
	getCollectionColumnLabel,
	isEditableCollectionColumn
} from '../collection-view.js';

type Props = {
	collectionCellEdit: CollectionCellEdit | null;
	column: string;
	display?: 'plain' | 'strong';
	loading: boolean;
	record: VaultRecord;
	saving: boolean;
	selectedCollection: ResolvedCollection;
	cancelCollectionCellEdit: () => void;
	editCollectionRecordField: (record: VaultRecord, column: string) => void;
	formatCollectionRecordValue: (record: VaultRecord, column: string) => string;
	isEditingCollectionCell: (record: VaultRecord, column: string) => boolean;
	saveCollectionCellEdit: (record: VaultRecord, column: string) => Promise<void>;
	updateCollectionCellEditValue: (value: string) => void;
};

let {
	collectionCellEdit,
	column,
	display = 'plain',
	loading,
	record,
	saving,
	selectedCollection,
	cancelCollectionCellEdit,
	editCollectionRecordField,
	formatCollectionRecordValue,
	isEditingCollectionCell,
	saveCollectionCellEdit,
	updateCollectionCellEditValue
}: Props = $props();

let value = $derived(formatCollectionRecordValue(record, column));
let label = $derived(getCollectionColumnLabel(column));
</script>

{#if isEditableCollectionColumn(selectedCollection, column)}
	{#if isEditingCollectionCell(record, column) && collectionCellEdit}
		<CollectionCellEditor
			inputKind={getCollectionCellInputKind(selectedCollection, column, collectionCellEdit.value)}
			{label}
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
			aria-label={`Edit ${label} for ${record.title}: ${value || 'empty'}`}
		>
			{value || 'Set value'}
		</button>
	{/if}
{:else if display === 'strong'}
	<strong class="field-value">{value}</strong>
{:else}
	{value}
{/if}

<style lang="scss">
.collection-cell-edit {
	display: block;
	width: 100%;
	min-height: 0;
	padding: 0;

	color: inherit;
	text-align: left;
	text-decoration: underline dotted oklch(0.55 0.08 190);
	text-decoration-thickness: 1px;
	text-underline-offset: 0.18em;

	background: none;
	border: 0;
	border-radius: 0;

	&:hover:not(:disabled) {
		background: none;
	}

	&:hover:not(:disabled),
	&:focus-visible {
		color: oklch(0.28 0.1 190);
	}
}

.field-value {
	font-size: 0.9rem;
}
</style>
