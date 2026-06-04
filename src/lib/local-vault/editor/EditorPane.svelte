<script lang="ts">
import { onDestroy, tick } from 'svelte';
import type { LocalVaultFile } from '../../vault/local-files.js';
import { getEditorLanguage as getMonacoEditorLanguage } from './editor-language.js';
import { loadMonaco, type MonacoApi, type MonacoEditor } from './monaco.js';

type Props = {
	selectedContent: string;
	selectedFile: LocalVaultFile | null;
	setMonacoState: (state: 'fallback' | 'idle' | 'loading' | 'ready') => void;
	setSelectedContent: (content: string) => void;
};

let {
	selectedContent,
	selectedFile,
	setMonacoState,
	setSelectedContent
}: Props = $props();
let editorHost: HTMLDivElement | undefined = $state();
let monacoState = $state<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
let monacoApi: MonacoApi | null = null;
let monacoEditor: MonacoEditor | null = null;
let monacoSubscription: { dispose: () => void } | null = null;
let selectedPathParts = $derived(selectedFile ? getPathParts(selectedFile.path, selectedFile.extension) : null);

$effect(() => {
	setMonacoState(monacoState);
});

$effect(() => {
	if (editorHost && monacoState === 'idle') {
		void initializeMonaco();
	}
});

$effect(() => {
	syncMonacoContent(selectedContent);
});

$effect(() => {
	updateMonacoLanguage(selectedFile);
});

onDestroy(() => {
	setMonacoState('idle');
	monacoSubscription?.dispose();
	monacoEditor?.dispose();
});

function handleContentInput(event: Event) {
	setSelectedContent((event.currentTarget as HTMLTextAreaElement).value);
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

		const monaco = await loadMonaco();
		monacoApi = monaco;

		if (!editorHost) {
			throw new Error('Editor host was not ready.');
		}

		monacoEditor = monaco.editor.create(editorHost, {
			automaticLayout: true,
			fontFamily: 'var(--font-mono)',
			fontSize: 14,
			language: getMonacoEditorLanguage(selectedFile),
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
				setSelectedContent(nextValue);
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

function syncMonacoContent(content: string) {
	if (!monacoEditor || monacoEditor.getValue() === content) {
		return;
	}

	monacoEditor.setValue(content);
}

function updateMonacoLanguage(file: LocalVaultFile | null) {
	const model = monacoEditor?.getModel();

	if (!model || !monacoApi) {
		return;
	}

	monacoApi.editor.setModelLanguage(model, getMonacoEditorLanguage(file));
}

function getPathParts(path: string, extension: string) {
	const fileName = path.split('/').at(-1) ?? path;
	const directory = path.slice(0, Math.max(0, path.length - fileName.length));
	const hasMatchingExtension =
		extension && fileName.toLowerCase().endsWith(extension.toLowerCase());
	const fileExtension = hasMatchingExtension ? fileName.slice(-extension.length) : '';
	const stem = fileExtension ? fileName.slice(0, -fileExtension.length) : fileName;

	return {
		directory,
		extension: fileExtension,
		stem
	};
}
</script>

<section class="editor-pane" aria-label="Editor">
	{#if selectedFile}
		<header class="file-header">
			{#if selectedPathParts}
				<h2 class="file-path-label" title={selectedFile.path} aria-label={selectedFile.path}>
					{#if selectedPathParts.directory}<span class="file-path-directory">{selectedPathParts.directory}</span>{/if}<span class="file-path-name">{selectedPathParts.stem}</span>{#if selectedPathParts.extension}<span class="file-path-extension">{selectedPathParts.extension}</span>{/if}
				</h2>
			{/if}
		</header>

		<div class="source-editor">
			<div class:monaco-pending={monacoState !== 'ready'} class="monaco-host" bind:this={editorHost}></div>
			{#if monacoState !== 'ready'}
				<textarea
					class="fallback-editor"
					value={selectedContent}
					spellcheck="false"
					aria-label="File source"
					oninput={handleContentInput}
				></textarea>
			{/if}
		</div>
	{:else}
		<div class="empty-editor">
			<h2>No File Selected</h2>
			<p>Open a folder, then choose a file.</p>
		</div>
	{/if}
</section>

<style lang="scss">
.editor-pane {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	min-width: 0;
	min-height: 0;
	overflow: hidden;
	background: oklch(0.985 0.006 235);
	border-right: 1px solid oklch(0.8 0.025 235);
}

.file-header {
	display: flex;
	justify-content: space-between;
	gap: 1rem;
	min-width: 0;
	padding: 0.75rem 0.9rem;
	border-bottom: 1px solid oklch(0.82 0.025 235);
}

.file-header h2 {
	margin: 0;
}

.file-path-label {
	max-width: 100%;
	min-width: 0;
	overflow: hidden;
	font-size: 1rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.file-path-directory {
	color: oklch(0.42 0.035 245);
	font-family: var(--font-mono);
	font-size: 0.75rem;
	font-weight: 500;
}

.file-path-extension {
	color: oklch(0.42 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
}

.source-editor,
.monaco-host,
.fallback-editor {
	width: 100%;
	height: 100%;
	min-height: 0;
}

.source-editor {
	position: relative;
	overflow: hidden;
}

.monaco-pending {
	visibility: hidden;
	pointer-events: none;
}

.fallback-editor {
	position: absolute;
	inset: 0;
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

.empty-editor {
	display: grid;
	align-content: center;
	gap: 0.5rem;
	height: 100%;
	padding: 1rem;
	text-align: center;
}

.empty-editor p {
	color: oklch(0.42 0.035 245);
}

@media (max-width: 760px) {
	.file-header {
		align-items: stretch;
		flex-direction: column;
	}

	.editor-pane {
		height: 58vh;
	}
}
</style>
