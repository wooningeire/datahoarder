import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { renderDatahoarderBoard } from '../boards/local-board.js';
import { renderExcalidrawNotePreview, renderWhiteboardNotePreview } from '../drawings/preview.js';
import { renderPortableMarkdown } from '../markdown/render.js';
import { isExcalidrawNote, isWhiteboardNote } from '../note-model/raw.js';
import { buildLocalVaultIndex } from '../vault/index.js';
import {
	getLocalRoutePath,
	isEditableTextFile,
	normalizeLocalTextPath,
	type LocalFileHandle,
	type LocalVaultFile
} from '../vault/local-files.js';
import { stripCompiledNoteExtension } from '../vault/paths.js';

type EnvGlobal = typeof globalThis & {
	Deno?: {
		env?: {
			get: (name: string) => string | undefined;
		};
	};
	process?: {
		env?: Record<string, string | undefined>;
	};
};

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
};

const ignoredDirectories = new Set(['.git', '.svelte-kit', 'build', 'dist', 'node_modules']);

export async function getOpenFolderMetadata(): Promise<OpenFolderMetadata> {
	const root = await getOpenFolderRoot();

	return {
		enabled: Boolean(root),
		name: root ? basename(root) : '',
		previewOrigin: getEnv('DATAHOARDER_PREVIEW_ORIGIN') ?? '',
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
	const previewHref = getWorkspacePreviewHref(file.path);

	if (previewHref) {
		return renderPreviewFrame(file.routePath, previewHref);
	}

	if (file.extension === '.md' && isExcalidrawNote(content)) {
		return renderExcalidrawNotePreview(content);
	}

	if (file.extension === '.svx' && isWhiteboardNote(content)) {
		return renderWhiteboardNotePreview(content);
	}

	if (file.extension === '.md' || file.extension === '.svx') {
		const vaultIndex = await buildLocalVaultIndex(files);

		return renderPortableMarkdown(content, {
			currentPath: file.routePath,
			interactiveTaskLists: request.interactiveTaskLists ?? false,
			notePaths: getOpenFolderNotePaths(files),
			resolveEmbedContent: (notePath) => getOpenFolderEmbedContent(notePath, vaultIndex),
			resolveNoteHref: getOpenFolderNoteHref
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

export async function renderOpenFolderPreviewDocument(request: OpenFolderPreviewRequest) {
	const title = basename(request.path);
	const previewHref = getWorkspacePreviewHref(request.path);
	const body = previewHref
		? renderPreviewFrame(request.path, previewHref)
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
		'.server-vite-preview-frame{display:block;width:100%;min-height:calc(100vh - 2rem);border:1px solid oklch(0.78 0.04 235);border-radius:.35rem;background:white}',
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

async function getOpenFolderRoot() {
	const rawRoot =
		getEnv('DATAHOARDER_OPEN_FOLDER') ??
		getEnv('DATAHOARDER_VAULT_ROOT') ??
		getEnv('DATAHOARDER_WORKSPACE_ROOT');

	if (!rawRoot?.trim()) {
		return null;
	}

	const root = resolve(rawRoot);

	try {
		const rootStats = await stat(root);

		return rootStats.isDirectory() ? root : null;
	} catch {
		return null;
	}
}

async function requireOpenFolderRoot() {
	const root = await getOpenFolderRoot();

	if (!root) {
		throw new Error('Set DATAHOARDER_OPEN_FOLDER to a folder before using the server vault.');
	}

	return root;
}

async function resolveOpenFolderTextPath(path: string, options: { mustExist?: boolean } = {}) {
	const normalizedPath = normalizeLocalTextPath(path, '');
	const root = await requireOpenFolderRoot();
	const filesystemPath = resolve(root, ...normalizedPath.split('/'));

	if (filesystemPath !== root && !filesystemPath.startsWith(`${root}${sep}`)) {
		throw new Error('Path escapes the opened folder.');
	}

	if (options.mustExist === false) {
		return filesystemPath;
	}

	const fileStats = await stat(filesystemPath);

	if (!fileStats.isFile()) {
		throw new Error(`${normalizedPath} is not a file.`);
	}

	return filesystemPath;
}

function getEnv(name: string) {
	const host = globalThis as EnvGlobal;

	return host.Deno?.env?.get(name) ?? host.process?.env?.[name];
}

function getOpenFolderNotePaths(files: LocalVaultFile[]) {
	return files
		.filter((file) => file.extension === '.md' || file.extension === '.svx' || file.extension === '.svelte')
		.map((file) => file.routePath);
}

function getOpenFolderEmbedContent(notePath: string, vaultIndex: Awaited<ReturnType<typeof buildLocalVaultIndex>>) {
	const normalizedNotePath = notePath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');

	return (
		vaultIndex.recordsByRoutePath.get(normalizedNotePath)?.content ??
		vaultIndex.recordsByPath.get(normalizedNotePath)?.content ??
		null
	);
}

function getOpenFolderNoteHref(notePath: string, heading: string) {
	const params = new URLSearchParams({ note: notePath });

	if (heading) {
		params.set('heading', heading);
	}

	return `#${params.toString()}`;
}

function renderPreviewFrame(routePath: string, href: string) {
	return `<iframe class="server-vite-preview-frame" src="${escapeHtml(href)}" title="${escapeHtml(routePath)} preview"></iframe>`;
}

function getWorkspacePreviewHref(routePath: string) {
	const previewOrigin = getEnv('DATAHOARDER_PREVIEW_ORIGIN');

	if (!previewOrigin) {
		return '';
	}

	const routeBase = normalizeRouteBase(getEnv('DATAHOARDER_PREVIEW_ROUTE_BASE') ?? '/notes');
	const svelteKitRoutePath = getSvelteKitRoutePath(routePath);
	const previewPath = svelteKitRoutePath ?? joinPreviewRouteBase(routeBase, stripCompiledNoteExtension(routePath));
	const url = new URL(previewPath || '/', previewOrigin);

	return url.href;
}

function getSvelteKitRoutePath(path: string) {
	const normalizedPath = path.replace(/\\/gu, '/');
	const routePrefix = 'src/routes/';
	const routePrefixIndex = normalizedPath.indexOf(routePrefix);

	if (routePrefixIndex < 0) {
		return null;
	}

	const relativeRouteFilePath = normalizedPath.slice(routePrefixIndex + routePrefix.length);
	const segments = relativeRouteFilePath.split('/').filter(Boolean);
	const fileName = segments.pop() ?? '';

	if (!/^\+(?:page|layout)(?:@[^.]+)?(?:\.server)?\.(?:svelte|ts|js)$/u.test(fileName)) {
		return null;
	}

	const routeSegments = segments
		.map(getSvelteKitPreviewRouteSegment)
		.filter((segment) => segment !== '');

	return `/${routeSegments.map(encodeURIComponent).join('/')}`;
}

function getSvelteKitPreviewRouteSegment(segment: string) {
	if (/^\(.+\)$/u.test(segment) || segment.startsWith('@')) {
		return '';
	}

	if (/^\[\[?\.{3}.+\]?\]$/u.test(segment) || /^\[.+\]$/u.test(segment)) {
		return '';
	}

	return segment;
}

function joinPreviewRouteBase(routeBase: string, path: string) {
	const encodedPath = path
		.replace(/^\/+|\/+$/gu, '')
		.split('/')
		.filter(Boolean)
		.map(encodeURIComponent)
		.join('/');

	if (!encodedPath) {
		return routeBase || '/';
	}

	return `${routeBase}/${encodedPath}`.replace(/\/{2,}/gu, '/');
}

function normalizeRouteBase(routeBase: string) {
	if (!routeBase || routeBase === '/') {
		return '';
	}

	return `/${routeBase.replace(/^\/+|\/+$/gu, '')}`;
}

function isOpenFolderBoardFile(path: string) {
	return /\.(?:dhboard)\.(?:json|ya?ml)$/iu.test(path);
}

function isNotFoundError(error: unknown) {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function escapeHtml(text: string) {
	return text.replace(/[&<>"']/gu, (character) => {
		switch (character) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			case "'":
				return '&#39;';
			default:
				return character;
		}
	});
}
