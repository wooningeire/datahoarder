<script lang="ts">
import { onMount } from 'svelte';
import type { CommandPaletteItem } from '../shared/types.js';

type Props = {
	items: CommandPaletteItem[];
	query: string;
	close: () => void;
	runItem: (item: CommandPaletteItem) => void;
	setQuery: (query: string) => void;
};

let { items, query, close, runItem, setQuery }: Props = $props();
let inputElement: HTMLInputElement | undefined = $state();

onMount(() => {
	inputElement?.focus();
});

function handleInput(event: Event) {
	setQuery((event.currentTarget as HTMLInputElement).value);
}

function handleInputKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		event.preventDefault();
		close();
		return;
	}

	if (event.key === 'Enter') {
		const firstItem = items[0];

		if (firstItem) {
			event.preventDefault();
			runItem(firstItem);
		}
	}
}
</script>

<div class="command-palette-backdrop">
	<button type="button" class="command-palette-scrim" onclick={close} aria-label="Close command palette"></button>
	<div
		class="command-palette"
		role="dialog"
		aria-modal="true"
		aria-labelledby="command-palette-heading"
	>
		<header>
			<div>
				<p>Command Palette</p>
				<h2 id="command-palette-heading">Jump or act</h2>
			</div>
			<button type="button" onclick={close} aria-label="Close command palette">
				Close
			</button>
		</header>

		<input
			bind:this={inputElement}
			type="search"
			value={query}
			placeholder="Search commands and notes"
			aria-label="Command palette"
			oninput={handleInput}
			onkeydown={handleInputKeydown}
		/>

		{#if items.length}
			<ul class="command-palette-results" aria-label="Command palette results">
				{#each items as item (item.id)}
					<li>
						<button type="button" onclick={() => runItem(item)}>
							<strong>{item.title}</strong>
							<span>{item.detail}</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="command-palette-empty">No matching commands.</p>
		{/if}
	</div>
</div>

<style lang="scss">
.command-palette-backdrop {
	position: fixed;
	inset: 0;
	z-index: 30;
	display: grid;
	place-items: start center;
	padding: clamp(1rem, 8vh, 4rem) 1rem 1rem;
	background: oklch(0.16 0.035 245 / 0.42);
}

.command-palette-scrim {
	position: absolute;
	inset: 0;
	min-height: 0;
	padding: 0;
	background: transparent;
	border: 0;
	border-radius: 0;
}

.command-palette-scrim:hover:not(:disabled) {
	background: transparent;
}

.command-palette {
	position: relative;
	z-index: 1;
	display: grid;
	gap: 0.75rem;
	width: min(100%, 42rem);
	max-height: min(42rem, calc(100vh - 2rem));
	padding: 0.85rem;
	overflow: hidden;
	background: oklch(0.99 0.008 235);
	border: 1px solid oklch(0.76 0.04 235);
	border-radius: 0.45rem;
	box-shadow: 0 1.2rem 3rem oklch(0.16 0.04 245 / 0.24);
}

.command-palette header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
}

.command-palette p,
.command-palette h2 {
	margin: 0;
}

.command-palette header p {
	color: oklch(0.42 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
}

.command-palette h2 {
	font-size: 1.15rem;
	line-height: 1.1;
}

.command-palette input {
	width: 100%;
	min-height: 2.45rem;
	padding: 0.45rem 0.65rem;
	color: inherit;
	font: inherit;
	background: oklch(0.995 0.006 235);
	border: 1px solid oklch(0.72 0.045 235);
	border-radius: 0.35rem;
}

.command-palette input:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 2px;
}

.command-palette-results {
	display: grid;
	gap: 0.35rem;
	min-height: 0;
	margin: 0;
	padding: 0;
	overflow: auto;
	list-style: none;
}

.command-palette-results button {
	display: grid;
	gap: 0.12rem;
	width: 100%;
	padding: 0.55rem 0.65rem;
	text-align: left;
	background: oklch(0.955 0.018 235);
}

.command-palette-results button:hover:not(:disabled) {
	background: oklch(0.9 0.04 205);
}

.command-palette-results strong,
.command-palette-results span {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.command-palette-results strong {
	color: oklch(0.25 0.06 245);
}

.command-palette-results span,
.command-palette-empty {
	color: oklch(0.42 0.045 245);
	font-size: 0.82rem;
}

.command-palette-empty {
	margin: 0;
}
</style>
