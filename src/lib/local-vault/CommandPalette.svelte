<script lang="ts">
import { onMount } from 'svelte';
import type { CommandPaletteItem } from './types.js';

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
