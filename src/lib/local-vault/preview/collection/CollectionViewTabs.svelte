<script lang="ts">
import type { ResolvedCollection } from '../../../collections/index.js';

type Props = {
	selectedCollection: ResolvedCollection;
	selectCollectionView: (viewIndex: number) => void;
};

let { selectedCollection, selectCollectionView }: Props = $props();
</script>

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

<style lang="scss">
.collection-view-tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;

	button {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35rem;
		min-height: 2rem;
		padding: 0.32rem 0.55rem;

		color: oklch(0.34 0.055 245);

		background: oklch(0.97 0.015 100);
		border: 1px solid oklch(0.78 0.04 100);
		border-radius: 0.35rem;

		&.active {
			color: oklch(0.22 0.06 245);

			background: oklch(0.91 0.04 150);
			border-color: oklch(0.62 0.12 155);
		}
	}

	small {
		color: inherit;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;

		opacity: 0.72;
	}
}
</style>
