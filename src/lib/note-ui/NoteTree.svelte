<script lang="ts">
import { tick } from 'svelte';
import type { NoteTreeFile, NoteTreeNode } from '../note-model/tree.js';
import type { InlineFileCreate } from '../local-vault/shared/types.js';

type Props = {
	activePath: string;
	createDisabled?: boolean;
	createDrawingNote?: (directoryPath: string) => void | Promise<void>;
	createNote?: (directoryPath: string) => void | Promise<void>;
	createNoteFromTemplate?: (directoryPath: string) => void | Promise<void>;
	inlineFileCreate?: InlineFileCreate | null;
	nodes: NoteTreeNode[];
	cancelInlineFileCreate?: () => void;
	onSelect?: (path: string) => void;
	rootLabel?: string;
	submitInlineFileCreate?: () => void;
	updateInlineFileCreateName?: (fileName: string) => void;
};

let {
	activePath,
	createDisabled = false,
	createDrawingNote,
	createNote,
	createNoteFromTemplate,
	inlineFileCreate = null,
	nodes,
	cancelInlineFileCreate,
	onSelect,
	rootLabel = 'Notes',
	submitInlineFileCreate,
	updateInlineFileCreateName
}: Props = $props();
let selectedDirectoryPaths = $state<string[]>([]);
let displayNodes = $derived(buildDisplayNodes(nodes, inlineFileCreate));
let activeDirectoryPaths = $derived(findActiveDirectoryPaths(displayNodes, activePath));
let inlineCreateDirectoryPaths = $derived(
	inlineFileCreate ? getDirectoryPathSegments(inlineFileCreate.directoryPath) : []
);
let columns = $derived(buildColumns(displayNodes, selectedDirectoryPaths, rootLabel));
let hasCreateActions = $derived(Boolean(createDrawingNote || createNote || createNoteFromTemplate));
let newMenuBounds = $state<{ left: number; top: number; width: number } | null>(null);
let openNewMenuColumnKey = $state('');
let openNewMenuColumn = $derived(columns.find((column) => column.key === openNewMenuColumnKey));
let noteColumnsElement: HTMLDivElement | undefined = $state();
let inlineCreateInputElement: HTMLInputElement | undefined = $state();
let collapsingColumnSpace = $state(0);
let collapseAnimating = $state(false);
let renderedColumnKeys: string[] = [];
let focusedInlineCreateId = '';
let pendingCollapseSpace = 0;
let collapseAnimationTimeout: number | undefined;

const columnCollapseDuration = 220;

type DisplayDirectory = {
	kind: 'directory';
	name: string;
	path: string;
	children: DisplayNode[];
};

type PendingFileNode = {
	id: string;
	kind: 'pending-file';
	name: string;
	path: string;
};

type DisplayNode = DisplayDirectory | NoteTreeFile | PendingFileNode;

type NoteColumn = {
	directoryPath: string;
	key: string;
	label: string;
	level: number;
	items: DisplayNode[];
};

$effect(() => {
	selectedDirectoryPaths = inlineFileCreate ? inlineCreateDirectoryPaths : activeDirectoryPaths;
});

$effect(() => {
	if (!inlineFileCreate) {
		focusedInlineCreateId = '';
		return;
	}

	if (!inlineCreateInputElement || focusedInlineCreateId === inlineFileCreate.id) {
		return;
	}

	focusedInlineCreateId = inlineFileCreate.id;
	void tick().then(() => {
		inlineCreateInputElement?.focus();
		inlineCreateInputElement?.select();
	});
});

$effect(() => {
	if (createDisabled) {
		closeNewMenu();
	}
});

$effect(() => {
	if (openNewMenuColumnKey && !openNewMenuColumn) {
		closeNewMenu();
	}
});

$effect.pre(() => {
	const node = noteColumnsElement;
	const nextKeys = columns.map((column) => column.key);

	if (!node) {
		return;
	}

	if (renderedColumnKeys.length <= nextKeys.length) {
		return;
	}

	const nextKeySet = new Set(nextKeys);
	const removedSpace = getRemovedColumnSpace(node, nextKeySet);

	if (removedSpace <= 0) {
		return;
	}

	if (collapseAnimationTimeout !== undefined) {
		window.clearTimeout(collapseAnimationTimeout);
		collapseAnimationTimeout = undefined;
	}

	pendingCollapseSpace = removedSpace;
	collapseAnimating = false;
	collapsingColumnSpace = removedSpace;
});

$effect(() => {
	const node = noteColumnsElement;
	const nextKeys = columns.map((column) => column.key);
	const previousKeys = renderedColumnKeys;
	const removedColumns = previousKeys.length > nextKeys.length;
	const collapseSpace = pendingCollapseSpace;

	renderedColumnKeys = nextKeys;

	if (!node || !removedColumns) {
		return;
	}

	void tick().then(() => {
		if (!areColumnKeysEqual(renderedColumnKeys, nextKeys)) {
			return;
		}

		animateCollapsedColumns(node, collapseSpace);
	});
});

function isActive(path: string) {
	return path === activePath || `${path}.md` === activePath;
}

function isSelected(path: string, level: number) {
	return selectedDirectoryPaths[level] === path;
}

function selectDirectory(node: DisplayDirectory, level: number) {
	selectedDirectoryPaths = [...selectedDirectoryPaths.slice(0, level), node.path];
}

function buildColumns(rootNodes: DisplayNode[], selectedPaths: string[], rootColumnLabel: string): NoteColumn[] {
	const nextColumns: NoteColumn[] = [
		{
			key: 'root',
			directoryPath: '',
			label: rootColumnLabel,
			level: 0,
			items: rootNodes
		}
	];
	let currentItems = rootNodes;

	for (const path of selectedPaths) {
		const selectedDirectory = currentItems.find(
			(item): item is DisplayDirectory => item.kind === 'directory' && item.path === path
		);

		if (!selectedDirectory) {
			break;
		}

		nextColumns.push({
			key: selectedDirectory.path,
			directoryPath: selectedDirectory.path,
			label: selectedDirectory.name,
			level: nextColumns.length,
			items: selectedDirectory.children
		});
		currentItems = selectedDirectory.children;
	}

	return nextColumns;
}

function buildDisplayNodes(rootNodes: NoteTreeNode[], pendingCreate: InlineFileCreate | null): DisplayNode[] {
	const nextNodes = cloneDisplayNodes(rootNodes);

	if (!pendingCreate) {
		return nextNodes;
	}

	const parent = ensureDisplayDirectory(nextNodes, pendingCreate.directoryPath);

	parent.push({
		id: pendingCreate.id,
		kind: 'pending-file',
		name: pendingCreate.fileName,
		path: `__pending-file-create__:${pendingCreate.id}`
	});
	sortDisplayNodes(nextNodes);

	return nextNodes;
}

function cloneDisplayNodes(rootNodes: NoteTreeNode[]): DisplayNode[] {
	return rootNodes.map((node) => {
		if (node.kind === 'file') {
			return node;
		}

		return {
			...node,
			children: cloneDisplayNodes(node.children)
		};
	});
}

function ensureDisplayDirectory(rootNodes: DisplayNode[], directoryPath: string) {
	if (!directoryPath) {
		return rootNodes;
	}

	let currentNodes = rootNodes;
	let currentPath = '';

	for (const segment of directoryPath.split('/').filter(Boolean)) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;

		let directory = currentNodes.find(
			(node): node is DisplayDirectory => node.kind === 'directory' && node.path === currentPath
		);

		if (!directory) {
			directory = {
				kind: 'directory',
				name: segment,
				path: currentPath,
				children: []
			};
			currentNodes.push(directory);
		}

		currentNodes = directory.children;
	}

	return currentNodes;
}

function sortDisplayNodes(rootNodes: DisplayNode[]) {
	rootNodes.sort((a, b) => {
		if (a.kind !== b.kind) {
			return a.kind === 'directory' ? -1 : b.kind === 'directory' ? 1 : 0;
		}

		return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
	});

	for (const node of rootNodes) {
		if (node.kind === 'directory') {
			sortDisplayNodes(node.children);
		}
	}
}

function findActiveDirectoryPaths(rootNodes: DisplayNode[], currentPath: string): string[] {
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

function getDirectoryPathSegments(directoryPath: string) {
	const paths: string[] = [];
	let currentPath = '';

	for (const segment of directoryPath.split('/').filter(Boolean)) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		paths.push(currentPath);
	}

	return paths;
}

function isPathInsideDirectory(path: string, directoryPath: string) {
	return path.startsWith(`${directoryPath}/`);
}

function toggleNewMenu(columnKey: string, event: MouseEvent) {
	if (openNewMenuColumnKey === columnKey) {
		closeNewMenu();
		return;
	}

	const triggerRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
	openNewMenuColumnKey = columnKey;
	newMenuBounds = getNewMenuBounds(triggerRect);
}

async function createInColumn(create: (directoryPath: string) => void | Promise<void>, directoryPath: string) {
	closeNewMenu();
	await create(directoryPath);
}

function handleInlineFileCreateInput(event: Event) {
	updateInlineFileCreateName?.((event.currentTarget as HTMLInputElement).value);
}

function handleInlineFileCreateKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		event.preventDefault();
		cancelInlineFileCreate?.();
	}
}

function handleInlineFileCreateSubmit(event: SubmitEvent) {
	event.preventDefault();
	submitInlineFileCreate?.();
}

function closeNewMenu() {
	openNewMenuColumnKey = '';
	newMenuBounds = null;
}

function getNewMenuBounds(triggerRect: DOMRect) {
	const gap = 4;
	const estimatedMenuHeight = 112;
	const columnsRect = noteColumnsElement?.getBoundingClientRect();
	const boundaryTop = Math.max(0, columnsRect?.top ?? 0);
	const boundaryBottom = Math.min(window.innerHeight, columnsRect?.bottom ?? window.innerHeight);
	const opensBelow = triggerRect.bottom + gap + estimatedMenuHeight <= boundaryBottom;
	const top = opensBelow
		? triggerRect.bottom + gap
		: Math.max(boundaryTop + gap, triggerRect.top - gap - estimatedMenuHeight);

	return {
		left: triggerRect.left,
		top,
		width: triggerRect.width
	};
}

function areColumnKeysEqual(left: string[], right: string[]) {
	return left.length === right.length && left.every((key, index) => key === right[index]);
}

function getRemovedColumnSpace(node: HTMLElement, nextKeySet: Set<string>) {
	const removedColumns = Array.from(node.querySelectorAll<HTMLElement>('.note-column')).filter(
		(column) => !nextKeySet.has(column.dataset.columnKey ?? '')
	);

	if (!removedColumns.length) {
		return 0;
	}

	const firstColumnRect = removedColumns[0].getBoundingClientRect();
	const lastColumnRect = removedColumns[removedColumns.length - 1].getBoundingClientRect();
	const removedWidth = lastColumnRect.right - firstColumnRect.left;

	return Math.max(0, removedWidth + getColumnGap(node));
}

function getColumnGap(node: HTMLElement) {
	const gap = Number.parseFloat(window.getComputedStyle(node).columnGap);

	return Number.isFinite(gap) ? gap : 0;
}

function getMaxScrollLeft(node: HTMLElement) {
	return Math.max(0, node.scrollWidth - node.clientWidth);
}

function animateCollapsedColumns(node: HTMLElement, reservedSpace: number) {
	const nextScrollLeft = Math.max(0, getMaxScrollLeft(node) - reservedSpace);

	node.scrollTo({
		left: nextScrollLeft,
		behavior: 'smooth'
	});

	window.requestAnimationFrame(() => {
		if (!node.isConnected) {
			return;
		}

		collapseAnimating = true;
		collapsingColumnSpace = 0;
		pendingCollapseSpace = 0;
		collapseAnimationTimeout = window.setTimeout(() => {
			collapseAnimating = false;
			collapseAnimationTimeout = undefined;
		}, columnCollapseDuration);
	});
}

function getHorizontalScrollTarget(columns: HTMLElement, node: HTMLElement, alignment: 'nearest' | 'end' = 'nearest') {
	const columnsRect = columns.getBoundingClientRect();
	const nodeRect = node.getBoundingClientRect();
	const inset = 8;

	if (alignment === 'end') {
		return Math.max(0, columns.scrollLeft + nodeRect.right - columnsRect.right + inset);
	}

	if (nodeRect.right > columnsRect.right - inset) {
		return Math.max(0, columns.scrollLeft + nodeRect.right - columnsRect.right + inset);
	}

	if (nodeRect.left < columnsRect.left + inset) {
		return Math.max(0, columns.scrollLeft + nodeRect.left - columnsRect.left - inset);
	}

	return columns.scrollLeft;
}

function scrollColumnIntoView(node: HTMLElement, active: boolean) {
	function scroll() {
		if (!active) {
			return;
		}

		requestAnimationFrame(() => {
			const columns = node.closest<HTMLElement>('.note-columns');

			if (!columns) {
				return;
			}

			columns.scrollTo({
				left: getHorizontalScrollTarget(columns, node, 'end'),
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
				left: getHorizontalScrollTarget(columns, node),
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

<div
	class:collapsing-columns={collapseAnimating}
	class="note-columns"
	aria-label="Directory columns"
	bind:this={noteColumnsElement}
	style:padding-right={`${collapsingColumnSpace}px`}
>
	{#each columns as column (column.key)}
		<section
			class="note-column"
			aria-labelledby={`note-column-${column.level}`}
			data-column-key={column.key}
			use:scrollColumnIntoView={column.level === columns.length - 1}
		>
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
					{:else if item.kind === 'pending-file' && inlineFileCreate}
						<li class="pending-file-create">
							<form onsubmit={handleInlineFileCreateSubmit}>
								<span class="file-mark" aria-hidden="true"></span>
								<input
									bind:this={inlineCreateInputElement}
									type="text"
									value={inlineFileCreate.fileName}
									aria-label={inlineFileCreate.inputLabel}
									required
									oninput={handleInlineFileCreateInput}
									onkeydown={handleInlineFileCreateKeydown}
								/>
								<span class="pending-file-create-extension" aria-hidden="true">
									{inlineFileCreate.extension}
								</span>
								<button type="submit" class="pending-file-create-submit">
									{inlineFileCreate.submitLabel}
								</button>
								<button
									type="button"
									class="pending-file-create-cancel"
									aria-label={`Cancel ${inlineFileCreate.title}`}
									onclick={cancelInlineFileCreate}
								>
									Cancel
								</button>
							</form>
						</li>
					{:else if item.kind === 'file' && onSelect}
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
					{:else if item.kind === 'file'}
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
			{#if hasCreateActions}
				<div class="note-column-footer">
					<div class:open={openNewMenuColumnKey === column.key} class="new-menu">
						<button
							type="button"
							class="new-menu-trigger"
							aria-expanded={openNewMenuColumnKey === column.key}
							aria-haspopup="menu"
							disabled={createDisabled}
							onclick={(event) => toggleNewMenu(column.key, event)}
						>
							<span>New</span>
							<span class="new-menu-chevron" aria-hidden="true"></span>
						</button>
					</div>
				</div>
			{/if}
		</section>
	{/each}
	{#if hasCreateActions && openNewMenuColumn && newMenuBounds}
		<div
			class="new-menu-items"
			role="menu"
			aria-label="New options"
			style:left={`${newMenuBounds.left}px`}
			style:top={`${newMenuBounds.top}px`}
			style:width={`${newMenuBounds.width}px`}
		>
			{#if createNote}
				<button
					type="button"
					role="menuitem"
					onclick={() => createInColumn(createNote, openNewMenuColumn.directoryPath)}
				>
					New Note
				</button>
			{/if}
			{#if createDrawingNote}
				<button
					type="button"
					role="menuitem"
					onclick={() => createInColumn(createDrawingNote, openNewMenuColumn.directoryPath)}
				>
					New Drawing
				</button>
			{/if}
			{#if createNoteFromTemplate}
				<button
					type="button"
					role="menuitem"
					onclick={() => createInColumn(createNoteFromTemplate, openNewMenuColumn.directoryPath)}
				>
					New From Template
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
.note-columns {
	--note-column-width: 14rem;

	display: grid;
	grid-auto-columns: var(--note-column-width);
	grid-auto-flow: column;
	grid-template-rows: minmax(0, 1fr);
	gap: 0.5rem;
	align-items: stretch;
	height: 100%;
	min-height: 0;
	padding-bottom: 0.35rem;
	overflow: auto;
	overscroll-behavior: contain;
}

.note-columns.collapsing-columns {
	transition: padding-right 220ms ease;
}

.note-column {
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	min-height: 0;
	min-width: 0;
	overflow: visible;
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
	flex: 1 0 auto;
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

.pending-file-create form {
	display: grid;
	grid-template-columns: 1rem minmax(0, 1fr) auto auto auto;
	align-items: center;
	gap: 0.25rem;
	min-height: 1.75rem;
	padding: 0.15rem 0.2rem 0.15rem 0.45rem;
	background: oklch(0.93 0.035 155);
	border: 1px solid oklch(0.72 0.06 155);
	border-radius: 0.35rem;
}

.pending-file-create input {
	min-width: 0;
	min-height: 1.45rem;
	padding: 0.1rem 0.25rem;
	color: oklch(0.22 0.055 245);
	font: inherit;
	background: oklch(0.995 0.006 235);
	border: 1px solid oklch(0.7 0.05 185);
	border-radius: 0.25rem;
}

.pending-file-create input:focus-visible {
	outline: 2px solid oklch(0.55 0.14 250);
	outline-offset: 1px;
}

.pending-file-create-extension {
	color: oklch(0.38 0.06 245);
	font-family: var(--font-mono);
	font-size: 0.72rem;
	font-weight: 700;
}

.pending-file-create button {
	display: block;
	width: auto;
	min-height: 1.45rem;
	padding: 0.1rem 0.28rem;
	font-family: var(--font-mono);
	font-size: 0.65rem;
	font-weight: 700;
	text-align: center;
	text-transform: uppercase;
	background: oklch(0.98 0.012 155);
	border: 1px solid oklch(0.72 0.06 155);
	border-radius: 0.25rem;
}

.pending-file-create button:hover:not(:disabled) {
	background: oklch(0.88 0.045 155);
}

.note-column-footer {
	flex: 0 0 auto;
	position: relative;
	margin-top: auto;
	padding: 0.45rem 0.45rem 0;
}

.new-menu {
	position: relative;
}

.new-menu-trigger {
	grid-template-columns: minmax(0, 1fr) auto;
	min-height: 1.85rem;
	color: oklch(0.29 0.07 180);
	font-family: var(--font-mono);
	font-size: 0.7rem;
	font-weight: 700;
	text-align: center;
	text-transform: uppercase;
	background: oklch(0.95 0.025 155);
	border: 1px solid oklch(0.74 0.06 155);
}

.new-menu-trigger:hover:not(:disabled),
.new-menu.open .new-menu-trigger {
	background: oklch(0.89 0.045 155);
}

.new-menu-trigger:disabled {
	cursor: not-allowed;
	opacity: 0.55;
}

.new-menu-chevron {
	position: relative;
	width: 0.75rem;
	height: 0.75rem;
}

.new-menu-chevron::before {
	position: absolute;
	top: 0.22rem;
	left: 0.18rem;
	width: 0.35rem;
	height: 0.35rem;
	border-right: 1.5px solid currentColor;
	border-bottom: 1.5px solid currentColor;
	content: '';
	transform: rotate(45deg);
	transform-origin: center;
}

.new-menu.open .new-menu-chevron::before {
	top: 0.34rem;
	transform: rotate(225deg);
}

.new-menu-items {
	position: fixed;
	z-index: 25;
	box-sizing: border-box;
	display: grid;
	gap: 0.18rem;
	padding: 0.25rem;
	background: oklch(0.99 0.008 235);
	border: 1px solid oklch(0.76 0.04 235);
	border-radius: 0.35rem;
	box-shadow: 0 0.7rem 1.6rem oklch(0.16 0.04 245 / 0.16);
}

.new-menu-items button {
	display: block;
	min-height: 1.75rem;
	padding: 0.25rem 0.45rem;
	color: oklch(0.27 0.045 245);
	font-size: 0.82rem;
	text-align: left;
	background: transparent;
	border: 0;
	border-radius: 0.25rem;
}

.new-menu-items button:hover {
	background: oklch(0.92 0.04 205);
}

@media (prefers-reduced-motion: reduce) {
	.note-columns.collapsing-columns {
		transition-duration: 1ms;
	}
}
</style>
