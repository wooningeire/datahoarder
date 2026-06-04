import type { CollectionSummaryResult, ResolvedCollection } from '../collections/index.js';
import { renderExcalidrawNotePreview } from '../drawings/preview.js';
import {
	renderCollectionKanbanHtml,
	renderCollectionSummariesHtml,
	renderCollectionTableHtml,
	renderCollectionTimelineHtml,
	renderSourceHtml
} from '../publishing/html-export.js';
import type { LocalVaultFile } from '../vault/local-files.js';
import {
	isDatahoarderBoardFile,
	renderDatahoarderBoard
} from '../boards/local-board.js';
import { renderPortableMarkdown } from '../markdown/render.js';
import { stripCompiledNoteExtension } from '../vault/paths.js';
import {
	getPublicPublishHref,
	type PublicPublishEntry
} from '../publishing/public-publish.js';
import { isExcalidrawNote } from '../note-model/raw.js';
import type { VaultIndex, VaultRecord } from '../vault/index.js';

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

	if (
		context.selectedFile &&
		(context.selectedFile.extension === '.md' || context.selectedFile.extension === '.svx') &&
		!(context.selectedFile.extension === '.md' && isExcalidrawNote(context.selectedContent))
	) {
		return renderLocalMarkdown(context.selectedContent, context.selectedFile, context);
	}

	if (context.selectedFile?.extension === '.md' && isExcalidrawNote(context.selectedContent)) {
		return renderExcalidrawNotePreview(context.selectedContent);
	}

	if (context.selectedFile && isDatahoarderBoardFile(context.selectedFile.path)) {
		return renderLocalBoard(context.selectedContent, context.selectedFile.path, context);
	}

	if (context.previewHtml) {
		return context.previewHtml;
	}

	return renderSourceHtml(context.selectedContent);
}

export function renderPublicRecordBodyHtml(
	record: VaultRecord,
	entry: PublicPublishEntry,
	entries: PublicPublishEntry[],
	vaultIndex: VaultIndex
) {
	if (record.extension === '.md' && isExcalidrawNote(record.content)) {
		return renderExcalidrawNotePreview(record.content);
	}

	if (record.extension === '.md' || record.extension === '.svx') {
		const notePaths = entries.map((publicEntry) => publicEntry.routePath);

		return renderPortableMarkdown(record.content, {
			currentPath: record.routePath,
			notePaths,
			resolveEmbedContent: (notePath) => {
				const targetEntry = getPublicPublishEntry(entries, notePath);
				return targetEntry ? (vaultIndex.recordsByPath.get(targetEntry.sourcePath)?.content ?? null) : null;
			},
			resolveNoteHref: (notePath, heading) => {
				const targetEntry = getPublicPublishEntry(entries, notePath);
				return getPublicPublishHref(entry.outputPath, targetEntry?.outputPath ?? '', heading);
			}
		});
	}

	if (isDatahoarderBoardFile(record.path)) {
		return renderDatahoarderBoard(record.content, {
			path: record.path,
			resolveNoteHref: (notePath, heading) => {
				const targetEntry = getPublicPublishEntry(entries, notePath);

				return targetEntry ? getPublicPublishHref(entry.outputPath, targetEntry.outputPath, heading) : '';
			}
		});
	}

	return renderSourceHtml(record.content);
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

function getPublicPublishEntry(entries: PublicPublishEntry[], routePath: string) {
	const normalizedRoutePath = routePath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').toLowerCase();
	const normalizedRoutePathWithoutExtension = stripCompiledNoteExtension(normalizedRoutePath);

	return entries.find((entry) => {
		const entryRoutePath = entry.routePath.toLowerCase();
		const entrySourcePath = entry.sourcePath.toLowerCase();

		return (
			entryRoutePath === normalizedRoutePath ||
			entrySourcePath === normalizedRoutePath ||
			entryRoutePath === normalizedRoutePathWithoutExtension ||
			stripCompiledNoteExtension(entrySourcePath) === normalizedRoutePathWithoutExtension
		);
	}) ?? null;
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
