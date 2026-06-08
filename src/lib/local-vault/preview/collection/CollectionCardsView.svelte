<script lang="ts">
import type { ResolvedCollection } from "../../../collections/index.js";
import type { VaultRecord } from "../../../vault/index.js";
import type { CollectionCellEdit } from "../../shared/types.js";
import { getCollectionColumnLabel } from "../collection-view.js";
import CollectionRecordLink from "./CollectionRecordLink.svelte";
import EditableCollectionField from "./EditableCollectionField.svelte";

type Props = {
	collectionCellEdit: CollectionCellEdit | null;
	collectionRecords: VaultRecord[];
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
	collectionRecords,
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

const initialRecordRenderLimit = 72;
const recordRenderIncrement = 72;

let renderedRecordLimit = $state(initialRecordRenderLimit);
let recordSetKey = $state("");

let currentRecordSetKey = $derived(getRecordSetKey(collectionRecords));
let visibleRecords = $derived(collectionRecords.slice(0, renderedRecordLimit));
let hiddenRecordCount = $derived(Math.max(0, collectionRecords.length - visibleRecords.length));
let detailColumns = $derived(selectedCollection.columns.filter((column) => column.toLowerCase() !== "title"));

$effect(() => {
	if (recordSetKey === currentRecordSetKey) {
		return;
	}

	recordSetKey = currentRecordSetKey;
	renderedRecordLimit = initialRecordRenderLimit;
});

function showMoreRecords() {
	renderedRecordLimit = Math.min(collectionRecords.length, renderedRecordLimit + recordRenderIncrement);
}

function getRecordSetKey(records: VaultRecord[]) {
	return [
		records.length,
		records[0]?.path ?? "",
		records.at(-1)?.path ?? ""
	].join("\0");
}
</script>

<div class="collection-cards" aria-label={`${selectedCollection.definition.name} cards`}>
	{#each visibleRecords as record (record.path)}
		<article class="collection-card">
			<CollectionRecordLink
				{record}
				value={formatCollectionRecordValue(record, "title")}
				{openCollectionRecord}
			/>

			{#if detailColumns.length}
				<dl>
					{#each detailColumns as column}
						<div>
							<dt>{getCollectionColumnLabel(column)}</dt>
							<dd>
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
							</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</article>
	{/each}

	{#if hiddenRecordCount}
		<div class="collection-cards-more">
			<span>{visibleRecords.length} of {collectionRecords.length} cards rendered</span>
			<button type="button" onclick={showMoreRecords}>
				Show {Math.min(recordRenderIncrement, hiddenRecordCount)} more
			</button>
		</div>
	{/if}
</div>

<style lang="scss">
.collection-cards {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
	gap: 0.75rem;
	min-width: 0;
}

.collection-card {
	display: grid;
	align-content: start;
	gap: 0.65rem;
	min-width: 0;
	padding: 0.75rem;

	background: oklch(0.995 0.006 95);
	border: 1px solid oklch(0.82 0.03 100);
	border-radius: 0.35rem;

	dl {
		display: grid;
		gap: 0.5rem;
		margin: 0;
	}

	div {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	dt,
	dd {
		margin: 0;
	}

	dt {
		color: oklch(0.42 0.055 245);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	dd {
		min-width: 0;
	}
}

.collection-cards-more {
	display: flex;
	grid-column: 1 / -1;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.7rem;

	color: oklch(0.32 0.05 245);

	background: oklch(0.975 0.018 105);
	border: 1px solid oklch(0.82 0.035 100);
	border-radius: 0.35rem;

	span {
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
}
</style>
