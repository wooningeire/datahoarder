import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { renderDatahoarderBoard } from '../boards/local-board.js';
import {
	isWhiteboardNoteContent,
	renderWhiteboardNotePreview
} from '../drawings/preview.js';
import { renderPortableMarkdown } from '../markdown/render.js';
import { isSvelteEnhancedMarkdownContent } from '../markdown/svelte-markup.js';
import {
	getLocalRoutePath,
	isEditableTextFile,
	normalizeLocalTextPath,
	type LocalFileHandle,
	type LocalVaultFile
} from '../vault/local-files.js';
import { buildLocalVaultIndex, type VaultIndex } from '../vault/index.js';
import { getSvelteKitRoutePath } from '../shared/sveltekit-routes.js';
import { getEnv, normalizeRouteBase } from './open-folder-env.js';
import { escapeHtml } from './open-folder-html.js';
import {
	getOpenFolderName,
	getOpenFolderRoot,
	requireOpenFolderRoot,
	resolvePathWithinRoot
} from './open-folder-root.js';
import {
	getSvelteKitRoutePreviewHref,
	getWorkspacePreviewOrigin,
	renderPreviewFrame,
	renderPreviewServerRequired
} from './open-folder-target-preview.js';
import {
	isSvelteMarkupNotePreviewFile,
	renderSvelteNotePreview
} from './svelte-note.js';

export { setOpenFolderTargetPreviewOriginResolverForTest } from './open-folder-target-preview.js';

export type OpenFolderMetadata = {
	enabled: boolean;
	name: string;
	previewOrigin: string;
	previewRouteBase: string;
	root: string;
};

export type OpenFolderFileSnapshot = {
	extension: string;
	path: string;
	routePath: string;
	size: number;
	updatedAt: number;
};

export type OpenFolderPreviewRequest = {
	content?: string;
	interactiveTaskLists?: boolean;
	path: string;
	root?: string;
};

type PreviewSourceContext = {
	sourcePath?: string;
	sourceRoot?: string;
};

const ignoredDirectories = new Set(['.git', '.svelte-kit', 'build', 'dist', 'node_modules']);

export async function getOpenFolderMetadata(): Promise<OpenFolderMetadata> {
	const root = await getOpenFolderRoot();
	const previewOrigin = await getWorkspacePreviewOrigin({
		startIfMissing: false,
		verify: true
	});

	return {
		enabled: Boolean(root),
		name: getOpenFolderName(root),
		previewOrigin,
		previewRouteBase: normalizeRouteBase(getEnv('DATAHOARDER_PREVIEW_ROUTE_BASE') ?? '/notes'),
		root: root ?? ''
	};
}

export async function listOpenFolderFiles() {
	const root = await requireOpenFolderRoot();
	const files: OpenFolderFileSnapshot[] = [];

	await collectOpenFolderFiles(root, '', files);

	return files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
}

export async function readOpenFolderTextFile(path: string) {
	const filesystemPath = await resolveOpenFolderTextPath(path);

	return readFile(filesystemPath, 'utf8');
}

export async function writeOpenFolderTextFile(path: string, content: string) {
	const filesystemPath = await resolveOpenFolderTextPath(path);

	await writeFile(filesystemPath, content, 'utf8');
}

export async function createOpenFolderTextFile(path: string, content: string) {
	const normalizedPath = normalizeLocalTextPath(path, '');
	const filesystemPath = await resolveOpenFolderTextPath(normalizedPath, { mustExist: false });

	try {
		await stat(filesystemPath);
		throw new Error(`A file already exists at ${normalizedPath}.`);
	} catch (error) {
		if (!isNotFoundError(error)) {
			throw error;
		}
	}

	await mkdir(dirname(filesystemPath), { recursive: true });
	await writeFile(filesystemPath, content, 'utf8');

	return normalizedPath;
}

export async function deleteOpenFolderTextFile(path: string) {
	const filesystemPath = await resolveOpenFolderTextPath(path);

	await rm(filesystemPath);
}

export async function moveOpenFolderTextFile(currentPath: string, nextPath: string, content: string) {
	const normalizedCurrentPath = normalizeLocalTextPath(currentPath, '');
	const normalizedNextPath = normalizeLocalTextPath(nextPath, '');

	if (normalizedCurrentPath === normalizedNextPath) {
		await writeOpenFolderTextFile(normalizedCurrentPath, content);
		return normalizedCurrentPath;
	}

	if (normalizedCurrentPath.toLowerCase() === normalizedNextPath.toLowerCase()) {
		throw new Error('Case-only renames are not supported yet.');
	}

	const currentFilesystemPath = await resolveOpenFolderTextPath(normalizedCurrentPath);
	const nextFilesystemPath = await resolveOpenFolderTextPath(normalizedNextPath, { mustExist: false });

	try {
		await stat(nextFilesystemPath);
		throw new Error(`A file already exists at ${normalizedNextPath}.`);
	} catch (error) {
		if (!isNotFoundError(error)) {
			throw error;
		}
	}

	await writeFile(currentFilesystemPath, content, 'utf8');
	await mkdir(dirname(nextFilesystemPath), { recursive: true });
	await rename(currentFilesystemPath, nextFilesystemPath);

	return normalizedNextPath;
}

export async function renderOpenFolderPreviewFragment(request: OpenFolderPreviewRequest) {
	const normalizedPath = normalizeLocalTextPath(request.path, '');
	const files = await getOpenFolderLocalVaultFiles();
	const file = files.find((candidate) => candidate.path === normalizedPath || candidate.routePath === normalizedPath);

	if (!file) {
		throw new Error(`Preview file not found: ${normalizedPath}`);
	}

	const content = request.content ?? await readOpenFolderTextFile(file.path);
	const previewHref = await getSvelteKitRoutePreviewHref(file.path);

	if (previewHref) {
		return renderPreviewFrame(file.routePath, previewHref);
	}

	if (getSvelteKitRoutePath(file.path) !== null) {
		return renderPreviewServerRequired(file.routePath);
	}

	if (isWhiteboardNoteContent(content)) {
		return renderWhiteboardNotePreview(content);
	}

	if (file.extension === '.md' && !isSvelteEnhancedMarkdownContent(content)) {
		return renderOpenFolderMarkdown(content, file, files, {
			interactiveTaskLists: request.interactiveTaskLists ?? false
		});
	}

	if (isSvelteMarkupNotePreviewFile(file.path)) {
		const sourceRoot = await requireOpenFolderRoot();

		return renderSvelteNotePreview(content, {
			...file,
			sourcePath: await resolveOpenFolderTextPath(file.path),
			sourceRoot
		});
	}

	if (isOpenFolderBoardFile(file.path)) {
		return renderDatahoarderBoard(content, {
			path: file.path,
			resolveNoteHref: getOpenFolderNoteHref
		});
	}

	return `<pre><code>${escapeHtml(content)}</code></pre>`;
}

export async function renderPostedNotePreviewFragment(request: OpenFolderPreviewRequest) {
	const normalizedPath = normalizeLocalTextPath(request.path, '');
	const content = request.content ?? '';
	const sourceContext = await resolvePostedPreviewSourceContext(normalizedPath, request.root);
	const file = {
		extension: getPathExtension(normalizedPath),
		path: normalizedPath,
		routePath: normalizedPath,
		size: content.length,
		sourcePath: sourceContext.sourcePath,
		sourceRoot: sourceContext.sourceRoot,
		updatedAt: content.length
	};

	if (isWhiteboardNoteContent(content)) {
		return renderWhiteboardNotePreview(content);
	}

	if (file.extension === '.md' && !isSvelteEnhancedMarkdownContent(content)) {
		return renderPortableMarkdown(content, {
			currentPath: file.routePath,
			interactiveTaskLists: request.interactiveTaskLists ?? false,
			resolveNoteHref: getOpenFolderNoteHref
		});
	}

	if (isSvelteMarkupNotePreviewFile(file.path)) {
		return renderSvelteNotePreview(content, file);
	}

	return `<pre><code>${escapeHtml(content)}</code></pre>`;
}

export async function renderOpenFolderPreviewDocument(request: OpenFolderPreviewRequest) {
	const title = basename(request.path);
	const routePath = getSvelteKitRoutePath(request.path);
	const previewHref = await getSvelteKitRoutePreviewHref(request.path);
	const body = routePath !== null
		? previewHref
			? renderPreviewFrame(request.path, previewHref)
			: renderPreviewServerRequired(request.path)
		: await renderOpenFolderPreviewFragment(request);

	return [
		'<!doctype html>',
		'<html lang="en">',
		'<head>',
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<title>${escapeHtml(title)} preview</title>`,
		'<style>',
		'body{margin:0;padding:1rem;color:oklch(0.22 0.035 245);background:oklch(0.99 0.01 95);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.55}',
		'.datahoarder-markdown-note{display:grid;gap:.75rem}.datahoarder-markdown-note :is(h1,h2,h3,p,ul,ol,blockquote,pre,.markdown-callout,.markdown-table-wrapper){margin:0}.datahoarder-markdown-note p{white-space:pre-wrap}.markdown-blank-line{min-height:0}',
		'blockquote{display:grid;gap:.55rem;padding-left:.75rem;color:oklch(.35 .045 245);border-left:3px solid oklch(.7 .07 190)}.markdown-callout{--callout-accent:oklch(.62 .11 205);--callout-background:oklch(.98 .018 220);--callout-border:oklch(.82 .04 210);--callout-text:oklch(.28 .055 245);display:grid;gap:.55rem;padding:.7rem .8rem;color:var(--callout-text);background:var(--callout-background);border:1px solid var(--callout-border);border-left:4px solid var(--callout-accent);border-radius:.35rem}.markdown-callout-title{font-weight:700}.markdown-callout-warning,.markdown-callout-caution,.markdown-callout-attention{--callout-accent:oklch(.7 .13 72);--callout-background:oklch(.985 .026 82);--callout-border:oklch(.85 .055 82);--callout-text:oklch(.31 .06 70)}.markdown-callout-error,.markdown-callout-danger,.markdown-callout-failure,.markdown-callout-bug{--callout-accent:oklch(.62 .17 25);--callout-background:oklch(.975 .022 25);--callout-border:oklch(.84 .055 25);--callout-text:oklch(.32 .07 25)}.markdown-callout-success,.markdown-callout-tip,.markdown-callout-done{--callout-accent:oklch(.62 .13 155);--callout-background:oklch(.975 .021 158);--callout-border:oklch(.82 .052 155);--callout-text:oklch(.28 .055 155)}.markdown-callout-important,.markdown-callout-question,.markdown-callout-help,.markdown-callout-faq{--callout-accent:oklch(.58 .14 285);--callout-background:oklch(.975 .02 292);--callout-border:oklch(.82 .05 292);--callout-text:oklch(.31 .06 285)}',
		'.server-vite-preview-frame{display:block;width:100%;min-height:calc(100vh - 2rem);border:1px solid oklch(0.78 0.04 235);border-radius:.35rem;background:white}',
		'.math-display,.math-inline{max-width:100%;overflow-x:auto;overflow-y:hidden}.math-display{display:block;margin:1rem 0;text-align:center}.math-inline{display:inline-block;vertical-align:middle}',
		'</style>',
		'</head>',
		'<body>',
		body,
		'</body>',
		'</html>'
	].join('\n');
}

async function getOpenFolderLocalVaultFiles() {
	const snapshots = await listOpenFolderFiles();

	return snapshots.map((file) => ({
		...file,
		handle: createOpenFolderFileHandle(file)
	}));
}

function createOpenFolderFileHandle(file: OpenFolderFileSnapshot): LocalFileHandle {
	return {
		kind: 'file',
		name: basename(file.path),
		getFile: async () => {
			const content = await readOpenFolderTextFile(file.path);
			const blob = new Blob([content], { type: 'text/plain' }) as Blob & {
				lastModified: number;
				name: string;
			};

			blob.lastModified = file.updatedAt;
			blob.name = basename(file.path);

			return blob as File;
		}
	};
}

async function renderOpenFolderMarkdown(
	content: string,
	file: LocalVaultFile,
	files: LocalVaultFile[],
	options: { interactiveTaskLists: boolean }
) {
	const vaultIndex = await buildLocalVaultIndex(files);

	return renderPortableMarkdown(content, {
		currentPath: file.routePath,
		interactiveTaskLists: options.interactiveTaskLists,
		notePaths: getOpenFolderNotePaths(files),
		resolveEmbedContent: (notePath) => getOpenFolderEmbedContent(notePath, vaultIndex),
		resolveNoteHref: getOpenFolderNoteHref
	});
}

async function collectOpenFolderFiles(
	root: string,
	parentPath: string,
	files: OpenFolderFileSnapshot[]
) {
	for (const entry of await readdir(resolve(root, parentPath), { withFileTypes: true })) {
		const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;

		if (entry.isDirectory()) {
			if (!ignoredDirectories.has(entry.name)) {
				await collectOpenFolderFiles(root, path, files);
			}

			continue;
		}

		if (!entry.isFile() || !isEditableTextFile(path)) {
			continue;
		}

		const entryStats = await stat(resolve(root, ...path.split('/')));

		files.push({
			extension: path.includes('.') ? `.${path.split('.').at(-1) ?? ''}`.toLowerCase() : '',
			path,
			routePath: getLocalRoutePath(path),
			size: entryStats.size,
			updatedAt: entryStats.mtimeMs
		});
	}
}

async function resolveOpenFolderTextPath(path: string, options: { mustExist?: boolean } = {}) {
	const normalizedPath = normalizeLocalTextPath(path, '');
	const root = await requireOpenFolderRoot();
	const filesystemPath = resolvePathWithinRoot(root, normalizedPath);

	if (options.mustExist === false) {
		return filesystemPath;
	}

	const fileStats = await stat(filesystemPath);

	if (!fileStats.isFile()) {
		throw new Error(`${normalizedPath} is not a file.`);
	}

	return filesystemPath;
}

async function resolvePostedPreviewSourceContext(
	path: string,
	requestRoot?: string
): Promise<PreviewSourceContext> {
	const root = requestRoot?.trim()
		? resolve(requestRoot)
		: await getOpenFolderRoot();

	if (!root) {
		return {};
	}

	return {
		sourcePath: resolvePathWithinRoot(root, path),
		sourceRoot: root
	};
}

function getOpenFolderNoteHref(notePath: string, heading: string) {
	const params = new URLSearchParams({ note: notePath });

	if (heading) {
		params.set('heading', heading);
	}

	return `#${params.toString()}`;
}

function getOpenFolderNotePaths(files: LocalVaultFile[]) {
	return files
		.filter((file) => file.extension === '.md' || file.extension === '.svx' || file.extension === '.svelte')
		.map((file) => file.routePath);
}

function getOpenFolderEmbedContent(notePath: string, vaultIndex: VaultIndex) {
	const normalizedNotePath = notePath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');

	return (
		vaultIndex.recordsByRoutePath.get(normalizedNotePath)?.content ??
		vaultIndex.recordsByPath.get(normalizedNotePath)?.content ??
		null
	);
}

function getPathExtension(path: string) {
	const fileName = path.split('/').at(-1) ?? '';
	const index = fileName.lastIndexOf('.');

	return index > 0 ? fileName.slice(index).toLowerCase() : '';
}

function isOpenFolderBoardFile(path: string) {
	return /\.(?:dhboard)\.(?:json|ya?ml)$/iu.test(path);
}

function isNotFoundError(error: unknown) {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

