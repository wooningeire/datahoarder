<script lang="ts">
import type { NoteTreeDirectory, NoteTreeNode } from './note-tree.js';

type Props = {
	activePath: string;
	nodes: NoteTreeNode[];
	onSelect?: (path: string) => void;
	rootLabel?: string;
};

let { activePath, nodes, onSelect, rootLabel = 'Notes' }: Props = $props();
let selectedDirectoryPaths = $state<string[]>([]);
let activeDirectoryPaths = $derived(findActiveDirectoryPaths(nodes, activePath));
let columns = $derived(buildColumns(nodes, selectedDirectoryPaths, rootLabel));

type NoteColumn = {
	key: string;
	label: string;
	level: number;
	items: NoteTreeNode[];
};

$effect(() => {
	selectedDirectoryPaths = activeDirectoryPaths;
});

function isActive(path: string) {
	return path === activePath || `${path}.md` === activePath;
}

function isSelected(path: string, level: number) {
	return selectedDirectoryPaths[level] === path;
}

function selectDirectory(node: NoteTreeDirectory, level: number) {
	selectedDirectoryPaths = [...selectedDirectoryPaths.slice(0, level), node.path];
}

function buildColumns(rootNodes: NoteTreeNode[], selectedPaths: string[], rootColumnLabel: string): NoteColumn[] {
	const nextColumns: NoteColumn[] = [
		{
			key: 'root',
			label: rootColumnLabel,
			level: 0,
			items: rootNodes
		}
	];
	let currentItems = rootNodes;

	for (const path of selectedPaths) {
		const selectedDirectory = currentItems.find(
			(item): item is NoteTreeDirectory => item.kind === 'directory' && item.path === path
		);

		if (!selectedDirectory) {
			break;
		}

		nextColumns.push({
			key: selectedDirectory.path,
			label: selectedDirectory.name,
			level: nextColumns.length,
			items: selectedDirectory.children
		});
		currentItems = selectedDirectory.children;
	}

	return nextColumns;
}

function findActiveDirectoryPaths(rootNodes: NoteTreeNode[], currentPath: string): string[] {
	if (!currentPath) {
		return [];
	}

	for (const node of rootNodes) {
		if (node.kind !== 'directory' || !isPathInsideDirectory(currentPath, node.path)) {
			continue;
		}

		return [node.path, ...findActiveDirectoryPaths(node.children, currentPath)];
	}

	return [];
}

function isPathInsideDirectory(path: string, directoryPath: string) {
	return path.startsWith(`${directoryPath}/`);
}

function scrollCurrentNote(node: HTMLElement, active: boolean) {
	function scroll() {
		if (!active) {
			return;
		}

		requestAnimationFrame(() => {
			const columns = node.closest<HTMLElement>('.note-columns');

			if (!columns) {
				return;
			}

			const columnsRect = columns.getBoundingClientRect();
			const nodeRect = node.getBoundingClientRect();
			const nextScrollTop =
				columns.scrollTop +
				nodeRect.top +
				nodeRect.height / 2 -
				(columnsRect.top + columns.clientHeight / 2);

			columns.scrollTo({
				top: Math.max(0, nextScrollTop),
				behavior: 'smooth'
			});
		});
	}

	scroll();

	return {
		update(nextActive: boolean) {
			active = nextActive;
			scroll();
		}
	};
}
</script>

<div class="note-columns" aria-label="Directory columns">
	{#each columns as column (column.key)}
		<section class="note-column" aria-labelledby={`note-column-${column.level}`}>
			<h2 id={`note-column-${column.level}`}>{column.label}</h2>
			<ul>
				{#each column.items as item (item.path)}
					{#if item.kind === 'directory'}
						<li>
							<button
								type="button"
								class:selected={isSelected(item.path, column.level)}
								aria-pressed={isSelected(item.path, column.level)}
								onclick={() => selectDirectory(item, column.level)}
							>
								<span class="directory-mark" aria-hidden="true"></span>
								<span class="name">{item.name}</span>
								<span class="chevron" aria-hidden="true"></span>
							</button>
						</li>
					{:else if onSelect}
						<li class:active={isActive(item.path)}>
							<button
								type="button"
								class="file-button"
								aria-current={isActive(item.path) ? 'page' : undefined}
								use:scrollCurrentNote={isActive(item.path)}
								onclick={() => onSelect?.(item.path)}
							>
								<span class="file-mark" aria-hidden="true"></span>
								<span class="name">{item.name}</span>
							</button>
						</li>
					{:else}
						<li class:active={isActive(item.path)}>
							<a
								href={item.href}
								aria-current={isActive(item.path) ? 'page' : undefined}
								use:scrollCurrentNote={isActive(item.path)}
							>
								<span class="file-mark" aria-hidden="true"></span>
								<span class="name">{item.name}</span>
							</a>
						</li>
					{/if}
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
.note-columns {
	--note-column-width: 14rem;

	display: grid;
	grid-auto-columns: var(--note-column-width);
	grid-auto-flow: column;
	gap: 0.5rem;
	align-items: stretch;
	height: 100%;
	min-height: 0;
	padding-bottom: 0.35rem;
	overflow: auto;
	overscroll-behavior: contain;
}

.note-column {
	min-height: 100%;
	min-width: 0;
	padding-right: 0.5rem;
	border-right: 1px solid oklch(0.78 0.04 250 / 0.55);
}

.note-column:last-child {
	border-right-color: transparent;
}

h2 {
	margin: 0 0 0.45rem;
	padding: 0 0.45rem;
	overflow: hidden;
	color: oklch(0.42 0.06 255);
	font-family: var(--font-mono);
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0;
	line-height: 1.2;
	text-overflow: ellipsis;
	text-transform: uppercase;
	white-space: nowrap;
}

ul {
	display: grid;
	align-content: start;
	gap: 0.125rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

li {
	min-width: 0;
}

button,
a {
	display: grid;
	grid-template-columns: 1rem minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.35rem;
	width: 100%;
	min-height: 1.75rem;
	padding: 0.15rem 0.45rem;
	color: oklch(0.28 0.04 255);
	font: inherit;
	text-align: left;
	text-decoration: none;
	background: transparent;
	border: 0;
	border-radius: 0.35rem;
}

button {
	cursor: pointer;
	user-select: none;
}

a,
.file-button {
	grid-template-columns: 1rem minmax(0, 1fr);
}

button:hover,
a:hover {
	background: oklch(0.92 0.04 245);
}

a:focus-visible,
button:focus-visible {
	outline: 2px solid oklch(0.55 0.14 250);
	outline-offset: 2px;
}

.name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.directory-mark,
.chevron,
.file-mark {
	position: relative;

	width: 1rem;
	height: 1rem;
}

.directory-mark::before {
	position: absolute;
	top: 0.32rem;
	left: 0.14rem;

	width: 0.7rem;
	height: 0.45rem;

	background: oklch(0.72 0.08 85);
	border-radius: 0.12rem;

	content: '';
}

.directory-mark::after {
	position: absolute;
	top: 0.22rem;
	left: 0.18rem;

	width: 0.38rem;
	height: 0.18rem;

	background: oklch(0.78 0.09 85);
	border-radius: 0.12rem 0.12rem 0 0;

	content: '';
}

.chevron::before {
	position: absolute;
	top: 0.32rem;
	right: 0.25rem;

	width: 0.4rem;
	height: 0.4rem;

	border-right: 1.5px solid currentColor;
	border-bottom: 1.5px solid currentColor;

	transform: rotate(-45deg);
	transform-origin: center;

	content: '';
}

.file-mark::before {
	position: absolute;
	top: 0.32rem;
	left: 0.32rem;

	width: 0.35rem;
	height: 0.35rem;

	background: oklch(0.58 0.1 180);
	border-radius: 999px;

	content: '';
}

.selected {
	color: oklch(0.22 0.08 255);
	font-weight: 700;
	background: oklch(0.9 0.05 225);
}

.active > a,
.active > button {
	color: oklch(0.22 0.08 255);
	font-weight: 700;

	background: oklch(0.86 0.06 205);
}
</style>
