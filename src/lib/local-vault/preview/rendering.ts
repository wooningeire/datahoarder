import { renderExcalidrawNotePreview } from '../../drawings/preview.js';
import type { LocalVaultFile } from '../../vault/local-files.js';
import {
	isDatahoarderBoardFile,
	renderDatahoarderBoard
} from '../../boards/local-board.js';
import { renderPortableMarkdown } from '../../markdown/render.js';
import { isExcalidrawNote } from '../../note-model/raw.js';
import type { VaultIndex } from '../../vault/index.js';

type LocalRenderContext = {
	files: LocalVaultFile[];
	vaultIndex: VaultIndex;
};

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
