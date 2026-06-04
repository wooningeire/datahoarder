<script lang="ts">
import type { CollectionSummaryResult } from '../../../collections/index.js';

type Props = {
	summaries: CollectionSummaryResult[];
};

let { summaries }: Props = $props();
</script>

{#if summaries.length}
	<div class="collection-summary-grid" aria-label="Collection summaries">
		{#each summaries as summary (summary.label)}
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

<style lang="scss">
.collection-summary-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
	gap: 0.65rem;
	min-width: 0;
}

.collection-summary {
	display: grid;
	gap: 0.45rem;
	min-width: 0;
	padding: 0.7rem;

	background: oklch(0.995 0.006 95);
	border: 1px solid oklch(0.83 0.025 100);
	border-radius: 0.35rem;

	> span {
		color: oklch(0.42 0.055 245);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	> strong {
		color: oklch(0.25 0.05 245);
		font-size: 1.35rem;
		line-height: 1.1;

		overflow-wrap: anywhere;
	}

	ul {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding: 0;

		list-style: none;
	}

	li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;

		color: oklch(0.42 0.045 245);
		font-size: 0.84rem;

		strong {
			color: oklch(0.28 0.05 245);
		}
	}
}
</style>
