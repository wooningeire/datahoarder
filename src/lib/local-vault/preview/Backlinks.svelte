<script lang="ts">
import type { VaultBacklink } from '../../vault/index.js';

type Props = {
	backlinks: VaultBacklink[];
	openBacklink: (backlink: VaultBacklink) => void;
};

let { backlinks, openBacklink }: Props = $props();
</script>

{#if backlinks.length}
	<section class="backlinks" aria-label="Backlinks">
		<header>
			<p>{backlinks.length} backlinks</p>
			<h2>Backlinks</h2>
		</header>

		<ul>
			{#each backlinks as backlink (backlink.record.path)}
				<li>
					<button type="button" onclick={() => openBacklink(backlink)}>
						<strong>{backlink.record.title}</strong>
						<span>{backlink.record.path}</span>
						<small>{backlink.links.map((link) => link.label).join(', ')}</small>
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style lang="scss">
.backlinks {
	display: grid;
	gap: 0.65rem;
	min-width: 0;
	padding-top: 0.85rem;

	border-top: 1px solid oklch(0.84 0.025 100);

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

	ul {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;

		list-style: none;
	}

	button {
		display: grid;
		gap: 0.12rem;
		width: 100%;
		padding: 0.55rem 0.65rem;

		text-align: left;

		background: oklch(0.975 0.012 95);
		border: 1px solid oklch(0.83 0.025 100);
		border-radius: 0.35rem;

		&:hover:not(:disabled) {
			background: oklch(0.94 0.025 120);
		}
	}

	strong,
	span,
	small {
		min-width: 0;

		overflow-wrap: anywhere;
	}

	strong {
		color: oklch(0.26 0.08 190);
	}

	span,
	small {
		color: oklch(0.42 0.045 245);
		font-size: 0.78rem;
	}

	small {
		font-family: var(--font-mono);
	}
}
</style>
