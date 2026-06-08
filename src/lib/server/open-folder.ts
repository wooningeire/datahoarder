import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { basename, dirname, resolve, sep } from 'node:path';
import process from 'node:process';
import { renderDatahoarderBoard } from '../boards/local-board.js';
import {
	isWhiteboardNoteContent,
	renderWhiteboardNotePreview
} from '../drawings/preview.js';
import {
	getLocalRoutePath,
	isEditableTextFile,
	normalizeLocalTextPath,
	type LocalFileHandle,
	type LocalVaultFile
} from '../vault/local-files.js';
import { getSvelteKitRoutePath } from '../shared/sveltekit-routes.js';
import {
	isSvelteMarkupNotePreviewFile,
	renderSvelteNotePreview
} from './svelte-note.js';

type EnvGlobal = typeof globalThis & {
	Deno?: {
		execPath?: () => string;
		env?: {
			get: (name: string) => string | undefined;
			toObject?: () => Record<string, string>;
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

type TargetPreviewServer = {
	child: ReturnType<typeof spawn>;
	origin: string;
	projectRoot: string;
	root: string;
};

type TargetPreviewOriginResolver = (root: string) => Promise<string>;

const defaultTargetDevHost = '127.0.0.1';
const defaultTargetDevPort = 5174;
const defaultTargetDevPortSearchLimit = 25;
const defaultTargetDevTask = 'dev';
const defaultTargetDevWaitTimeoutMs = 60_000;
const previewOriginHealthTimeoutMs = 500;
const ignoredDirectories = new Set(['.git', '.svelte-kit', 'build', 'dist', 'node_modules']);
let targetPreviewServer: TargetPreviewServer | null = null;
let targetPreviewServerPromise: Promise<TargetPreviewServer | null> | null = null;
let targetPreviewOriginResolver: TargetPreviewOriginResolver = startOpenFolderTargetPreviewServer;
let targetPreviewCleanupRegistered = false;

export function setOpenFolderTargetPreviewOriginResolverForTest(
	resolver: TargetPreviewOriginResolver
) {
	const previousResolver = targetPreviewOriginResolver;

	targetPreviewOriginResolver = resolver;

	return () => {
		targetPreviewOriginResolver = previousResolver;
	};
}

export async function getOpenFolderMetadata(): Promise<OpenFolderMetadata> {
	const root = await getOpenFolderRoot();
	const previewOrigin = await getWorkspacePreviewOrigin({
		startIfMissing: false,
		verify: true
	});

	return {
		enabled: Boolean(root),
		name: root ? basename(root) : '',
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

	if (isSvelteMarkupNotePreviewFile(file.path)) {
		return renderSvelteNotePreview(content, file);
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
	const file = {
		extension: getPathExtension(normalizedPath),
		path: normalizedPath,
		routePath: normalizedPath,
		size: content.length,
		updatedAt: content.length
	};

	if (isWhiteboardNoteContent(content)) {
		return renderWhiteboardNotePreview(content);
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

function getOpenFolderNoteHref(notePath: string, heading: string) {
	const params = new URLSearchParams({ note: notePath });

	if (heading) {
		params.set('heading', heading);
	}

	return `#${params.toString()}`;
}

function getPathExtension(path: string) {
	const fileName = path.split('/').at(-1) ?? '';
	const index = fileName.lastIndexOf('.');

	return index > 0 ? fileName.slice(index).toLowerCase() : '';
}

function renderPreviewFrame(routePath: string, href: string) {
	return `<iframe class="server-vite-preview-frame" src="${escapeHtml(href)}" title="${escapeHtml(routePath)} preview"></iframe>`;
}

function renderPreviewServerRequired(routePath: string) {
	return [
		'<section class="server-preview-required">',
		'<h1>Preview Server Required</h1>',
		`<p>${escapeHtml(routePath)} is a SvelteKit route file, but Datahoarder could not start or find that app's target Deno server.</p>`,
		'</section>'
	].join('');
}

async function getSvelteKitRoutePreviewHref(routePath: string) {
	const svelteKitRoutePath = getSvelteKitRoutePath(routePath);

	if (svelteKitRoutePath === null) {
		return '';
	}

	const previewOrigin = await getWorkspacePreviewOrigin({
		startIfMissing: true,
		verify: true
	});

	return previewOrigin ? new URL(svelteKitRoutePath || '/', previewOrigin).href : '';
}

async function getWorkspacePreviewOrigin(options: { startIfMissing: boolean; verify: boolean }) {
	if (targetPreviewServer) {
		if (!options.verify || await isPreviewOriginResponsive(targetPreviewServer.origin)) {
			return targetPreviewServer.origin;
		}

		stopTargetPreviewServer();
	}

	const launchedOrigin = getEnv('DATAHOARDER_TARGET_DEV_ORIGIN') ?? '';

	if (launchedOrigin && (!options.verify || await isPreviewOriginResponsive(launchedOrigin))) {
		return launchedOrigin;
	}

	if (!options.startIfMissing) {
		return '';
	}

	const root = await getOpenFolderRoot();

	if (!root) {
		return '';
	}

	return targetPreviewOriginResolver(root);
}

async function startOpenFolderTargetPreviewServer(root: string) {
	if (isTargetDevServerDisabled()) {
		return '';
	}

	if (targetPreviewServer?.root === root) {
		if (await isPreviewOriginResponsive(targetPreviewServer.origin)) {
			return targetPreviewServer.origin;
		}

		stopTargetPreviewServer();
	}

	if (targetPreviewServerPromise) {
		return (await targetPreviewServerPromise)?.origin ?? '';
	}

	targetPreviewServerPromise = startTargetPreviewServer(root);

	try {
		return (await targetPreviewServerPromise)?.origin ?? '';
	} finally {
		targetPreviewServerPromise = null;
	}
}

async function startTargetPreviewServer(root: string) {
	stopTargetPreviewServer();

	const projectRoot = await resolveTargetProjectRoot(root);

	if (!projectRoot) {
		return null;
	}

	const host = normalizeHost(getEnv('DATAHOARDER_TARGET_DEV_HOST') ?? defaultTargetDevHost);
	const preferredPort = normalizePort(
		getEnv('DATAHOARDER_TARGET_DEV_PORT') ?? String(defaultTargetDevPort),
		'preferred target dev port'
	);
	const searchLimit = normalizeSearchLimit(
		getEnv('DATAHOARDER_TARGET_DEV_PORT_SEARCH_LIMIT') ?? String(defaultTargetDevPortSearchLimit)
	);
	const task = normalizeTaskName(getEnv('DATAHOARDER_TARGET_DEV_TASK') ?? defaultTargetDevTask);
	const port = await findAvailablePort(host, preferredPort, searchLimit);
	const origin = getDevUrl(host, port);
	const child = spawn(getDenoExecutable(), [
		'task',
		task,
		'--host',
		host,
		'--port',
		String(port),
		'--strictPort'
	], {
		cwd: projectRoot,
		env: {
			...getCommandEnv(),
			DATAHOARDER_TARGET_DEV_ORIGIN: origin,
			DATAHOARDER_TARGET_DEV_ROOT: projectRoot,
			HOST: host,
			PORT: String(port),
			VITE_HOST: host,
			VITE_PORT: String(port)
		},
		stdio: 'inherit'
	});

	try {
		await waitForHttpResponse(origin, child);
	} catch (error) {
		stopChild(child);
		throw error;
	}

	targetPreviewServer = {
		child,
		origin,
		projectRoot,
		root
	};
	registerTargetPreviewCleanup();

	return targetPreviewServer;
}

async function isPreviewOriginResponsive(origin: string) {
	try {
		await connectPreviewOrigin(origin);
		return true;
	} catch {
		return false;
	}
}

function connectPreviewOrigin(origin: string) {
	const url = new URL(origin);
	const host = url.hostname;
	const port = normalizeOriginPort(url);

	return new Promise<void>((resolveConnection, rejectConnection) => {
		const socket = connect({ host, port });
		const timeout = setTimeout(() => {
			socket.destroy();
			rejectConnection(new Error(`Timed out connecting to ${origin}.`));
		}, previewOriginHealthTimeoutMs);

		socket.once('connect', () => {
			clearTimeout(timeout);
			socket.end();
			resolveConnection();
		});
		socket.once('error', (error) => {
			clearTimeout(timeout);
			rejectConnection(error);
		});
	});
}

function normalizeOriginPort(url: URL) {
	if (url.port) {
		return normalizePort(url.port, 'preview origin port');
	}

	return url.protocol === 'https:' ? 443 : 80;
}

async function resolveTargetProjectRoot(root: string) {
	const configuredRoot = getEnv('DATAHOARDER_TARGET_DEV_ROOT')?.trim();

	if (configuredRoot) {
		const projectRoot = resolve(configuredRoot);
		const metadata = await stat(projectRoot);

		if (!metadata.isDirectory()) {
			throw new Error(`Target Deno project root is not a directory: ${projectRoot}`);
		}

		if (await hasDenoConfig(projectRoot)) {
			return projectRoot;
		}

		throw new Error(`Target Deno project root must contain deno.json or deno.jsonc: ${projectRoot}`);
	}

	let current = root;

	while (true) {
		if (await hasDenoConfig(current)) {
			return current;
		}

		const parent = dirname(current);

		if (parent === current) {
			return null;
		}

		current = parent;
	}
}

async function hasDenoConfig(root: string) {
	for (const name of ['deno.json', 'deno.jsonc']) {
		try {
			const metadata = await stat(resolve(root, name));

			if (metadata.isFile()) {
				return true;
			}
		} catch {
			// Try the alternate Deno config file name.
		}
	}

	return false;
}

async function findAvailablePort(host: string, preferredPort: number, searchLimit: number) {
	const maxPort = Math.min(65535, preferredPort + searchLimit);

	for (let port = preferredPort; port <= maxPort; port += 1) {
		if (await canBindPort(host, port)) {
			return port;
		}
	}

	throw new Error(`Could not find an available target dev port from ${preferredPort} through ${maxPort}.`);
}

function canBindPort(host: string, port: number) {
	return new Promise<boolean>((resolvePort) => {
		const server = createServer();

		server.once('error', () => resolvePort(false));
		server.listen(port, host, () => {
			server.close(() => resolvePort(true));
		});
	});
}

async function waitForHttpResponse(
	origin: string,
	child: ReturnType<typeof spawn>
) {
	const deadline = Date.now() + normalizeWaitTimeoutMs();
	const childExit: { value: { code: number | null; signal: NodeJS.Signals | null } | null } = {
		value: null
	};
	let lastError = '';

	child.once('exit', (code, signal) => {
		childExit.value = { code, signal };
	});

	while (Date.now() < deadline) {
		if (childExit.value) {
			throw new Error(
				`Target Deno server exited before responding at ${origin}: code ${childExit.value.code}, signal ${childExit.value.signal}.`
			);
		}

		try {
			await connectPreviewOrigin(origin);
			return;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}

		await delay(200);
	}

	throw new Error(`Timed out waiting for target Deno server at ${origin}: ${lastError}`);
}

function stopTargetPreviewServer() {
	if (!targetPreviewServer) {
		return;
	}

	const server = targetPreviewServer;

	targetPreviewServer = null;

	stopChild(server.child);
}

function stopChild(child: ReturnType<typeof spawn>) {
	if (child.exitCode !== null || child.killed) {
		return;
	}

	child.kill();
}

function registerTargetPreviewCleanup() {
	if (targetPreviewCleanupRegistered) {
		return;
	}

	targetPreviewCleanupRegistered = true;
	process.once('exit', stopTargetPreviewServer);
	process.once('SIGINT', () => {
		stopTargetPreviewServer();
		process.exit(130);
	});
	process.once('SIGTERM', () => {
		stopTargetPreviewServer();
		process.exit(143);
	});
}

function getCommandEnv() {
	const host = globalThis as EnvGlobal;

	return host.Deno?.env?.toObject?.() ?? process.env;
}

function getDenoExecutable() {
	const host = globalThis as EnvGlobal;

	return getEnv('DENO') ?? host.Deno?.execPath?.() ?? 'deno';
}

function isTargetDevServerDisabled() {
	const value = (getEnv('DATAHOARDER_TARGET_DEV_DISABLED') ?? '').trim().toLowerCase();

	return value === '1' || value === 'true';
}

function getDevUrl(host: string, port: number) {
	const normalizedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

	return `http://${normalizedHost}:${port}`;
}

function normalizeHost(value: string) {
	const host = value.trim();

	if (!host) {
		throw new Error('A target dev host is required.');
	}

	if (!/^[\w.:-]+$/u.test(host)) {
		throw new Error(`Invalid target dev host: ${host}`);
	}

	return host;
}

function normalizePort(value: string, label: string) {
	const port = Number(value);

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid ${label}: ${value}`);
	}

	return port;
}

function normalizeSearchLimit(value: string) {
	const limit = Number(value);

	if (!Number.isInteger(limit) || limit < 0 || limit > 200) {
		throw new Error(`Invalid target dev port search limit: ${value}`);
	}

	return limit;
}

function normalizeTaskName(value: string) {
	const task = value.trim();

	if (!task || /[\s"'`]/u.test(task)) {
		throw new Error(`Invalid target Deno task name: ${value}`);
	}

	return task;
}

function normalizeWaitTimeoutMs() {
	const value = getEnv('DATAHOARDER_TARGET_DEV_WAIT_TIMEOUT_MS');

	if (!value) {
		return defaultTargetDevWaitTimeoutMs;
	}

	const timeoutMs = Number(value);

	if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
		throw new Error(`Invalid target dev wait timeout: ${value}`);
	}

	return timeoutMs;
}

function delay(ms: number) {
	return new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms));
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
