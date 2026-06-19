import type { CollectionSummaryResult, ResolvedCollection } from '../../collections/index.js';
import { renderExcalidrawNotePreview } from '../../drawings/preview.js';
import {
	renderCollectionKanbanHtml,
	renderCollectionSummariesHtml,
	renderCollectionTableHtml,
	renderCollectionTimelineHtml,
	renderSourceHtml
} from '../../publishing/html-export.js';
import type { LocalVaultFile } from '../../vault/local-files.js';
import {
	isDatahoarderBoardFile,
	renderDatahoarderBoard
} from '../../boards/local-board.js';
import { renderPortableMarkdown } from '../../markdown/render.js';
import { isExcalidrawNote } from '../../note-model/raw.js';
import type { VaultIndex, VaultRecord } from '../../vault/index.js';

type LocalRenderContext = {
	files: LocalVaultFile[];
	vaultIndex: VaultIndex;
};

type SelectedExportContext = LocalRenderContext & {
	collectionRecords: VaultRecord[];
	collectionSummaries: CollectionSummaryResult[];
	previewHtml: string;
	selectedCollection: ResolvedCollection | null;
	selectedContent: string;
	selectedFile: LocalVaultFile | null;
};

export function renderSelectedExportBodyHtml(context: SelectedExportContext) {
	if (context.selectedCollection) {
		const summariesHtml = renderCollectionSummariesHtml(context.collectionSummaries);
		const withSummaries = (bodyHtml: string) => [summariesHtml, bodyHtml].filter(Boolean).join('\n');

		if (context.selectedCollection.view.type.toLowerCase() === 'kanban') {
			return withSummaries(
				renderCollectionKanbanHtml(
					context.collectionRecords,
					context.selectedCollection.columns,
					context.selectedCollection.view
				)
			);
		}

		if (context.selectedCollection.view.type.toLowerCase() === 'timeline') {
			return withSummaries(
				renderCollectionTimelineHtml(
					context.collectionRecords,
					context.selectedCollection.columns,
					context.selectedCollection.view
				)
			);
		}

		return withSummaries(renderCollectionTableHtml(context.collectionRecords, context.selectedCollection.columns));
	}

	if (context.selectedFile && isDatahoarderBoardFile(context.selectedFile.path)) {
		return renderLocalBoard(context.selectedContent, context.selectedFile.path, context);
	}

	if (context.selectedFile?.extension === '.md' && isExcalidrawNote(context.selectedContent)) {
		return renderExcalidrawNotePreview(context.selectedContent);
	}

	if (context.selectedFile?.extension === '.md') {
		return renderLocalMarkdown(context.selectedContent, context.selectedFile, context);
	}

	if (context.previewHtml) {
		return context.previewHtml;
	}

	return renderSourceHtml(context.selectedContent);
}

export function renderLocalMarkdown(
	content: string,
	file: LocalVaultFile,
	context: LocalRenderContext,
	options: { interactiveTaskLists?: boolean } = {}
) {
	return renderPortableMarkdown(content, {
		currentPath: file.routePath,
		interactiveTaskLists: options.interactiveTaskLists ?? false,
		notePaths: getLocalNotePaths(context.files),
		resolveEmbedContent: (notePath) => getLocalEmbedContent(notePath, context.vaultIndex),
		resolveNoteHref: getLocalNoteHref
	});
}

export function renderLocalBoard(content: string, path: string, context: LocalRenderContext) {
	return renderDatahoarderBoard(content, {
		path,
		resolveNoteHref: getLocalNoteHref
	});
}

export function renderPreviewPaneHtml(
	content: string,
	file: LocalVaultFile | null,
	context: LocalRenderContext
) {
	if (
		!file ||
		file.extension === '.svx' ||
		file.extension === '.svelte'
	) {
		return '';
	}

	if (file.extension === '.md' && isExcalidrawNote(content)) {
		return renderExcalidrawNotePreview(content);
	}

	if (file.extension === '.md') {
		return renderLocalMarkdown(content, file, context, {
			interactiveTaskLists: true
		});
	}

	if (isDatahoarderBoardFile(file.path)) {
		return renderLocalBoard(content, file.path, context);
	}

	return '';
}

function getLocalEmbedContent(notePath: string, vaultIndex: VaultIndex) {
	const normalizedNotePath = notePath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');

	return (
		vaultIndex.recordsByRoutePath.get(normalizedNotePath)?.content ??
		vaultIndex.recordsByPath.get(normalizedNotePath)?.content ??
		null
	);
}

function getLocalNotePaths(files: LocalVaultFile[]) {
	return files
		.filter((file) => file.extension === '.md' || file.extension === '.svx' || file.extension === '.svelte')
		.map((file) => file.routePath);
}

function getLocalNoteHref(notePath: string, heading: string) {
	const params = new URLSearchParams({ note: notePath });

	if (heading) {
		params.set('heading', heading);
	}

	return `#${params.toString()}`;
}
