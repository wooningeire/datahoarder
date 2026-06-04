<script lang="ts">
import type { BaseView } from '../../note-model/base.js';

type Props = {
	content: string;
	title: string;
	views: BaseView[];
};

let { content, title, views }: Props = $props();
</script>

<header>
	<p>.base</p>
	<h2>{title}</h2>
</header>

{#if views.length}
	<div class="base-views">
		{#each views as view}
			<section>
				<h3>{view.name}</h3>
				<span>{view.type}</span>
			</section>
		{/each}
	</div>
{/if}

<pre>{content}</pre>

<style lang="scss">
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

.base-views {
	display: grid;
	gap: 0.45rem;

	section {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.7rem;
		padding: 0.6rem 0.7rem;

		background: oklch(0.96 0.025 105);
		border: 1px solid oklch(0.78 0.05 100);
		border-radius: 0.35rem;
	}

	h3 {
		margin: 0;
	}

	span {
		color: oklch(0.36 0.08 180);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
	}
}

pre {
	max-width: 100%;
	margin: 0;
	overflow: auto;

	white-space: pre-wrap;
}
</style>
