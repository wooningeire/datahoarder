import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWhiteboardNoteDraft } from '../drawings/preview.js';
import {
	createOpenFolderDirectory,
	getOpenFolderMetadata,
	listOpenFolderDirectories,
	listOpenFolderFiles,
	readOpenFolderTextFile,
	renderOpenFolderPreviewDocument,
	renderOpenFolderPreviewFragment,
	renderPostedNotePreviewFragment,
	setOpenFolderTargetPreviewOriginResolverForTest
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
const previewRouteBaseEnvName = 'DATAHOARDER_PREVIEW_ROUTE_BASE';
const targetDevOriginEnvName = 'DATAHOARDER_TARGET_DEV_ORIGIN';
const targetDevDisabledEnvName = 'DATAHOARDER_TARGET_DEV_DISABLED';
const previousRoot = getEnv(envName);
const previousPreviewRouteBase = getEnv(previewRouteBaseEnvName);
const previousTargetDevOrigin = getEnv(targetDevOriginEnvName);
const previousTargetDevDisabled = getEnv(targetDevDisabledEnvName);
const svelteNotePreviewTimeoutMs = 60_000;
let restoreTargetPreviewOriginResolver = () => {};

afterEach(async () => {
	restoreTargetPreviewOriginResolver();
	restoreTargetPreviewOriginResolver = () => {};
	restoreEnv(envName, previousRoot);
	restoreEnv(previewRouteBaseEnvName, previousPreviewRouteBase);
	restoreEnv(targetDevOriginEnvName, previousTargetDevOrigin);
	restoreEnv(targetDevDisabledEnvName, previousTargetDevDisabled);

	await rm(root, { force: true, recursive: true });
});

describe('open folder server vault', () => {
	it('lists editable files from the configured process folder', async () => {
		await seedOpenFolder({
			'Index.md': '# Index\n\nHello.',
			'Nested/Card.svx': '# Card',
			'README': 'Plain text project note.',
			".obsidian/app.json": "{\"promptDelete\": false}",
			'node_modules/ignored.md': '# Ignored',
			'image.png': 'not text'
		});

		const metadata = await getOpenFolderMetadata();
		const files = await listOpenFolderFiles();

		expect(metadata.enabled).toBe(true);
		expect(metadata.root).toBe(root);
		expect(files.map((file) => file.path)).toEqual(['Index.md', 'Nested/Card.svx', 'README']);
		expect(files[0]?.routePath).toBe('Index');
	});

	it('creates empty folders and includes them in directory snapshots', async () => {
		await seedOpenFolder({
			'Projects/Seed.md': '# Seed'
		});

		const createdPath = await createOpenFolderDirectory('Archive/Empty');
		const directories = await listOpenFolderDirectories();

		expect(createdPath).toBe('Archive/Empty');
		expect(directories.map((directory) => directory.path)).toEqual([
			'Archive',
			'Archive/Empty',
			'Projects'
		]);
		await expect(createOpenFolderDirectory('Archive/Empty')).rejects.toThrow(
			'A folder already exists at Archive/Empty.'
		);
		await expect(createOpenFolderDirectory('Projects/Seed.md')).rejects.toThrow(
			'A file already exists at Projects/Seed.md.'
		);
	});

	it('renders markdown preview fragments through mdsvex and Svelte SSR', async () => {
		await seedOpenFolder({
			'Index.md': '# Index'
		});

		const html = await renderOpenFolderPreviewFragment({
			content: [
				'<script lang="ts">',
				'let x = $state(2);',
				'</script>',
				'',
				'# Draft {x}'
			].join('\n'),
			path: 'Index.md'
		});

		expect(html).toContain('<h1>Draft 2</h1>');
		expect(html).not.toContain('{x}');
		expect(html).not.toContain('&lt;script');
	}, svelteNotePreviewTimeoutMs);

	it('renders ordinary posted markdown through the portable renderer', async () => {
		const html = await renderPostedNotePreviewFragment({
			content: [
				'# Application Table',
				'',
				'- [ ] Call <client>',
				'',
				'| Company | Status | Count |',
				'| --- | :---: | ---: |',
				'| Acme <Labs> | **Open** | 3 |'
			].join('\n'),
			interactiveTaskLists: true,
			path: 'Application Table.md'
		});

		expect(html).toContain('class="markdown-table-wrapper"');
		expect(html).toContain('Acme &lt;Labs&gt;');
		expect(html).toContain('<input type="checkbox" data-task-index="0">');
		expect(html).not.toContain('Svelte Note Preview Failed');
		expect(html).not.toContain('Acme <Labs>');
	}, svelteNotePreviewTimeoutMs);

	it('renders ordinary open-folder markdown embeds with local vault context', async () => {
		await seedOpenFolder({
			'Parent.md': [
				'# Parent',
				'',
				'![[Components/Reusable#Summary|Reusable Card|name=Acme <Labs>|status=Interview]]'
			].join('\n'),
			'Components/Reusable.md': [
				'# Reusable',
				'',
				'## Summary',
				'### {{name}}',
				'status:: {{status}}'
			].join('\n')
		});

		const html = await renderOpenFolderPreviewFragment({
			path: 'Parent.md'
		});

		expect(html).toContain('class="note-embed"');
		expect(html).toContain('Reusable Card');
		expect(html).toContain('<h3>Acme &lt;Labs&gt;</h3>');
		expect(html).toContain('status:: Interview');
		expect(html).not.toContain('Svelte Note Preview Failed');
		expect(html).not.toContain('Acme <Labs>');
	}, svelteNotePreviewTimeoutMs);

	it('embeds explicit route files in target server preview documents', async () => {
		await seedOpenFolder({
			'Nested/Card.md': '# Card',
			'+page.svelte': '<h1>Home</h1>',
			'src/routes/notes/+page.svelte': '<h1>Notes</h1>'
		}, { targetDevDisabled: false });
		setEnv(targetDevOriginEnvName, 'http://127.0.0.1:5174');
		setEnv(previewRouteBaseEnvName, '/notes');
		restoreTargetPreviewOriginResolver = setOpenFolderTargetPreviewOriginResolverForTest(async () => {
			return 'http://127.0.0.1:5174';
		});

		const markdownHtml = await renderOpenFolderPreviewDocument({ path: 'Nested/Card.md' });
		const rootRouteHtml = await renderOpenFolderPreviewDocument({ path: '+page.svelte' });
		const slashRootRouteHtml = await renderOpenFolderPreviewDocument({ path: '/+page.svelte' });
		const routeHtml = await renderOpenFolderPreviewDocument({ path: 'src/routes/notes/+page.svelte' });

		expect(markdownHtml).toContain('<h1>Card</h1>');
		expect(markdownHtml).not.toContain('class="server-vite-preview-frame"');
		expect(rootRouteHtml).toContain('class="server-vite-preview-frame"');
		expect(rootRouteHtml).toContain('src="http://127.0.0.1:5174/"');
		expect(slashRootRouteHtml).toContain('src="http://127.0.0.1:5174/"');
		expect(routeHtml).toContain('class="server-vite-preview-frame"');
		expect(routeHtml).toContain('src="http://127.0.0.1:5174/notes"');
		expect(routeHtml).not.toContain('/notes/src/routes/notes/');
	}, svelteNotePreviewTimeoutMs);

	it('renders Svelte notes in the open-folder preview document', async () => {
		await seedOpenFolder({
			'Notes/Dashboard.svelte': [
				'<script>const title = "Local Svelte Dashboard";</script>',
				'<style>h1 { color: oklch(0.42 0.18 245); }</style>',
				'<h1>{title}</h1>'
			].join('\n')
		});

		const html = await renderOpenFolderPreviewDocument({ path: 'Notes/Dashboard.svelte' });

		expect(html).toContain('Local Svelte Dashboard');
		expect(html).toContain('oklch(0.42 0.18 245)');
		expect(html).toContain('datahoarder-svelte-note');
		expect(html).not.toContain('<iframe class="server-vite-preview-frame"');
		expect(html).not.toContain('Preview Server Required');
	}, svelteNotePreviewTimeoutMs);

	it('preprocesses posted Svelte note SCSS relative to the request root', async () => {
		const content = [
			'<style lang="scss">',
			'@use "$/styles/mixins";',
			'',
			'.kanban-board {',
			'    @include mixins.card;',
			'    align-items: flex-start; // Keeps columns from stretching',
			'',
			'    .kanban-column {',
			'        max-height: 100%; // Keeps cards inside the board',
			'    }',
			'}',
			'</style>',
			'<section class="kanban-board">',
			'    <article class="kanban-column">Task Kanban</article>',
			'</section>'
		].join('\n');

		await seedOpenFolder({
			'src/lib/datahoard/TaskKanban.svelte': content,
			'src/lib/styles/_mixins.scss': [
				'@mixin card {',
				'    color: oklch(0.42 0.12 160);',
				'}'
			].join('\n')
		});

		const html = await renderPostedNotePreviewFragment({
			content,
			path: 'src/lib/datahoard/TaskKanban.svelte',
			root
		});

		expect(html).toContain('Task Kanban');
		expect(html).toContain('oklch(42% 0.12 160deg)');
		expect(html).not.toContain('Svelte Note Preview Failed');
		expect(html).not.toContain('css_expected_identifier');
	}, svelteNotePreviewTimeoutMs);

	it('renders mdsvex notes in the open-folder preview document', async () => {
		await seedOpenFolder({
			'Notes/Counter.svx': [
				'<script lang="ts">',
				'let x = $state(1);',
				'</script>',
				'',
				'hello {x}'
			].join('\n')
		});

		const html = await renderOpenFolderPreviewDocument({ path: 'Notes/Counter.svx' });

		expect(html).toContain('<p>hello 1</p>');
		expect(html).not.toContain('&lt;script');
		expect(html).not.toContain('{x}');
		expect(html).not.toContain('<iframe class="server-vite-preview-frame"');
	}, svelteNotePreviewTimeoutMs);

	it('renders generated whiteboard SVX notes through the drawing preview path', async () => {
		const draft = createWhiteboardNoteDraft('Launch Map');

		await seedOpenFolder({
			'Drawings/Launch Map.svx': draft.content
		});

		const documentHtml = await renderOpenFolderPreviewDocument({ path: 'Drawings/Launch Map.svx' });
		const postedHtml = await renderPostedNotePreviewFragment({
			content: draft.content,
			path: 'Drawings/Launch Map.svx'
		});

		for (const html of [documentHtml, postedHtml]) {
			expect(html).toContain('class="whiteboard-preview-svg"');
			expect(html).toContain('aria-label="Launch Map whiteboard"');
			expect(html).toContain('Launch Map');
			expect(html).not.toContain('Svelte Note Preview Failed');
			expect(html).not.toContain('Unsupported imports');
		}
	}, svelteNotePreviewTimeoutMs);

	it('starts a target preview origin before requiring route-preview env', async () => {
		await seedOpenFolder({
			'deno.json': '{"tasks":{"dev":"deno run -A target.ts"}}',
			'src/routes/+page.svelte': '<h1>Target app root</h1>'
		}, { targetDevDisabled: false });
		let resolvedRoot = '';
		restoreTargetPreviewOriginResolver = setOpenFolderTargetPreviewOriginResolverForTest(async (root) => {
			resolvedRoot = root;
			return 'http://127.0.0.1:5175';
		});

		const routeHtml = await renderOpenFolderPreviewDocument({ path: 'src/routes/+page.svelte' });

		expect(resolvedRoot).toBe(root);
		expect(routeHtml).toContain('class="server-vite-preview-frame"');
		expect(routeHtml).toContain('src="http://127.0.0.1:5175/"');
		expect(routeHtml).not.toContain('Preview Server Required');
	});

	it('replaces a stale launched target origin before embedding route files', async () => {
		await seedOpenFolder({
			'deno.json': '{"tasks":{"dev":"deno run -A target.ts"}}',
			'src/routes/+page.svelte': '<h1>Target app root</h1>'
		}, { targetDevDisabled: false });
		setEnv(targetDevOriginEnvName, 'http://127.0.0.1:9');
		let resolvedRoot = '';
		restoreTargetPreviewOriginResolver = setOpenFolderTargetPreviewOriginResolverForTest(async (root) => {
			resolvedRoot = root;
			return 'http://127.0.0.1:5176';
		});

		const routeHtml = await renderOpenFolderPreviewDocument({ path: 'src/routes/+page.svelte' });

		expect(resolvedRoot).toBe(root);
		expect(routeHtml).toContain('class="server-vite-preview-frame"');
		expect(routeHtml).toContain('src="http://127.0.0.1:5176/"');
		expect(routeHtml).not.toContain('src="http://127.0.0.1:9/"');
	});

	it('does not embed Datahoarder itself when route previews have no configured origin', async () => {
		await seedOpenFolder({
			'src/routes/+page.svelte': '<h1>Target app root</h1>'
		});
		deleteEnv(previewRouteBaseEnvName);

		const routeHtml = await renderOpenFolderPreviewDocument({ path: 'src/routes/+page.svelte' });

		expect(routeHtml).toContain('Preview Server Required');
		expect(routeHtml).toContain('could not start or find');
		expect(routeHtml).not.toContain('class="server-vite-preview-frame"');
		expect(routeHtml).not.toContain('src="/"');
	});

	it('rejects paths outside the open folder', async () => {
		await seedOpenFolder({
			'Index.md': '# Index'
		});

		await expect(readOpenFolderTextFile('../outside.md')).rejects.toThrow('File paths cannot contain . or .. segments.');
	});
});

async function seedOpenFolder(
	files: Record<string, string>,
	options: { targetDevDisabled?: boolean } = {}
) {
	await rm(root, { force: true, recursive: true });

	for (const [path, content] of Object.entries(files)) {
		const filePath = resolve(root, ...path.split('/'));

		await mkdir(resolve(filePath, '..'), { recursive: true });
		await writeFile(filePath, content, 'utf8');
	}

	setEnv(envName, root);

	if (options.targetDevDisabled ?? true) {
		setEnv(targetDevDisabledEnvName, 'true');
	} else {
		deleteEnv(targetDevDisabledEnvName);
	}
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
