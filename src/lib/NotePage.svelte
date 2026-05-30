<script lang="ts">
import type { Component } from 'svelte';
import NoteTree from './NoteTree.svelte';
import type { BaseView } from './base.js';
import type { NoteTreeNode } from './note-tree.js';

type BaseData = {
	content: string;
	kind: 'base';
	noteTree: NoteTreeNode[];
	path: string;
	title: string;
	views: BaseView[];
};

type CompiledData = {
	component?: Component;
	kind: 'compiled';
	noteTree: NoteTreeNode[];
	path: string;
	title: string;
};

type RawData = {
	content: string;
	kind: 'raw';
	noteTree: NoteTreeNode[];
	path: string;
	title: string;
};

type Props = {
	data: BaseData | CompiledData | RawData;
	routeBase?: string;
};

let { data, routeBase = '/notes' }: Props = $props();
let Note = $derived(data.kind === 'compiled' ? data.component : null);
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<div class="note-layout">
	<aside aria-label="Notes">
		<a class="sidebar-title" href={routeBase} data-sveltekit-preload-data="off">Notes</a>
		<nav aria-label="Directory structure" data-sveltekit-preload-data="off">
			<NoteTree nodes={data.noteTree} activePath={data.path} />
		</nav>
	</aside>

	<aside-separator></aside-separator>

	<main>
		{#if data.kind === 'compiled' && Note}
			<Note />
		{:else if data.kind === 'base'}
			<article class="base-display">
				<header>
					<p>.base</p>
					<h1>{data.title}</h1>
				</header>

				{#if data.views.length}
					<div class="base-views" aria-label="Base views">
						{#each data.views as view}
							<section class="base-view">
								<h2>{view.name}</h2>
								<span>{view.type}</span>
							</section>
						{/each}
					</div>
				{/if}

				<details class="base-source" open>
					<summary>Source</summary>
					<pre>{data.content}</pre>
				</details>
			</article>
		{:else if data.kind === 'raw'}
			<article class="raw-note">
				<h1>{data.title}</h1>
				<pre>{data.content}</pre>
			</article>
		{/if}
	</main>
</div>

<style>
.note-layout {
	display: grid;
	grid-template-columns: minmax(15rem, 22rem) 1px minmax(0, 1fr);
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
	width: min(100%, 78ch);
	padding: 2.5rem 4rem 4rem;

	line-height: 1.25;
}

.raw-note {
	display: grid;
	gap: 1rem;
}

.base-display {
	display: grid;
	gap: 1.2rem;
}

.base-display header {
	display: grid;
	gap: 0.35rem;
}

.base-display p,
.base-display h1,
.base-view h2 {
	margin: 0;
}

.base-display p {
	color: oklch(0.45 0.1 180);
	font-family: var(--font-mono);
	font-size: 0.82rem;
	text-transform: uppercase;
}

.base-display h1 {
	color: oklch(0.22 0.05 255);
	font-size: 2rem;
	line-height: 1;
}

.base-views {
	display: grid;
	gap: 0.5rem;
}

.base-view {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.75rem;
	padding: 0.65rem 0.8rem;

	border: 1px solid oklch(0.74 0.06 215 / 0.65);
	border-radius: 0.45rem;
	background: oklch(0.95 0.03 210);
}

.base-view h2 {
	overflow: hidden;

	color: oklch(0.24 0.05 255);
	font-size: 1rem;
	line-height: 1.1;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.base-view span {
	color: oklch(0.36 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.78rem;
	text-transform: uppercase;
}

.base-source {
	display: grid;
	gap: 0.6rem;
}

.base-source summary {
	width: fit-content;

	color: oklch(0.3 0.05 255);
	font-weight: 700;
	cursor: pointer;
}

.raw-note h1 {
	margin: 0;

	color: oklch(0.22 0.05 255);
	font-size: 2rem;
	line-height: 1;
}

.raw-note pre,
.base-source pre {
	max-width: 100%;
	margin: 0;
	overflow: auto;

	white-space: pre-wrap;
}

@media (max-width: 760px) {
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
