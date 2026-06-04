<script lang="ts">
import NoteTree from './NoteTree.svelte';
import type { NoteTreeNode } from '../note-model/tree.js';

type Props = {
	directoryCount: number;
	noteCount: number;
	noteTree: NoteTreeNode[];
	routeBase?: string;
	title?: string;
};

let { directoryCount, noteCount, noteTree, routeBase = '/notes', title = 'Notes' }: Props = $props();
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="note-layout">
	<aside aria-label={title}>
		<a class="sidebar-title" href={routeBase} data-sveltekit-preload-data="off">{title}</a>
		<nav aria-label="Directory structure" data-sveltekit-preload-data="off">
			<NoteTree nodes={noteTree} activePath="" />
		</nav>
	</aside>

	<aside-separator></aside-separator>

	<main>
		<section class="notes-overview" aria-labelledby="notes-title">
			<p>Vault Index</p>
			<h1 id="notes-title">{title}</h1>
			<div class="stats" aria-label="Vault totals">
				<span>{noteCount} notes</span>
				<span>{directoryCount} folders</span>
			</div>
		</section>
	</main>
</div>

<style>
.note-layout {
	--note-sidebar-width: 20rem;

	display: grid;
	grid-template-columns: var(--note-sidebar-width) 1px minmax(0, 1fr);
	min-height: 100vh;
}

aside {
	position: sticky;
	top: 0;

	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	gap: 1rem;
	height: 100vh;
	padding: 1.25rem 0.9rem 1.5rem;
	overflow: hidden;
}

aside-separator {
	width: 1px;
	background: oklch(0 0 0 / 0.1);
}

.sidebar-title {
	padding: 0 0.45rem;

	color: oklch(0.26 0.04 255);
	font-size: 1.2rem;
	font-weight: 700;
	text-decoration: none;
}

nav {
	min-height: 0;
	padding-right: 0.25rem;
	overflow: auto;
}

main {
	display: grid;
	align-items: start;
	width: min(100%, 78ch);
	padding: 2.5rem 4rem 4rem;
}

.notes-overview {
	display: grid;
	gap: 0.8rem;
	padding-top: 2rem;
}

.notes-overview p,
.notes-overview h1 {
	margin: 0;
}

.notes-overview p {
	color: oklch(0.45 0.1 180);
	font-family: var(--font-mono);
	font-size: 0.82rem;
	text-transform: uppercase;
}

.notes-overview h1 {
	color: oklch(0.22 0.05 255);
	font-size: clamp(2.4rem, 6vw, 4.8rem);
	line-height: 0.95;
}

.stats {
	display: flex;
	flex-wrap: wrap;
	gap: 0.6rem;
}

.stats span {
	padding: 0.45rem 0.65rem;

	color: oklch(0.26 0.05 255);
	font-family: var(--font-mono);
	font-size: 0.88rem;

	background: oklch(0.93 0.05 205);
	border: 1px solid oklch(0.72 0.06 215 / 0.6);
	border-radius: 0.4rem;
}

@media (max-width: 1100px) {
	.note-layout {
		grid-template-columns: 1fr;
	}

	aside {
		position: static;
		height: 45vh;
		border-right: none;
		border-bottom: 1px solid oklch(0.8 0.04 245);
	}

	main {
		padding: 1.5rem;
	}
}
</style>
