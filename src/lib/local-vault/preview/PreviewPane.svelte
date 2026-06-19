<script lang="ts">
import { onDestroy, tick } from 'svelte';
import { formatCollectionRecordValue } from '../../collections/index.js';
import { isSvelteEnhancedMarkdownContent } from '../../markdown/svelte-markup.js';
import type { LocalVaultFile } from '../../vault/local-files.js';
import { getNoteTitle } from '../../vault/paths.js';
import Backlinks from './Backlinks.svelte';
import BasePreview from './BasePreview.svelte';
import CollectionPreview from './CollectionPreview.svelte';
import MarkdownPreview from './MarkdownPreview.svelte';
import PreviewEmpty from './PreviewEmpty.svelte';
import { hasMath as containsMath, loadMathJax as loadMathJaxApi } from './mathjax.js';
import { renderPreviewPaneHtml } from './rendering.js';
import {
	getMissingTargetPreviewMessage,
	getSelectedServerPreviewRoute,
	getTargetPreviewNotice,
	getTargetPreviewErrorMessage,
	getTargetPreviewRoute,
	isSvelteKitRoutePreviewFile,
} from './server-preview.js';
import {
	ensureTauriVaultPreviewOrigin,
	isTauriVaultFile
} from '../../vault/local-files.js';
import type { LocalVaultShellStore } from "../shell/Store.svelte.js";

type Props = {
    store: LocalVaultShellStore,
};

let { store }: Props = $props();
let markdownPreviewHost: HTMLElement | undefined = $state();
let mathTypesetToken = 0;
let previewFrameReloadToken = $state(0);
let previewFrameReloadPath = $state('');
let ensuredTauriPreviewOrigin = $state('');
let ensuredTauriPreviewPath = $state('');
let targetPreviewError = $state('');
let markupPreviewHtml = $state('');
let markupPreviewError = $state('');
let markupPreviewKey = '';
let markupPreviewRequestToken = 0;

let targetPreviewRoute = $derived.by(() => getTargetPreviewRoute(store.selectedFile, ensuredTauriPreviewOrigin));
let targetPreviewNotice = $derived.by(() =>
	getTargetPreviewNotice(store.selectedFile, targetPreviewRoute, targetPreviewError)
);
let serverPreviewRoute = $derived.by(() => {
	if (targetPreviewRoute) {
		return '';
	}

	return getSelectedServerPreviewRoute(store.selectedFile, store.selectedContent, {
		reloadToken: previewFrameReloadToken
	});
});
let previewFrameRoute = $derived(targetPreviewRoute || serverPreviewRoute);
let shouldRenderMarkupPreview = $derived(
	!previewFrameRoute && isMarkupPreviewFile(store.selectedFile, store.selectedContent)
);
let previewHtml = $derived.by(() => {
	if (previewFrameRoute) {
		return '';
	}

	if (shouldRenderMarkupPreview) {
		return markupPreviewHtml;
	}

	return renderPreviewPaneHtml(store.selectedContent, store.selectedFile, {
		files: store.files,
		vaultIndex: store.vaultIndex
	});
});
$effect(() => {
	const file = store.selectedFile;
	const path = file?.path ?? '';

	if (ensuredTauriPreviewPath !== path) {
		ensuredTauriPreviewPath = path;
		ensuredTauriPreviewOrigin = '';
		targetPreviewError = '';
	}

	if (file && isTauriVaultFile(file) && isSvelteKitRoutePreviewFile(file.path) && !file.handle.previewOrigin) {
		const previewPath = file.path;

		targetPreviewError = '';

		void ensureTauriVaultPreviewOrigin(file)
			.then((previewOrigin) => {
				if (store.selectedFile?.path !== previewPath) {
					return;
				}

				if (previewOrigin) {
					ensuredTauriPreviewOrigin = previewOrigin;
					return;
				}

				targetPreviewError = getMissingTargetPreviewMessage(previewPath);
			})
			.catch((error) => {
				if (store.selectedFile?.path === previewPath) {
					ensuredTauriPreviewOrigin = '';
					targetPreviewError = getTargetPreviewErrorMessage(error);
				}
			});
	} else if (file && isTauriVaultFile(file) && isSvelteKitRoutePreviewFile(file.path)) {
		targetPreviewError = '';
	}

	if (previewFrameReloadPath !== path) {
		previewFrameReloadPath = path;
		previewFrameReloadToken += 1;
	}
});

$effect(() => {
	const file = store.selectedFile;
	const content = store.selectedContent;
	const shouldRender = shouldRenderMarkupPreview;
	const previewRoot = file && shouldRender ? getMarkupPreviewRoot(file) : '';
	const nextMarkupPreviewKey = file && shouldRender ? `${previewRoot}\0${file.path}` : '';
	const shouldClearMarkupPreview = nextMarkupPreviewKey !== markupPreviewKey;
	const token = markupPreviewRequestToken + 1;

	markupPreviewRequestToken = token;
	markupPreviewKey = nextMarkupPreviewKey;
	markupPreviewError = '';

	if (!file || !shouldRender) {
		markupPreviewHtml = '';
		return;
	}

	if (shouldClearMarkupPreview) {
		markupPreviewHtml = '';
	}

	const controller = new AbortController();

	void fetch('/api/vault/preview', {
		body: JSON.stringify({
			content,
			path: file.path,
			...(previewRoot ? { root: previewRoot } : {})
		}),
		headers: {
			'content-type': 'application/json'
		},
		method: 'POST',
		signal: controller.signal
	})
		.then(async (response) => {
			const text = await response.text();

			if (!response.ok) {
				throw new Error(text || `Preview request failed with ${response.status}.`);
			}

			if (markupPreviewRequestToken === token) {
				markupPreviewHtml = text;
				markupPreviewError = '';
			}
		})
		.catch((error) => {
			if (controller.signal.aborted || markupPreviewRequestToken !== token) {
				return;
			}

			markupPreviewHtml = '';
			markupPreviewError = getMarkupPreviewErrorMessage(error);
		});

	return () => controller.abort();
});

$effect(() => {
	store.setPreviewHtml(previewHtml);
});

$effect(() => {
	if (previewHtml && (containsMath(store.selectedContent) || containsMath(previewHtml))) {
		queuePreviewMathTypeset();
	}
});

onDestroy(() => {
	store.setPreviewHtml('');
});

function previewLinkNavigation(node: HTMLElement) {
	node.addEventListener('click', store.interactionActions.handlePreviewClick);
	node.addEventListener('change', store.interactionActions.handlePreviewChange);

	return {
		destroy() {
			node.removeEventListener('click', store.interactionActions.handlePreviewClick);
			node.removeEventListener('change', store.interactionActions.handlePreviewChange);
		}
	};
}

function queuePreviewMathTypeset() {
	const token = ++mathTypesetToken;

	void tick().then(async () => {
		const mathJax = await loadMathJaxApi();

		if (token !== mathTypesetToken || !mathJax?.typesetPromise || !markdownPreviewHost) {
			return;
		}

		await mathJax.startup?.promise;
		await mathJax.typesetPromise([markdownPreviewHost]);
	});
}

function isMarkupPreviewFile(file: LocalVaultFile | null, content: string) {
	if (!file || isSvelteKitRoutePreviewFile(file.path)) {
		return false;
	}

	if (file.extension === '.md') {
		return isSvelteEnhancedMarkdownContent(content);
	}

	return file.extension === '.svx' || file.extension === '.svelte';
}

function getMarkupPreviewRoot(file: LocalVaultFile | null) {
	return file && isTauriVaultFile(file) ? file.handle.root : '';
}

function getMarkupPreviewErrorMessage(error: unknown) {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (typeof error === 'string' && error.trim()) {
		return error;
	}

	return 'Datahoarder could not render this note.';
}

</script>

<section class="preview-pane" aria-label="Preview">
	{#if store.selectedCollection}
		<CollectionPreview
			collectionCellEdit={store.collectionCellEdit}
			collectionFilter={store.collectionFilter}
			collectionKanbanGroupBy={store.collectionKanbanGroupBy}
			collectionKanbanGroups={store.collectionKanbanGroups}
			collectionRecordCreationError={store.collectionRecordCreationError}
			collectionRecords={store.collectionRecords}
			collectionSortColumn={store.collectionSortColumn}
			collectionSortDirection={store.collectionSortDirection}
			collectionSummaries={store.collectionSummaries}
			collectionTimelineDateField={store.collectionTimelineDateField}
			collectionTimelineItems={store.collectionTimelineItems}
			hasVault={Boolean(store.vaultHandle)}
			loading={store.loading}
			saving={store.saving}
			selectedCollection={store.selectedCollection}
			selectedContent={store.selectedContent}
			addFieldToSelectedCollection={store.noteActions.addFieldToSelectedCollection}
			bulkSetCollectionField={store.collectionActions.bulkSetCollectionField}
			cancelCollectionCellEdit={store.collectionActions.cancelCollectionCellEdit}
			createCollectionRecord={store.noteActions.createCollectionRecord}
			downloadCollectionExport={store.publishActions.downloadCollectionExport}
			editCollectionRecordField={store.collectionActions.editCollectionRecordField}
			{formatCollectionRecordValue}
			isEditingCollectionCell={store.collectionActions.isEditingCollectionCell}
			openCollectionRecord={store.collectionActions.openCollectionRecord}
			saveCollectionCellEdit={store.collectionActions.saveCollectionCellEdit}
			selectCollectionView={store.collectionActions.selectCollectionView}
			setCollectionFilter={store.collectionActions.setCollectionFilter}
			sortCollectionBy={store.collectionActions.sortCollectionBy}
			updateCollectionCellEditValue={store.collectionActions.updateCollectionCellEditValue}
	/>
	{:else if store.selectedFile?.extension === '.base'}
		<BasePreview content={store.selectedContent} title={getNoteTitle(store.selectedFile.path)} views={store.baseViews} />
	{:else if previewFrameRoute && store.selectedFile}
		<iframe
			class="server-preview-frame"
			src={previewFrameRoute}
			title={`${getNoteTitle(store.selectedFile.path)} server preview`}
		></iframe>
		<Backlinks backlinks={store.selectedBacklinks} openBacklink={store.interactionActions.openBacklink} />
	{:else if targetPreviewNotice}
		<PreviewEmpty
			title={targetPreviewNotice.title}
			description={targetPreviewNotice.description}
		/>
	{:else if previewHtml}
		<MarkdownPreview
			html={previewHtml}
			bind:host={markdownPreviewHost}
			{previewLinkNavigation}
		/>
		<Backlinks backlinks={store.selectedBacklinks} openBacklink={store.interactionActions.openBacklink} />
	{:else if markupPreviewError}
		<PreviewEmpty
			title="Preview Failed"
			description={markupPreviewError}
		/>
	{:else if shouldRenderMarkupPreview}
		<PreviewEmpty
			title="Preview"
			description="Rendering note."
		/>
	{:else if store.selectedFile}
		<PreviewEmpty
			title="Source Only"
			description="Preview renders Markdown, SVX, Svelte, base files, and Datahoarder board files."
		/>
	{:else}
		<PreviewEmpty title="Preview" description="Markdown and base previews appear here." />
	{/if}
</section>

<style lang="scss">
.preview-pane {
	display: grid;
	align-content: start;
	gap: 1rem;
	min-width: 0;
	min-height: 0;
	padding: 1rem;
	overflow: auto;

	background: oklch(0.99 0.01 95);
	border-right: none;
}

.server-preview-frame {
	width: 100%;
	min-height: min(72vh, 48rem);

	background: white;
	border: 1px solid oklch(0.78 0.04 100);
	border-radius: 0.35rem;
}

@media (max-width: 83.75rem) {
	.preview-pane {
		min-height: 0;

		border-top: 1px solid oklch(0.8 0.025 235);
	}
}

@media (max-width: 47.5rem) {
	.preview-pane {
		grid-row: auto;
		min-height: 24rem;
	}
}
</style>
