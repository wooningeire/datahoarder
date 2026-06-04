<script lang="ts">
import type { VaultRecord } from '../../../vault/index.js';

type Props = {
	record: VaultRecord;
	value: string;
	openCollectionRecord: (record: VaultRecord) => void;
};

let { record, value, openCollectionRecord }: Props = $props();
</script>

<button type="button" class="record-link" onclick={() => openCollectionRecord(record)}>
	{value}
</button>

<style lang="scss">
.record-link {
	min-height: 0;
	padding: 0;

	color: oklch(0.34 0.1 190);
	font-weight: 700;
	text-align: left;
	text-decoration: underline;
	text-decoration-thickness: 1px;
	text-underline-offset: 0.16em;

	background: none;
	border: 0;
	border-radius: 0;

	&:hover:not(:disabled) {
		background: none;
	}
}
</style>
