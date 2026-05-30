<script lang="ts">
import { onMount } from 'svelte';
import { getBaseViews } from './base.js';
import {
	buildLocalVaultTree,
	canUseFileSystemAccess,
	getStoredVaultHandle,
	getTextAssets,
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

type DatahoarderWindow = Window & {
	monaco?: {
		editor: {
			create: (element: HTMLElement, options: Record<string, unknown>) => MonacoEditor;
			setModelLanguage: (model: unknown, language: string) => void;
		};
	};
	require?: {
		(config: { paths: { vs: string } }): void;
		(dependencies: string[], resolve: () => void, reject: (error: unknown) => void): void;
		config: (options: { paths: { vs: string } }) => void;
	};
	showDirectoryPicker?: (options?: { mode?: DatahoarderPermissionMode }) => Promise<LocalDirectoryHandle>;
};

type MonacoEditor = {
	dispose: () => void;
	getModel: () => unknown;
	getValue: () => string;
	onDidChangeModelContent: (callback: () => void) => { dispose: () => void };
	setValue: (value: string) => void;
};

const monacoCdnBase = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';

let supported = $state(false);
let vaultHandle = $state<LocalDirectoryHandle | null>(null);
let files = $state<LocalVaultFile[]>([]);
let selectedPath = $state('');
let selectedContent = $state('');
let savedContent = $state('');
let status = $state('Choose a local notes folder to begin.');
let loading = $state(false);
let saving = $state(false);
let errorMessage = $state('');
let editorHost: HTMLDivElement | undefined = $state();
let monacoState = $state<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
let monacoEditor: MonacoEditor | null = null;
let monacoSubscription: { dispose: () => void } | null = null;

let selectedFile = $derived(
	files.find((file) => file.routePath === selectedPath) ??
		files.find((file) => file.path === selectedPath) ??
		null
);
let noteTree = $derived(buildLocalVaultTree(files));
let textAssets = $derived(getTextAssets(files));
let noteCount = $derived(files.filter((file) => file.extension === '.md' || file.extension === '.svx').length);
let dirty = $derived(selectedContent !== savedContent);
let baseViews = $derived(selectedFile?.extension === '.base' ? getBaseViews(selectedContent) : []);
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
			routeBase: '/datahoarder'
		});
	}

	return '';
});

onMount(() => {
	supported = canUseFileSystemAccess();

	if (!supported) {
		status = 'File System Access is unavailable in this browser. Use Chrome or Edge over HTTPS.';
		return;
	}

	void restoreVaultHandle();
	void initializeMonaco();

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
		files = await readLocalVault(handle);
		status = `${nextStatus} ${files.length} editable files indexed.`;

		if (!selectedFile && files.length) {
			await selectFile(files[0].routePath);
		}
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		loading = false;
	}
}

async function selectFile(routePath: string) {
	if (dirty && !window.confirm('Discard unsaved edits?')) {
		return;
	}

	const nextFile =
		files.find((file) => file.routePath === routePath) ?? files.find((file) => file.path === routePath);

	if (!nextFile || !isEditableTextFile(nextFile.path)) {
		return;
	}

	try {
		errorMessage = '';
		selectedPath = nextFile.routePath;
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
		status = `Saved ${selectedFile.path}`;
	} catch (error) {
		errorMessage = getErrorMessage(error);
	} finally {
		saving = false;
	}
}

async function initializeMonaco() {
	monacoState = 'loading';

	try {
		const win = window as unknown as DatahoarderWindow;

		if (!win.monaco) {
			await loadScript(`${monacoCdnBase}/loader.js`);

			if (!win.require) {
				throw new Error('Monaco loader did not initialize.');
			}

			win.require.config({ paths: { vs: monacoCdnBase } });
			await new Promise<void>((resolve, reject) => {
				win.require?.(['vs/editor/editor.main'], resolve, reject);
			});
		}

		if (!editorHost || !win.monaco) {
			throw new Error('Editor host was not ready.');
		}

		monacoEditor = win.monaco.editor.create(editorHost, {
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
		updateMonacoLanguage(selectedFile);
	} catch {
		monacoState = 'fallback';
	}
}

function loadScript(src: string) {
	return new Promise<void>((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

		if (existing) {
			resolve();
			return;
		}

		const script = document.createElement('script');
		script.src = src;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error(`Could not load ${src}`));
		document.head.append(script);
	});
}

function syncMonacoContent(content: string) {
	if (!monacoEditor || monacoEditor.getValue() === content) {
		return;
	}

	monacoEditor.setValue(content);
}

function updateMonacoLanguage(file: LocalVaultFile | null) {
	const win = window as unknown as DatahoarderWindow;
	const model = monacoEditor?.getModel();

	if (!win.monaco || !model) {
		return;
	}

	win.monaco.editor.setModelLanguage(model, getEditorLanguage(file));
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

function formatBytes(bytes: number) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}

	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
			<h1>Local Notes</h1>
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
				<span>{noteCount} notes</span>
				<span>{textAssets.length} text assets</span>
			</div>

			{#if noteTree.length}
				<NoteTree nodes={noteTree} activePath={selectedPath} onSelect={selectFile} />
			{:else}
				<p class="empty-state">No markdown, SVX, Svelte, or base notes are indexed yet.</p>
			{/if}

			{#if textAssets.length}
				<section class="asset-list" aria-labelledby="text-assets-heading">
					<h2 id="text-assets-heading">Text Assets</h2>
					<ul>
						{#each textAssets as file (file.path)}
							<li>
								<button
									type="button"
									class:active={selectedFile?.path === file.path}
									onclick={() => selectFile(file.routePath)}
								>
									<span>{file.path}</span>
									<small>{formatBytes(file.size)}</small>
								</button>
							</li>
						{/each}
					</ul>
				</section>
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
					<p>Open a folder, then choose a note or text asset.</p>
				</div>
			{/if}
		</section>

		<section class="preview-pane" aria-label="Preview">
			{#if selectedFile?.extension === '.base'}
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
				<article class="markdown-preview">
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
	grid-template-rows: auto auto minmax(0, 1fr);
	min-height: 100vh;
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
	display: grid;
	grid-template-columns: minmax(16rem, 24rem) minmax(20rem, 1fr) minmax(18rem, 0.85fr);
	min-height: 0;
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
	grid-template-rows: auto minmax(0, 1fr) auto;
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

.asset-list {
	display: grid;
	gap: 0.4rem;
	min-height: 8rem;
	overflow: hidden;
}

.asset-list h2 {
	margin: 0;
	color: oklch(0.42 0.06 255);
	font-family: var(--font-mono);
	font-size: 0.72rem;
	text-transform: uppercase;
}

.asset-list ul {
	display: grid;
	gap: 0.15rem;
	margin: 0;
	padding: 0;
	overflow: auto;
	list-style: none;
}

.asset-list button {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.5rem;
	width: 100%;
	text-align: left;
	background: transparent;
	border-color: transparent;
}

.asset-list button.active {
	font-weight: 700;
	background: oklch(0.87 0.055 205);
}

.asset-list span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.asset-list small {
	color: oklch(0.44 0.035 245);
	font-family: var(--font-mono);
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

@media (max-width: 1100px) {
	.workspace {
		grid-template-columns: minmax(14rem, 20rem) minmax(0, 1fr);
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
