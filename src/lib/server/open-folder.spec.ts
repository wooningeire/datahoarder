import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	getOpenFolderMetadata,
	listOpenFolderFiles,
	readOpenFolderTextFile,
	renderOpenFolderPreviewDocument,
	renderOpenFolderPreviewFragment
} from './open-folder.js';

type DenoEnvHost = typeof globalThis & {
	Deno?: {
		env: {
			delete: (name: string) => void;
			get: (name: string) => string | undefined;
			set: (name: string, value: string) => void;
		};
	};
};

const root = resolve('test-results/server-open-folder-spec');
const envName = 'DATAHOARDER_OPEN_FOLDER';
const previewOriginEnvName = 'DATAHOARDER_PREVIEW_ORIGIN';
const previewRouteBaseEnvName = 'DATAHOARDER_PREVIEW_ROUTE_BASE';
const previousRoot = getEnv(envName);
const previousPreviewOrigin = getEnv(previewOriginEnvName);
const previousPreviewRouteBase = getEnv(previewRouteBaseEnvName);

afterEach(async () => {
	restoreEnv(envName, previousRoot);
	restoreEnv(previewOriginEnvName, previousPreviewOrigin);
	restoreEnv(previewRouteBaseEnvName, previousPreviewRouteBase);

	await rm(root, { force: true, recursive: true });
});

describe('open folder server vault', () => {
	it('lists editable files from the configured process folder', async () => {
		await seedOpenFolder({
			'Index.md': '# Index\n\nHello.',
			'Nested/Card.svx': '# Card',
			'node_modules/ignored.md': '# Ignored',
			'image.png': 'not text'
		});

		const metadata = await getOpenFolderMetadata();
		const files = await listOpenFolderFiles();

		expect(metadata.enabled).toBe(true);
		expect(metadata.root).toBe(root);
		expect(files.map((file) => file.path)).toEqual(['Index.md', 'Nested/Card.svx']);
		expect(files[0]?.routePath).toBe('Index');
	});

	it('renders markdown preview fragments through the server route renderer', async () => {
		await seedOpenFolder({
			'Index.md': '# Index\n\n- [ ] Routed task'
		});

		const html = await renderOpenFolderPreviewFragment({
			content: '# Draft\n\n- [x] Routed task',
			interactiveTaskLists: true,
			path: 'Index.md'
		});

		expect(html).toContain('<h1>Draft</h1>');
		expect(html).toContain('data-task-index="0"');
		expect(html).toContain('checked');
	});

	it('embeds the configured Vite server page in preview documents', async () => {
		await seedOpenFolder({
			'Nested/Card.md': '# Card',
			'src/routes/notes/+page.svelte': '<h1>Notes</h1>'
		});
		setEnv(previewOriginEnvName, 'http://127.0.0.1:5174');
		setEnv(previewRouteBaseEnvName, '/notes');

		const markdownHtml = await renderOpenFolderPreviewDocument({ path: 'Nested/Card.md' });
		const routeHtml = await renderOpenFolderPreviewDocument({ path: 'src/routes/notes/+page.svelte' });

		expect(markdownHtml).toContain('class="server-vite-preview-frame"');
		expect(markdownHtml).toContain('src="http://127.0.0.1:5174/notes/Nested/Card"');
		expect(routeHtml).toContain('class="server-vite-preview-frame"');
		expect(routeHtml).toContain('src="http://127.0.0.1:5174/notes"');
		expect(routeHtml).not.toContain('/notes/src/routes/notes/');
	});

	it('rejects paths outside the open folder', async () => {
		await seedOpenFolder({
			'Index.md': '# Index'
		});

		await expect(readOpenFolderTextFile('../outside.md')).rejects.toThrow('File paths cannot contain . or .. segments.');
	});
});

async function seedOpenFolder(files: Record<string, string>) {
	await rm(root, { force: true, recursive: true });

	for (const [path, content] of Object.entries(files)) {
		const filePath = resolve(root, ...path.split('/'));

		await mkdir(resolve(filePath, '..'), { recursive: true });
		await writeFile(filePath, content, 'utf8');
	}

	setEnv(envName, root);
}

function getEnv(name: string) {
	const host = globalThis as DenoEnvHost;

	return host.Deno?.env.get(name);
}

function setEnv(name: string, value: string) {
	const host = globalThis as DenoEnvHost;

	host.Deno?.env.set(name, value);
}

function deleteEnv(name: string) {
	const host = globalThis as DenoEnvHost;

	host.Deno?.env.delete(name);
}

function restoreEnv(name: string, value: string | undefined) {
	if (value === undefined) {
		deleteEnv(name);
		return;
	}

	setEnv(name, value);
}
