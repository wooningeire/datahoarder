import { describe, expect, it } from 'vitest';
import {
	getServerPreviewRoute,
	isSvelteKitRoutePreviewFile,
	shouldFrameServerPreview
} from './server-preview.js';
import { createWhiteboardNoteDraft } from '../../drawings/preview.js';
import type { LocalVaultFile } from '../../vault/local-files.js';

describe('server preview routing', () => {
	it('frames route files from browser-opened folders', () => {
		expect(shouldFrameServerPreview(createBrowserFile('src/routes/+layout.svelte'), '')).toBe(true);
		expect(shouldFrameServerPreview(createBrowserFile('src/routes/notes/+page.svelte'), '')).toBe(true);
		expect(shouldFrameServerPreview(createBrowserFile('notes/Index.md'), '# Index')).toBe(false);
	});

	it('frames supported files from process-backed folders', () => {
		expect(shouldFrameServerPreview(createServerFile('src/routes/+layout.svelte'), '')).toBe(true);
		expect(shouldFrameServerPreview(createServerFile('src/routes/+page.server.ts'), '')).toBe(true);
		expect(shouldFrameServerPreview(createServerFile('notes/Index.md'), '# Index')).toBe(true);
		expect(shouldFrameServerPreview(createServerFile('boards/Map.dhboard.json'), '{}')).toBe(true);
	});

	it('keeps local-only preview types out of the server iframe', () => {
		expect(shouldFrameServerPreview(createServerFile('Notes.base'), '')).toBe(false);
		expect(shouldFrameServerPreview(createServerFile('Canvas.svx'), createWhiteboardNoteDraft('Canvas').content)).toBe(false);
	});

	it('encodes preview route paths', () => {
		expect(getServerPreviewRoute(createServerFile('Nested/Route Card.md'))).toBe(
			'/preview/Nested/Route%20Card.md?v=123'
		);
	});

	it('recognizes SvelteKit page and layout route files', () => {
		expect(isSvelteKitRoutePreviewFile('src/routes/+layout.svelte')).toBe(true);
		expect(isSvelteKitRoutePreviewFile('src/routes/notes/+page.server.ts')).toBe(true);
		expect(isSvelteKitRoutePreviewFile('src/routes/api/vault/+server.ts')).toBe(false);
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
