<script lang="ts">
import { onDestroy, tick } from 'svelte';
import type { BaseView } from '../../note-model/base.js';
import type {
	CollectionKanbanGroup,
	CollectionSummaryResult,
	CollectionTimelineItem,
	ResolvedCollection
} from '../../collections/index.js';
import type { LocalVaultFile } from '../../vault/local-files.js';
import { getNoteTitle } from '../../vault/paths.js';
import type { VaultBacklink, VaultIndex, VaultRecord } from '../../vault/index.js';
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
import type { CollectionCellEdit } from '../shared/types.js';

type Props = {
	baseViews: BaseView[];
	collectionCellEdit: CollectionCellEdit | null;
	collectionFilter: string;
	collectionKanbanGroupBy: string;
	collectionKanbanGroups: CollectionKanbanGroup[];
	collectionRecordCreationError: string;
	collectionRecords: VaultRecord[];
	collectionSortColumn: string;
	collectionSortDirection: 'asc' | 'desc';
	collectionSummaries: CollectionSummaryResult[];
	collectionTimelineDateField: string;
	collectionTimelineItems: CollectionTimelineItem[];
	files: LocalVaultFile[];
	hasVault: boolean;
	loading: boolean;
	saving: boolean;
	selectedBacklinks: VaultBacklink[];
	selectedCollection: ResolvedCollection | null;
	selectedContent: string;
	selectedFile: LocalVaultFile | null;
	vaultIndex: VaultIndex;
	addFieldToSelectedCollection: () => void;
	bulkSetCollectionField: () => void;
	cancelCollectionCellEdit: () => void;
	createCollectionRecord: () => void;
	downloadCollectionExport: (format: 'csv' | 'json') => void;
	editCollectionRecordField: (record: VaultRecord, column: string) => void;
	formatCollectionRecordValue: (record: VaultRecord, column: string) => string;
	handlePreviewChange: (event: Event) => void;
	handlePreviewClick: (event: MouseEvent) => void;
	isEditingCollectionCell: (record: VaultRecord, column: string) => boolean;
	openBacklink: (backlink: VaultBacklink) => void;
	openCollectionRecord: (record: VaultRecord) => void;
	saveCollectionCellEdit: (record: VaultRecord, column: string) => Promise<void>;
	selectCollectionView: (viewIndex: number) => void;
	setPreviewHtml: (html: string) => void;
	setSelectedContent: (content: string) => void;
	setCollectionFilter: (filter: string) => void;
	sortCollectionBy: (column: string) => void;
	updateCollectionCellEditValue: (value: string) => void;
};

let {
	baseViews,
	collectionCellEdit,
	collectionFilter,
	collectionKanbanGroupBy,
	collectionKanbanGroups,
	collectionRecordCreationError,
	collectionRecords,
	collectionSortColumn,
	collectionSortDirection,
	collectionSummaries,
	collectionTimelineDateField,
	collectionTimelineItems,
	files,
	hasVault,
	loading,
	saving,
	selectedBacklinks,
	selectedCollection,
	selectedContent,
	selectedFile,
	vaultIndex,
	addFieldToSelectedCollection,
	bulkSetCollectionField,
	cancelCollectionCellEdit,
	createCollectionRecord,
	downloadCollectionExport,
	editCollectionRecordField,
	formatCollectionRecordValue,
	handlePreviewChange,
	handlePreviewClick,
	isEditingCollectionCell,
	openBacklink,
	openCollectionRecord,
	saveCollectionCellEdit,
	selectCollectionView,
	setPreviewHtml,
	setCollectionFilter,
	sortCollectionBy,
	updateCollectionCellEditValue
}: Props = $props();
let markdownPreviewHost: HTMLElement | undefined = $state();
let mathTypesetToken = 0;
let previewFrameReloadToken = $state(0);
let previewFrameReloadPath = $state('');
let ensuredTauriPreviewOrigin = $state('');
let ensuredTauriPreviewPath = $state('');
let targetPreviewError = $state('');
let markupPreviewHtml = $state('');
let markupPreviewError = $state('');
let markupPreviewRequestToken = 0;

let targetPreviewRoute = $derived.by(() => getTargetPreviewRoute(selectedFile, ensuredTauriPreviewOrigin));
let targetPreviewNotice = $derived.by(() => getTargetPreviewNotice(selectedFile, targetPreviewRoute, targetPreviewError));
let serverPreviewRoute = $derived.by(() => {
	if (targetPreviewRoute) {
		return '';
	}

	return getSelectedServerPreviewRoute(selectedFile, selectedContent, {
		reloadToken: previewFrameReloadToken
	});
});
let previewFrameRoute = $derived(targetPreviewRoute || serverPreviewRoute);
let shouldRenderMarkupPreview = $derived(!previewFrameRoute && isMarkupPreviewFile(selectedFile));
let previewHtml = $derived.by(() => {
	if (previewFrameRoute) {
		return '';
	}

	if (shouldRenderMarkupPreview) {
		return markupPreviewHtml;
	}

	return renderPreviewPaneHtml(selectedContent, selectedFile, { files, vaultIndex });
});
$effect(() => {
	const file = selectedFile;
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
				if (selectedFile?.path !== previewPath) {
					return;
				}

				if (previewOrigin) {
					ensuredTauriPreviewOrigin = previewOrigin;
					return;
				}

				targetPreviewError = getMissingTargetPreviewMessage(previewPath);
			})
			.catch((error) => {
				if (selectedFile?.path === previewPath) {
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
	const file = selectedFile;
	const content = selectedContent;
	const shouldRender = shouldRenderMarkupPreview;
	const token = markupPreviewRequestToken + 1;

	markupPreviewRequestToken = token;
	markupPreviewHtml = '';
	markupPreviewError = '';

	if (!file || !shouldRender) {
		return;
	}

	const controller = new AbortController();

	void fetch('/api/vault/preview', {
		body: JSON.stringify({
			content,
			path: file.path
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
			}
		})
		.catch((error) => {
			if (controller.signal.aborted || markupPreviewRequestToken !== token) {
				return;
			}

			markupPreviewError = getMarkupPreviewErrorMessage(error);
		});

	return () => controller.abort();
});

$effect(() => {
	setPreviewHtml(previewHtml);
});

$effect(() => {
	if (previewHtml && (containsMath(selectedContent) || containsMath(previewHtml))) {
		queuePreviewMathTypeset();
	}
});

onDestroy(() => {
	setPreviewHtml('');
});

function previewLinkNavigation(node: HTMLElement) {
	node.addEventListener('click', handlePreviewClick);
	node.addEventListener('change', handlePreviewChange);

	return {
		destroy() {
			node.removeEventListener('click', handlePreviewClick);
			node.removeEventListener('change', handlePreviewChange);
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

function isMarkupPreviewFile(file: LocalVaultFile | null) {
	return Boolean(
		file &&
		(file.extension === '.md' || file.extension === '.svx' || file.extension === '.svelte') &&
		!isSvelteKitRoutePreviewFile(file.path)
	);
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
	{#if selectedCollection}
		<CollectionPreview
			{collectionCellEdit}
			{collectionFilter}
			{collectionKanbanGroupBy}
			{collectionKanbanGroups}
			{collectionRecordCreationError}
			{collectionRecords}
			{collectionSortColumn}
			{collectionSortDirection}
			{collectionSummaries}
			{collectionTimelineDateField}
			{collectionTimelineItems}
			{hasVault}
			{loading}
			{saving}
			{selectedCollection}
			{selectedContent}
			{addFieldToSelectedCollection}
			{bulkSetCollectionField}
			{cancelCollectionCellEdit}
			{createCollectionRecord}
			{downloadCollectionExport}
			{editCollectionRecordField}
			{formatCollectionRecordValue}
			{isEditingCollectionCell}
			{openCollectionRecord}
			{saveCollectionCellEdit}
			{selectCollectionView}
			{setCollectionFilter}
			{sortCollectionBy}
			{updateCollectionCellEditValue}
	/>
	{:else if selectedFile?.extension === '.base'}
		<BasePreview content={selectedContent} title={getNoteTitle(selectedFile.path)} views={baseViews} />
	{:else if previewFrameRoute && selectedFile}
		<iframe
			class="server-preview-frame"
			src={previewFrameRoute}
			title={`${getNoteTitle(selectedFile.path)} server preview`}
		></iframe>
		<Backlinks backlinks={selectedBacklinks} {openBacklink} />
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
		<Backlinks backlinks={selectedBacklinks} {openBacklink} />
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
	{:else if selectedFile}
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

@media (max-width: 1340px) {
	.preview-pane {
		grid-column: 1 / -1;
		grid-row: 2;
		min-height: 0;

		border-top: 1px solid oklch(0.8 0.025 235);
	}
}

@media (max-width: 760px) {
	.preview-pane {
		grid-row: auto;
		min-height: 24rem;
	}
}
</style>
