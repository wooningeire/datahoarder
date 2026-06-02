<script lang="ts">
import * as monaco from 'monaco-editor';
import { onMount, tick } from 'svelte';
import { getBaseViews } from './base.js';
import {
	filterCollectionRecords,
	formatCollectionRecordValue,
	isDatahoarderCollectionFile,
	resolveDatahoarderCollection,
	sortCollectionRecords,
	type ResolvedCollection
} from './collection.js';
import {
	buildLocalVaultTree,
	canUseFileSystemAccess,
	getStoredVaultHandle,
	isEditableTextFile,
	readLocalFile,
	readLocalVault,
	storeVaultHandle,
	verifyPermission,
	writeLocalFile,
	type DatahoarderPermissionMode,
	type LocalDirectoryHandle,
	type LocalVaultFile
} from './local-vault.js';
import { renderPortableMarkdown } from './markdown-render.js';
import NoteTree from './NoteTree.svelte';
import { getNoteTitle } from './paths.js';
import { getRawPreview, isExcalidrawNote } from './raw-notes.js';
import { buildLocalVaultIndex, createEmptyVaultIndex, type VaultIndex, type VaultRecord } from './vault-index.js';

type MathJaxApi = {
	startup?: {
		promise?: Promise<void>;
	};
	typesetPromise?: (elements?: Element[]) => Promise<void>;
};

type DatahoarderWindow = Window & {
	MathJax?: MathJaxApi;
	showDirectoryPicker?: (options?: { mode?: DatahoarderPermissionMode }) => Promise<LocalDirectoryHandle>;
};

type MonacoEditor = monaco.editor.IStandaloneCodeEditor;
type MonacoEnvironmentGlobal = typeof globalThis & {
	MonacoEnvironment?: {
		getWorker?: (_workerId: string, label: string) => Worker;
	};
};

let supported = $state(false);
let vaultHandle = $state<LocalDirectoryHandle | null>(null);
let files = $state<LocalVaultFile[]>([]);
let vaultIndex = $state<VaultIndex>(createEmptyVaultIndex());
let selectedPath = $state('');
let selectedContent = $state('');
let savedContent = $state('');
let status = $state('Choose a local folder to begin.');
let loading = $state(false);
let saving = $state(false);
let errorMessage = $state('');
let collectionFilter = $state('');
let collectionSortColumn = $state('title');
let collectionSortDirection = $state<'asc' | 'desc'>('asc');
let editorHost: HTMLDivElement | undefined = $state();
let monacoState = $state<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
let monacoEditor: MonacoEditor | null = null;
let monacoSubscription: { dispose: () => void } | null = null;
let mathTypesetToken = 0;

let selectedFile = $derived(
	files.find((file) => file.path === selectedPath) ??
		files.find((file) => file.routePath === selectedPath) ??
		null
);
let fileTree = $derived(buildLocalVaultTree(files));
let noteCount = $derived(files.filter((file) => file.extension === '.md' || file.extension === '.svx').length);
let dirty = $derived(selectedContent !== savedContent);
let baseViews = $derived(selectedFile?.extension === '.base' ? getBaseViews(selectedContent) : []);
let selectedCollection = $derived.by<ResolvedCollection | null>(() => {
	if (!selectedFile || !isDatahoarderCollectionFile(selectedFile.path)) {
		return null;
	}

	return resolveDatahoarderCollection(selectedContent, selectedFile.path, vaultIndex);
});
let collectionRecords = $derived.by(() => {
	if (!selectedCollection) {
		return [];
	}

	const filteredRecords = filterCollectionRecords(
		selectedCollection.records,
		collectionFilter,
		selectedCollection.columns
	);
	const sortColumn = selectedCollection.columns.includes(collectionSortColumn)
		? collectionSortColumn
		: (selectedCollection.columns[0] ?? 'title');

	return sortCollectionRecords(filteredRecords, sortColumn, collectionSortDirection);
});
let previewHtml = $derived.by(() => {
	if (!selectedFile) {
		return '';
	}

	if (selectedFile.extension === '.svelte') {
		return '';
	}

	if (selectedFile.extension === '.md' && isExcalidrawNote(selectedContent)) {
		return `<pre>${escapeHtml(getRawPreview(selectedContent))}</pre>`;
	}

	if (selectedFile.extension === '.md' || selectedFile.extension === '.svx') {
		const notePaths = files
			.filter((file) => file.extension === '.md' || file.extension === '.svx' || file.extension === '.svelte')
			.map((file) => file.routePath);

		return renderPortableMarkdown(selectedContent, {
			currentPath: selectedFile.routePath,
			notePaths,
			resolveNoteHref: getLocalNoteHref
		});
	}

	return '';
});

$effect(() => {
	if (previewHtml) {
		queuePreviewMathTypeset();
	}
});

$effect(() => {
	if (!selectedCollection) {
		return;
	}

	if (!selectedCollection.columns.includes(collectionSortColumn)) {
		collectionSortColumn = selectedCollection.columns[0] ?? 'title';
	}
});

$effect(() => {
	if (editorHost && monacoState === 'idle') {
		void initializeMonaco();
	}
});

onMount(() => {
	supported = canUseFileSystemAccess();

	if (!supported) {
		status = 'File System Access is unavailable in this browser. Use Chrome or Edge over HTTPS.';
		return;
	}

	void restoreVaultHandle();

	return () => {
		monacoSubscription?.dispose();
		monacoEditor?.dispose();
	};
});

async function restoreVaultHandle() {
	try {
		const storedHandle = await getStoredVaultHandle();

		if (!storedHandle) {
			return;
		}

		vaultHandle = storedHandle;

		if (await verifyPermission(storedHandle, 'readwrite')) {
			await loadVault(storedHandle, 'Restored local folder access.');
		} else {
			status = 'Folder remembered. Reopen access to refresh the vault.';
		}
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function chooseFolder() {
	const picker = (window as unknown as DatahoarderWindow).showDirectoryPicker;

	if (!picker) {
		return;
	}

	try {
		errorMessage = '';
		const handle = await picker({ mode: 'readwrite' });

		if (!(await verifyPermission(handle, 'readwrite', true))) {
			status = 'Folder permission was not granted.';
			return;
		}

		vaultHandle = handle;
		await storeVaultHandle(handle);
		await loadVault(handle, 'Loaded local vault.');
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function reopenStoredFolder() {
	if (!vaultHandle) {
		await restoreVaultHandle();
		return;
	}

	if (!(await verifyPermission(vaultHandle, 'readwrite', true))) {
		status = 'Folder permission was not granted.';
		return;
	}

	await loadVault(vaultHandle, 'Reopened local vault.');
}

async function refreshVault() {
	if (!vaultHandle) {
		return;
	}

	await loadVault(vaultHandle, 'Refreshed local vault.');
}

async function loadVault(handle: LocalDirectoryHandle, nextStatus: string) {
	loading = true;
	errorMessage = '';

	try {
		const nextFiles = await readLocalVault(handle);
		const nextVaultIndex = await buildLocalVaultIndex(nextFiles);

		files = nextFiles;
		vaultIndex = nextVaultIndex;
		status = `${nextStatus} ${files.length} editable files indexed, ${vaultIndex.records.length} notes parsed.`;

		if (!selectedFile && files.length) {
			await selectFile(files[0].routePath);
		}
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		loading = false;
	}
}

async function selectFile(filePath: string) {
	if (dirty && !window.confirm('Discard unsaved edits?')) {
		return;
	}

	const nextFile =
		files.find((file) => file.path === filePath) ?? files.find((file) => file.routePath === filePath);

	if (!nextFile || !isEditableTextFile(nextFile.path)) {
		return;
	}

	try {
		errorMessage = '';
		selectedPath = nextFile.path;
		const content = await readLocalFile(nextFile);
		selectedContent = content;
		savedContent = content;
		status = `Editing ${nextFile.path}`;
		syncMonacoContent(content);
		updateMonacoLanguage(nextFile);
	} catch (error) {
		errorMessage = getErrorMessage(error);
	}
}

async function saveSelectedFile() {
	if (!selectedFile || !dirty) {
		return;
	}

	saving = true;
	errorMessage = '';

	try {
		await writeLocalFile(selectedFile, selectedContent);
		savedContent = selectedContent;
		vaultIndex = await buildLocalVaultIndex(files);
		status = `Saved ${selectedFile.path}`;
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

function getLocalNoteHref(notePath: string, heading: string) {
	const params = new URLSearchParams({ note: notePath });

	if (heading) {
		params.set('heading', heading);
	}

	return `#${params.toString()}`;
}

function handlePreviewClick(event: MouseEvent) {
	if (
		event.defaultPrevented ||
		event.button !== 0 ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey
	) {
		return;
	}

	const target = event.target instanceof Element ? event.target : null;
	const anchor = target?.closest<HTMLAnchorElement>('a[data-note-path]');
	const notePath = anchor?.dataset.notePath;

	if (!notePath) {
		return;
	}

	event.preventDefault();

	if (!files.some((file) => file.routePath === notePath || file.path === notePath)) {
		status = `Linked note not found: ${notePath}`;
		return;
	}

	void selectFile(notePath);
}

function previewLinkNavigation(node: HTMLElement) {
	node.addEventListener('click', handlePreviewClick);

	return {
		destroy() {
			node.removeEventListener('click', handlePreviewClick);
		}
	};
}

function sortCollectionBy(column: string) {
	if (collectionSortColumn === column) {
		collectionSortDirection = collectionSortDirection === 'asc' ? 'desc' : 'asc';
		return;
	}

	collectionSortColumn = column;
	collectionSortDirection = 'asc';
}

function getCollectionSortIndicator(column: string) {
	if (collectionSortColumn !== column) {
		return '';
	}

	return collectionSortDirection;
}

function getCollectionColumnLabel(column: string) {
	return column.replace(/[-_]+/gu, ' ').replace(/\b\w/gu, (character) => character.toUpperCase());
}

function openCollectionRecord(record: VaultRecord) {
	void selectFile(record.routePath);
}

async function initializeMonaco() {
	if (monacoState === 'loading' || monacoState === 'ready') {
		return;
	}

	monacoState = 'loading';

	try {
		if (!editorHost) {
			throw new Error('Editor host was not ready.');
		}

		configureMonacoWorkers();

		if (!editorHost) {
			throw new Error('Editor host was not ready.');
		}

		monacoEditor = monaco.editor.create(editorHost, {
			automaticLayout: true,
			fontFamily: 'var(--font-mono)',
			fontSize: 14,
			language: getEditorLanguage(selectedFile),
			lineNumbersMinChars: 3,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			tabSize: 2,
			value: selectedContent,
			wordWrap: 'on'
		});
		monacoSubscription = monacoEditor.onDidChangeModelContent(() => {
			const nextValue = monacoEditor?.getValue() ?? '';

			if (nextValue !== selectedContent) {
				selectedContent = nextValue;
			}
		});
		monacoState = 'ready';
		await tick();
		monacoEditor.layout();
		updateMonacoLanguage(selectedFile);
	} catch {
		monacoState = 'fallback';
	}
}

function configureMonacoWorkers() {
	const scope = globalThis as MonacoEnvironmentGlobal;

	if (scope.MonacoEnvironment?.getWorker) {
		return;
	}

	scope.MonacoEnvironment = {
		...scope.MonacoEnvironment,
		getWorker(_workerId: string, label: string) {
			switch (label) {
				case 'css':
				case 'less':
				case 'scss':
					return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), {
						type: 'module'
					});
				case 'handlebars':
				case 'html':
				case 'razor':
					return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), {
						type: 'module'
					});
				case 'javascript':
				case 'typescript':
					return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), {
						type: 'module'
					});
				case 'json':
					return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), {
						type: 'module'
					});
				default:
					return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
						type: 'module'
					});
			}
		}
	};
}

function syncMonacoContent(content: string) {
	if (!monacoEditor || monacoEditor.getValue() === content) {
		return;
	}

	monacoEditor.setValue(content);
}

function updateMonacoLanguage(file: LocalVaultFile | null) {
	const model = monacoEditor?.getModel();

	if (!model) {
		return;
	}

	monaco.editor.setModelLanguage(model, getEditorLanguage(file));
}

function queuePreviewMathTypeset() {
	const token = ++mathTypesetToken;

	void tick().then(async () => {
		for (let attempt = 0; attempt < 8; attempt += 1) {
			if (token !== mathTypesetToken) {
				return;
			}

			const mathJax = (window as unknown as DatahoarderWindow).MathJax;

			if (mathJax?.typesetPromise) {
				await mathJax.startup?.promise;
				await mathJax.typesetPromise([document.body]);
				return;
			}

			await new Promise((resolve) => window.setTimeout(resolve, 250));
		}
	});
}


function getEditorLanguage(file: LocalVaultFile | null) {
	if (!file) {
		return 'markdown';
	}

	switch (file.extension) {
		case '.base':
		case '.yaml':
		case '.yml':
			return 'yaml';
		case '.css':
		case '.scss':
			return 'css';
		case '.html':
			return 'html';
		case '.js':
			return 'javascript';
		case '.json':
			return 'json';
		case '.svelte':
			return 'html';
		case '.ts':
			return 'typescript';
		default:
			return 'markdown';
	}
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Unknown error';
}

function escapeHtml(text: string) {
	return text.replace(/[&<>"']/gu, (character) => {
		switch (character) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			case "'":
				return '&#39;';
			default:
				return character;
		}
	});
}
</script>

<svelte:head>
	<title>Datahoarder</title>
</svelte:head>

<main class="datahoarder-shell">
	<header class="topbar">
		<div>
			<p>Datahoarder</p>
			<h1>Local Vault</h1>
		</div>

		<div class="actions">
			<button type="button" onclick={chooseFolder} disabled={!supported || loading}>
				Open Folder
			</button>
			<button type="button" onclick={reopenStoredFolder} disabled={!supported || loading || !vaultHandle}>
				Reopen
			</button>
			<button type="button" onclick={refreshVault} disabled={!supported || loading || !vaultHandle}>
				Refresh
			</button>
			<button type="button" class="primary" onclick={saveSelectedFile} disabled={!dirty || saving}>
				{saving ? 'Saving' : 'Save'}
			</button>
		</div>
	</header>

	<section class="status-row" aria-live="polite">
		<span>{status}</span>
		{#if monacoState === 'fallback'}
			<span>Textarea fallback active.</span>
		{:else if monacoState === 'loading'}
			<span>Loading Monaco editor.</span>
		{/if}
		{#if dirty}
			<strong>Unsaved</strong>
		{/if}
	</section>

	{#if errorMessage}
		<p class="error-message">{errorMessage}</p>
	{/if}

	<div class="workspace">
		<aside class="sidebar" aria-label="Local vault">
			<div class="sidebar-summary">
				<span>{files.length} files</span>
				<span>{noteCount} notes</span>
			</div>

			{#if fileTree.length}
				<NoteTree nodes={fileTree} activePath={selectedPath} onSelect={selectFile} rootLabel="Files" />
			{:else}
				<p class="empty-state">No editable text files are indexed yet.</p>
			{/if}
		</aside>

		<section class="editor-pane" aria-label="Editor">
			{#if selectedFile}
				<header class="file-header">
					<div>
						<p>{selectedFile.extension || 'text'}</p>
						<h2>{getNoteTitle(selectedFile.path)}</h2>
					</div>
					<span>{selectedFile.path}</span>
				</header>

				<div class:hidden={monacoState !== 'ready'} class="monaco-host" bind:this={editorHost}></div>
				{#if monacoState !== 'ready'}
					<textarea bind:value={selectedContent} spellcheck="false" aria-label="File source"></textarea>
				{/if}
			{:else}
				<div class="empty-editor">
					<h2>No File Selected</h2>
					<p>Open a folder, then choose a file.</p>
				</div>
			{/if}
		</section>

		<section class="preview-pane" aria-label="Preview">
			{#if selectedCollection}
				<article class="collection-preview">
					<header>
						<p>{selectedCollection.view.type} collection</p>
						<h2>{selectedCollection.definition.name}</h2>
					</header>

					<div class="collection-toolbar">
						<span>
							{collectionRecords.length} of {selectedCollection.records.length} records
						</span>
						<input
							type="search"
							bind:value={collectionFilter}
							placeholder="Filter records"
							aria-label="Filter collection records"
						/>
					</div>

					{#if collectionRecords.length}
						<div class="collection-table-wrap">
							<table>
								<thead>
									<tr>
										{#each selectedCollection.columns as column}
											<th>
												<button
													type="button"
													class="table-sort"
													onclick={() => sortCollectionBy(column)}
													aria-label={`Sort by ${getCollectionColumnLabel(column)}`}
												>
													<span>{getCollectionColumnLabel(column)}</span>
													<small>{getCollectionSortIndicator(column)}</small>
												</button>
											</th>
										{/each}
									</tr>
								</thead>
								<tbody>
									{#each collectionRecords as record}
										<tr>
											{#each selectedCollection.columns as column}
												<td>
													{#if column === 'title'}
														<button
															type="button"
															class="record-link"
															onclick={() => openCollectionRecord(record)}
														>
															{formatCollectionRecordValue(record, column)}
														</button>
													{:else}
														{formatCollectionRecordValue(record, column)}
													{/if}
												</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div class="preview-empty collection-empty">
							<h2>No Records</h2>
							<p>Adjust the collection source or clear the filter.</p>
						</div>
					{/if}

					<details class="collection-source">
						<summary>Source</summary>
						<pre>{selectedContent}</pre>
					</details>
				</article>
			{:else if selectedFile?.extension === '.base'}
				<header>
					<p>.base</p>
					<h2>{getNoteTitle(selectedFile.path)}</h2>
				</header>

				{#if baseViews.length}
					<div class="base-views">
						{#each baseViews as view}
							<section>
								<h3>{view.name}</h3>
								<span>{view.type}</span>
							</section>
						{/each}
					</div>
				{/if}

				<pre>{selectedContent}</pre>
			{:else if previewHtml}
				<article class="markdown-preview" use:previewLinkNavigation>
					{@html previewHtml}
				</article>
			{:else if selectedFile}
				<div class="preview-empty">
					<h2>Source Only</h2>
					<p>Hosted preview renders portable markdown and base files. Custom Svelte execution stays in the notes project.</p>
				</div>
			{:else}
				<div class="preview-empty">
					<h2>Preview</h2>
					<p>Markdown and base previews appear here.</p>
				</div>
			{/if}
		</section>
	</div>
</main>

<style>
:global(body) {
	margin: 0;
	background: oklch(0.97 0.015 235);
}

.datahoarder-shell {
	display: grid;
	grid-template-rows: auto auto auto minmax(0, 1fr);
	height: 100vh;
	height: 100dvh;
	min-height: 0;
	overflow: hidden;
	color: oklch(0.22 0.035 245);
}

.topbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.85rem 1rem;
	border-bottom: 1px solid oklch(0.78 0.03 235);
	background: oklch(0.99 0.01 235);
}

.topbar p,
.topbar h1,
.file-header p,
.file-header h2,
.preview-pane h2,
.preview-pane h3,
.preview-pane p {
	margin: 0;
}

.topbar p,
.file-header p,
.preview-pane header p {
	color: oklch(0.42 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
}

.topbar h1 {
	font-size: 1.2rem;
	line-height: 1.1;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	justify-content: flex-end;
}

button {
	min-height: 2rem;
	padding: 0.25rem 0.65rem;
	color: inherit;
	font: inherit;
	background: oklch(0.94 0.025 235);
	border: 1px solid oklch(0.73 0.04 235);
	border-radius: 0.35rem;
	cursor: pointer;
}

button:hover:not(:disabled) {
	background: oklch(0.9 0.04 220);
}

button:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 2px;
}

button:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}

.primary {
	color: white;
	background: oklch(0.48 0.13 190);
	border-color: oklch(0.42 0.12 190);
}

.status-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.55rem;
	align-items: center;
	min-height: 2.15rem;
	padding: 0.35rem 1rem;
	color: oklch(0.34 0.04 245);
	font-family: var(--font-mono);
	font-size: 0.78rem;
	border-bottom: 1px solid oklch(0.82 0.025 235);
}

.status-row strong {
	color: oklch(0.47 0.14 55);
}

.error-message {
	margin: 0;
	padding: 0.55rem 1rem;
	color: oklch(0.34 0.13 30);
	background: oklch(0.94 0.07 45);
	border-bottom: 1px solid oklch(0.8 0.08 45);
}

.workspace {
	--vault-sidebar-width: 32rem;

	display: grid;
	grid-row: 4;
	grid-template-columns: var(--vault-sidebar-width) minmax(20rem, 1fr) minmax(18rem, 0.85fr);
	min-height: 0;
	overflow: hidden;
}

.sidebar,
.editor-pane,
.preview-pane {
	min-width: 0;
	min-height: 0;
	overflow: hidden;
	border-right: 1px solid oklch(0.8 0.025 235);
}

.sidebar {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	gap: 0.75rem;
	padding: 0.85rem;
	background: oklch(0.98 0.012 235);
}

.sidebar-summary {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.sidebar-summary span {
	padding: 0.3rem 0.45rem;
	font-family: var(--font-mono);
	font-size: 0.74rem;
	background: oklch(0.92 0.035 205);
	border: 1px solid oklch(0.75 0.045 210);
	border-radius: 0.35rem;
}

.empty-state,
.preview-empty p,
.empty-editor p {
	color: oklch(0.42 0.035 245);
}

.editor-pane {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	background: oklch(0.985 0.006 235);
}

.file-header {
	display: flex;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.75rem 0.9rem;
	border-bottom: 1px solid oklch(0.82 0.025 235);
}

.file-header h2 {
	font-size: 1rem;
}

.file-header > span {
	align-self: end;
	overflow: hidden;
	max-width: 60%;
	color: oklch(0.42 0.035 245);
	font-family: var(--font-mono);
	font-size: 0.75rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.monaco-host,
textarea {
	width: 100%;
	height: 100%;
	min-height: 0;
}

.hidden {
	display: none;
}

textarea {
	resize: none;
	padding: 0.85rem;
	color: oklch(0.21 0.035 245);
	font-family: var(--font-mono);
	font-size: 0.9rem;
	line-height: 1.45;
	background: oklch(0.99 0.006 235);
	border: 0;
	outline: none;
}

.empty-editor,
.preview-empty {
	display: grid;
	align-content: center;
	gap: 0.5rem;
	height: 100%;
	padding: 1rem;
	text-align: center;
}

.preview-pane {
	display: grid;
	align-content: start;
	gap: 1rem;
	padding: 1rem;
	overflow: auto;
	background: oklch(0.99 0.01 95);
	border-right: none;
}

.preview-pane header {
	display: grid;
	gap: 0.25rem;
}

.base-views {
	display: grid;
	gap: 0.45rem;
}

.base-views section {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.7rem;
	padding: 0.6rem 0.7rem;
	background: oklch(0.96 0.025 105);
	border: 1px solid oklch(0.78 0.05 100);
	border-radius: 0.35rem;
}

.base-views span {
	color: oklch(0.36 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.75rem;
	text-transform: uppercase;
}

.collection-preview {
	display: grid;
	gap: 0.85rem;
	min-width: 0;
}

.collection-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.65rem;
}

.collection-toolbar span {
	color: oklch(0.38 0.04 245);
	font-family: var(--font-mono);
	font-size: 0.78rem;
}

.collection-toolbar input {
	min-width: min(100%, 14rem);
	min-height: 2rem;
	padding: 0.3rem 0.5rem;
	color: inherit;
	background: oklch(0.98 0.01 95);
	border: 1px solid oklch(0.76 0.04 105);
	border-radius: 0.35rem;
}

.collection-toolbar input:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 2px;
}

.collection-table-wrap {
	max-width: 100%;
	overflow: auto;
	border: 1px solid oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

table {
	width: 100%;
	min-width: 36rem;
	border-collapse: collapse;
	background: oklch(0.995 0.005 95);
}

th,
td {
	padding: 0.5rem 0.6rem;
	text-align: left;
	vertical-align: top;
	border-bottom: 1px solid oklch(0.86 0.025 100);
}

th {
	position: sticky;
	top: 0;
	z-index: 1;
	background: oklch(0.96 0.025 105);
}

tbody tr:last-child td {
	border-bottom: 0;
}

td {
	max-width: 18rem;
	overflow-wrap: anywhere;
	font-size: 0.9rem;
}

.table-sort,
.record-link {
	min-height: 0;
	padding: 0;
	border: 0;
	border-radius: 0;
	background: none;
}

.table-sort {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 0.5rem;
	width: 100%;
	color: oklch(0.28 0.05 245);
	font-weight: 700;
}

.table-sort:hover:not(:disabled),
.record-link:hover:not(:disabled) {
	background: none;
}

.table-sort small {
	color: oklch(0.4 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.68rem;
	font-weight: 700;
	text-transform: uppercase;
}

.record-link {
	color: oklch(0.34 0.1 190);
	font-weight: 700;
	text-align: left;
	text-decoration: underline;
	text-decoration-thickness: 1px;
	text-underline-offset: 0.16em;
}

.collection-source {
	display: grid;
	gap: 0.55rem;
}

.collection-source summary {
	width: fit-content;
	color: oklch(0.3 0.05 245);
	font-weight: 700;
	cursor: pointer;
}

.collection-empty {
	min-height: 12rem;
	border: 1px dashed oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

pre {
	max-width: 100%;
	margin: 0;
	overflow: auto;
	white-space: pre-wrap;
}

.markdown-preview {
	display: grid;
	gap: 0.75rem;
	line-height: 1.45;
}

.markdown-preview :global(h1),
.markdown-preview :global(h2),
.markdown-preview :global(h3),
.markdown-preview :global(p),
.markdown-preview :global(ul),
.markdown-preview :global(ol),
.markdown-preview :global(blockquote),
.markdown-preview :global(pre) {
	margin: 0;
}

.markdown-preview :global(h1) {
	font-size: 2rem;
	line-height: 1.05;
}

.markdown-preview :global(h2) {
	font-size: 1.35rem;
	line-height: 1.1;
}

.markdown-preview :global(blockquote) {
	padding-left: 0.75rem;
	color: oklch(0.35 0.045 245);
	border-left: 3px solid oklch(0.7 0.07 190);
}

.markdown-preview :global(code),
.markdown-preview :global(pre) {
	font-family: var(--font-mono);
}

.markdown-preview :global(pre) {
	padding: 0.7rem;
	background: oklch(0.94 0.018 235);
	border-radius: 0.35rem;
}

@media (max-width: 1340px) {
	.workspace {
		grid-template-columns: var(--vault-sidebar-width) minmax(0, 1fr);
	}

	.preview-pane {
		grid-column: 1 / -1;
		min-height: 28rem;
		border-top: 1px solid oklch(0.8 0.025 235);
	}
}

@media (max-width: 760px) {
	.topbar,
	.file-header {
		align-items: stretch;
		flex-direction: column;
	}

	.actions {
		justify-content: stretch;
	}

	.actions button {
		flex: 1 1 7rem;
	}

	.workspace {
		grid-template-columns: 1fr;
		overflow: auto;
	}

	.sidebar {
		height: 42vh;
		border-bottom: 1px solid oklch(0.8 0.025 235);
	}

	.editor-pane {
		height: 58vh;
	}

	.preview-pane {
		min-height: 24rem;
	}

	.file-header > span {
		max-width: 100%;
	}
}
</style>
