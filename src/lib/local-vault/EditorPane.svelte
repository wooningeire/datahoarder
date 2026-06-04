<script lang="ts">
import { onDestroy, tick } from 'svelte';
import type { LocalVaultFile } from '../local-vault.js';
import { getNoteTitle } from '../paths.js';
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
</script>

<section class="editor-pane" aria-label="Editor">
	{#if selectedFile}
		<header class="file-header">
			<div>
				<p>{selectedFile.extension || 'text'}</p>
				<h2>{getNoteTitle(selectedFile.path)}</h2>
			</div>
			<span>{selectedFile.path}</span>
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
