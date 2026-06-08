import { describe, expect, it } from 'vitest';
import {
	getServerPreviewRoute,
	getSelectedServerPreviewRoute,
	getTargetPreviewNotice,
	getTargetPreviewRoute,
	isSvelteKitRoutePreviewFile,
	shouldFrameServerPreview
} from './server-preview.js';
import type { LocalVaultFile } from '../../vault/local-files.js';

describe('server preview routing', () => {
	it('frames route files from browser-opened folders', () => {
		expect(shouldFrameServerPreview(createBrowserFile('src/routes/+layout.svelte'), '')).toBe(true);
		expect(shouldFrameServerPreview(createBrowserFile('src/routes/notes/+page.svelte'), '')).toBe(true);
		expect(shouldFrameServerPreview(createBrowserFile('+page.svelte'), '')).toBe(true);
		expect(shouldFrameServerPreview(createBrowserFile('notes/+page.svelte'), '')).toBe(true);
		expect(shouldFrameServerPreview(createBrowserFile('notes/Dashboard.svelte'), '')).toBe(false);
		expect(shouldFrameServerPreview(createBrowserFile('notes/Index.md'), '# Index')).toBe(false);
	});

	it('frames supported files from process-backed folders', () => {
		expect(shouldFrameServerPreview(createServerFile('src/routes/+layout.svelte'), '')).toBe(true);
		expect(shouldFrameServerPreview(createServerFile('src/routes/+page.server.ts'), '')).toBe(true);
		expect(shouldFrameServerPreview(createServerFile('+page.svelte'), '')).toBe(true);
		expect(shouldFrameServerPreview(createServerFile('notes/Dashboard.svelte'), '')).toBe(true);
		expect(shouldFrameServerPreview(createServerFile('notes/Index.md'), '# Index')).toBe(true);
		expect(shouldFrameServerPreview(createServerFile('boards/Map.dhboard.json'), '{}')).toBe(true);
	});

	it('keeps local-only preview types out of the server iframe', () => {
		expect(shouldFrameServerPreview(createServerFile('Notes.base'), '')).toBe(false);
	});

	it('encodes preview route paths', () => {
		expect(getServerPreviewRoute(createServerFile('Nested/Route Card.md'))).toBe(
			'/preview/Nested/Route%20Card.md?v=123'
		);
		expect(getServerPreviewRoute(createServerFile('Nested/Route Card.md'), { reloadToken: 2 })).toBe(
			'/preview/Nested/Route%20Card.md?v=123&r=2'
		);
	});

	it('routes selected process-backed notes through Datahoarder preview frames', () => {
		expect(getSelectedServerPreviewRoute(
			createServerFile('Notes/Index.md'),
			'# Index',
			{ reloadToken: 2 }
		)).toBe('/preview/Notes/Index.md?v=123&r=2');
		expect(getSelectedServerPreviewRoute(
			createServerFile('Notes/Page.svx'),
			'# Page'
		)).toBe('/preview/Notes/Page.svx?v=123');
		expect(getSelectedServerPreviewRoute(
			createServerFile('Notes/Dashboard.svelte'),
			'<h1>Dashboard</h1>'
		)).toBe('/preview/Notes/Dashboard.svelte?v=123');
		expect(getSelectedServerPreviewRoute(
			createBrowserFile('Notes/Index.md'),
			'# Index'
		)).toBe('');
	});

	it('uses the Tauri-managed target origin for SvelteKit route files', () => {
		expect(getTargetPreviewRoute(createTauriFile('src/routes/notes/+page.svelte'))).toBe(
			'http://127.0.0.1:5174/notes'
		);
		expect(getTargetPreviewRoute(createTauriFile('src/routes/+page.svelte', ''), 'http://127.0.0.1:5176')).toBe(
			'http://127.0.0.1:5176/'
		);
		expect(getTargetPreviewRoute(createTauriFile('src/routes/+layout.svelte'))).toBe(
			'http://127.0.0.1:5174/'
		);
		expect(getTargetPreviewRoute(createTauriFile('src/routes/api/+server.ts'))).toBe('');
		expect(getTargetPreviewRoute(createTauriFile('src/routes/notes/+page.svelte', ''))).toBe('');
	});

	it('keeps native route files out of the source-only fallback while target preview starts', () => {
		expect(getTargetPreviewNotice(
			createTauriFile('src/routes/+page.svelte', ''),
			'',
			''
		)).toEqual({
			description: 'Starting the target Deno server for src/routes/+page.svelte.',
			title: 'Starting Preview'
		});
		expect(getTargetPreviewNotice(
			createTauriFile('src/routes/+page.svelte', ''),
			'',
			'No target server'
		)).toEqual({
			description: 'No target server',
			title: 'Target Preview Failed'
		});
		expect(getTargetPreviewNotice(
			createTauriFile('src/routes/+page.svelte'),
			'http://127.0.0.1:5174/',
			''
		)).toBeNull();
		expect(getTargetPreviewNotice(createTauriFile('Index.md', ''), '', '')).toBeNull();
	});

	it('recognizes SvelteKit page and layout route files', () => {
		expect(isSvelteKitRoutePreviewFile('src/routes/+layout.svelte')).toBe(true);
		expect(isSvelteKitRoutePreviewFile('src/routes/notes/+page.server.ts')).toBe(true);
		expect(isSvelteKitRoutePreviewFile('/+page.svelte')).toBe(true);
		expect(isSvelteKitRoutePreviewFile('routes/+page.svelte')).toBe(true);
		expect(isSvelteKitRoutePreviewFile('src/routes/api/vault/+server.ts')).toBe(false);
		expect(isSvelteKitRoutePreviewFile('src/lib/+page.svelte')).toBe(false);
	});
});

function createBrowserFile(path: string): LocalVaultFile {
	return createFile(path, {
		kind: 'file',
		name: path.split('/').at(-1) ?? path,
		getFile: async () => new File([''], path)
	});
}

function createServerFile(path: string): LocalVaultFile {
	return createFile(path, {
		kind: 'file',
		name: path.split('/').at(-1) ?? path,
		path,
		source: 'server',
		getFile: async () => new File([''], path)
	});
}

function createTauriFile(path: string, previewOrigin = 'http://127.0.0.1:5174'): LocalVaultFile {
	return createFile(path, {
		kind: 'file',
		name: path.split('/').at(-1) ?? path,
		path,
		previewOrigin,
		previewRouteBase: '/notes',
		root: 'C:\\vault',
		source: 'tauri',
		targetProjectRoot: 'C:\\vault',
		getFile: async () => new File([''], path)
	});
}

function createFile(path: string, handle: LocalVaultFile['handle']): LocalVaultFile {
	return {
		extension: getExtension(path),
		handle,
		path,
		routePath: path,
		size: 0,
		updatedAt: 123
	};
}

function getExtension(path: string) {
	const fileName = path.split('/').at(-1) ?? '';
	const index = fileName.lastIndexOf('.');

	return index > 0 ? fileName.slice(index).toLowerCase() : '';
}
