<script lang="ts">
import { onDestroy, tick } from 'svelte';
import type { LocalVaultFile } from '../../vault/local-files.js';
import type { LocalVaultShellStore } from "../shell/Store.svelte.js";
import { getEditorLanguage as getMonacoEditorLanguage } from './editor-language.js';
import { loadMonaco, type MonacoApi, type MonacoEditor } from './monaco.js';

type Props = {
    store: LocalVaultShellStore,
};

let { store }: Props = $props();
let editorHost: HTMLDivElement | undefined = $state();
let monacoState = $state<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
let monacoApi: MonacoApi | null = null;
let monacoEditor: MonacoEditor | null = null;
let monacoSubscription: { dispose: () => void } | null = null;

$effect(() => {
	store.setMonacoState(monacoState);
});

$effect(() => {
	if (editorHost && monacoState === 'idle') {
		void initializeMonaco();
	}
});

$effect(() => {
	syncMonacoContent(store.selectedContent);
});

$effect(() => {
	updateMonacoLanguage(store.selectedFile);
});

onDestroy(() => {
	store.setMonacoState('idle');
	monacoSubscription?.dispose();
	monacoEditor?.dispose();
});

function handleContentInput(event: Event) {
	store.setSelectedContent((event.currentTarget as HTMLTextAreaElement).value);
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
			language: getMonacoEditorLanguage(store.selectedFile),
			lineNumbersMinChars: 3,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			tabSize: 2,
			value: store.selectedContent,
			wordWrap: 'on'
		});
		monacoSubscription = monacoEditor.onDidChangeModelContent(() => {
			const nextValue = monacoEditor?.getValue() ?? '';

			if (nextValue !== store.selectedContent) {
				store.setSelectedContent(nextValue);
			}
		});
		monacoState = 'ready';
		await tick();
		monacoEditor.layout();
		updateMonacoLanguage(store.selectedFile);
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
</script>

<section class="editor-pane" aria-label="Editor">
	{#if store.selectedFile}
		<div class="source-editor">
			<div class:monaco-pending={monacoState !== 'ready'} class="monaco-host" bind:this={editorHost}></div>
			{#if monacoState !== 'ready'}
				<textarea
					class="fallback-editor"
					value={store.selectedContent}
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
	grid-template-rows: minmax(0, 1fr);
	min-width: 0;
	min-height: 0;
	overflow: hidden;
	background: oklch(0.985 0.006 235);
	border-right: 1px solid oklch(0.8 0.025 235);
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
	.editor-pane {
		height: 58vh;
	}
}
</style>
