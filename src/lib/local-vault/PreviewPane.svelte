<script lang="ts">
import { onDestroy, tick } from 'svelte';
import type { BaseView } from '../base.js';
import type {
	CollectionKanbanGroup,
	CollectionSummaryResult,
	CollectionTimelineItem,
	ResolvedCollection
} from '../collection.js';
import { renderExcalidrawNotePreview } from '../excalidraw-preview.js';
import { isDatahoarderBoardFile } from '../local-board.js';
import type { LocalVaultFile } from '../local-vault.js';
import { getNoteTitle } from '../paths.js';
import { isExcalidrawNote } from '../raw-notes.js';
import type { VaultBacklink, VaultIndex, VaultRecord } from '../vault-index.js';
import CollectionPreview from './CollectionPreview.svelte';
import { hasMath as containsMath, loadMathJax as loadMathJaxApi } from './mathjax.js';
import { renderLocalBoard, renderLocalMarkdown } from './rendering.js';
import type { CollectionCellEdit } from './types.js';

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
let previewRenderContent = $state('');
let previewRenderPath = $state('');
let mathTypesetToken = 0;
let previewRenderToken = 0;

let previewRenderFile = $derived(
	files.find((file) => file.path === previewRenderPath && file.path === selectedFile?.path) ?? null
);
let previewHtml = $derived.by(() => {
	if (!previewRenderFile) {
		return '';
	}

	if (previewRenderFile.extension === '.svelte') {
		return '';
	}

	if (isDatahoarderBoardFile(previewRenderFile.path)) {
		return renderLocalBoard(previewRenderContent, previewRenderFile.path, { files, vaultIndex });
	}

	if (previewRenderFile.extension === '.md' && isExcalidrawNote(previewRenderContent)) {
		return renderExcalidrawNotePreview(previewRenderContent);
	}

	if (previewRenderFile.extension === '.md' || previewRenderFile.extension === '.svx') {
		return renderLocalMarkdown(previewRenderContent, previewRenderFile, { files, vaultIndex }, {
			interactiveTaskLists: true
		});
	}

	return '';
});

$effect(() => {
	const file = selectedFile;
	const content = selectedContent;
	const path = file?.path ?? '';
	const token = previewRenderToken + 1;

	previewRenderToken = token;
	previewRenderPath = '';
	previewRenderContent = '';

	if (!file) {
		return;
	}

	const timeout = window.setTimeout(() => {
		if (previewRenderToken !== token || selectedFile?.path !== path) {
			return;
		}

		previewRenderPath = path;
		previewRenderContent = content;
	}, 0);

	return () => window.clearTimeout(timeout);
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
		<article
			class="markdown-preview"
			bind:this={markdownPreviewHost}
			use:previewLinkNavigation
		>
			{@html previewHtml}
		</article>

		{#if selectedBacklinks.length}
			<section class="backlinks" aria-label="Backlinks">
				<header>
					<p>{selectedBacklinks.length} backlinks</p>
					<h2>Backlinks</h2>
				</header>

				<ul>
					{#each selectedBacklinks as backlink (backlink.record.path)}
						<li>
							<button type="button" onclick={() => openBacklink(backlink)}>
								<strong>{backlink.record.title}</strong>
								<span>{backlink.record.path}</span>
								<small>{backlink.links.map((link) => link.label).join(', ')}</small>
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{:else if selectedFile}
		<div class="preview-empty">
			<h2>Source Only</h2>
			<p>Hosted preview renders portable markdown, base files, and Datahoarder board files. Custom Svelte execution stays in the notes project.</p>
		</div>
	{:else}
		<div class="preview-empty">
			<h2>Preview</h2>
			<p>Markdown and base previews appear here.</p>
		</div>
	{/if}
</section>
