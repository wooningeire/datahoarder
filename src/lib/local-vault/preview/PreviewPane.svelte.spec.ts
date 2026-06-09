import type { ComponentProps } from 'svelte';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createEmptyVaultIndex } from '../../vault/index.js';
import type { LocalVaultFile } from '../../vault/local-files.js';
import PreviewPane from './PreviewPane.svelte';

type PreviewPaneProps = ComponentProps<typeof PreviewPane>;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('PreviewPane note preview', () => {
	it('frames process-backed markdown without reporting it as source-only', async () => {
		const file = createFile('Index.md', '# Server Markdown');

		await render(PreviewPane, createPreviewPaneProps({
			files: [file],
			selectedContent: '# Server Markdown',
			selectedFile: file
		}));

		expect(document.body.textContent).not.toContain('Source Only');
		expect(document.querySelector('.server-preview-frame')?.getAttribute('src')).toBe(
			'/preview/Index.md?v=0&r=1'
		);
	});

	it('renders browser markdown without reporting it as source-only', async () => {
		const file = createBrowserFile('Index.md', '# Browser Markdown');
		const fetchMock = mockPreviewResponse('<h1>Browser Markdown</h1>');

		await render(PreviewPane, createPreviewPaneProps({
			files: [file],
			selectedContent: '# Browser Markdown',
			selectedFile: file
		}));

		expect(document.body.textContent).not.toContain('Source Only');
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(getPreviewRequest(fetchMock)).toEqual({
			content: '# Browser Markdown',
			path: 'Index.md'
		});
		await expect.element(page.getByRole('heading', { name: 'Browser Markdown' })).toBeInTheDocument();
	});

	it('renders browser svx notes without reporting them as source-only', async () => {
		const file = createBrowserFile('Notes.svx', '# Browser SVX');
		const fetchMock = mockPreviewResponse('<h1>Browser SVX</h1>');

		await render(PreviewPane, createPreviewPaneProps({
			files: [file],
			selectedContent: '# Browser SVX',
			selectedFile: file
		}));

		expect(document.body.textContent).not.toContain('Source Only');
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(getPreviewRequest(fetchMock)).toEqual({
			content: '# Browser SVX',
			path: 'Notes.svx'
		});
		await expect.element(page.getByRole('heading', { name: 'Browser SVX' })).toBeInTheDocument();
	});

	it('renders browser svelte notes without reporting them as source-only', async () => {
		const file = createBrowserFile('Widget.svelte', '<h1>Browser Svelte</h1>');
		const fetchMock = mockPreviewResponse('<h1>Browser Svelte</h1>');

		await render(PreviewPane, createPreviewPaneProps({
			files: [file],
			selectedContent: '<h1>Browser Svelte</h1>',
			selectedFile: file
		}));

		expect(document.body.textContent).not.toContain('Source Only');
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(getPreviewRequest(fetchMock)).toEqual({
			content: '<h1>Browser Svelte</h1>',
			path: 'Widget.svelte'
		});
		await expect.element(page.getByRole('heading', { name: 'Browser Svelte' })).toBeInTheDocument();
	});

	it('posts the Tauri vault root for live Svelte markup previews', async () => {
		const file = createTauriFile('Widget.svelte', '<h1>Tauri Svelte</h1>', 'C:\\vault');
		const fetchMock = mockPreviewResponse('<h1>Tauri Svelte</h1>');

		await render(PreviewPane, createPreviewPaneProps({
			files: [file],
			selectedContent: '<h1>Tauri Svelte</h1>',
			selectedFile: file
		}));

		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(getPreviewRequest(fetchMock)).toEqual({
			content: '<h1>Tauri Svelte</h1>',
			path: 'Widget.svelte',
			root: 'C:\\vault'
		});
		await expect.element(page.getByRole('heading', { name: 'Tauri Svelte' })).toBeInTheDocument();
	});

	it('frames process-backed svelte notes without reporting them as source-only', async () => {
		const file = createFile('Dashboard.svelte', '<h1>Svelte note</h1>');

		await render(PreviewPane, createPreviewPaneProps({
			files: [file],
			selectedContent: '<h1>Svelte note</h1>',
			selectedFile: file
		}));

		expect(document.body.textContent).not.toContain('Source Only');
		expect(document.querySelector('.server-preview-frame')?.getAttribute('src')).toContain(
			'/preview/Dashboard.svelte'
		);
	});
});

function createFile(path: string, content: string): LocalVaultFile {
	return {
		extension: path.includes('.') ? `.${path.split('.').at(-1) ?? ''}`.toLowerCase() : '',
		handle: {
			kind: 'file',
			name: path.split('/').at(-1) ?? path,
			path,
			source: 'server',
			getFile: async () => new File([content], path)
		},
		path,
		routePath: path,
		size: content.length,
		updatedAt: 0
	};
}

function mockPreviewResponse(html: string) {
	const fetchMock = vi.fn<typeof fetch>(async () => new Response(html, {
		headers: {
			'content-type': 'text/html'
		}
	}));

	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

function getPreviewRequest(fetchMock: ReturnType<typeof mockPreviewResponse>) {
	const body = fetchMock.mock.calls[0]?.[1]?.body;

	return typeof body === 'string' ? JSON.parse(body) : null;
}

function createBrowserFile(path: string, content: string): LocalVaultFile {
	const file = createFile(path, content);

	return {
		...file,
		handle: {
			kind: 'file',
			name: path.split('/').at(-1) ?? path,
			getFile: async () => new File([content], path)
		}
	};
}

function createTauriFile(path: string, content: string, root: string): LocalVaultFile {
	const file = createFile(path, content);

	return {
		...file,
		handle: {
			kind: 'file',
			name: path.split('/').at(-1) ?? path,
			path,
			previewOrigin: '',
			previewRouteBase: '/notes',
			root,
			source: 'tauri',
			targetProjectRoot: null,
			getFile: async () => new File([content], path)
		}
	};
}

function createPreviewPaneProps(overrides: Partial<PreviewPaneProps> = {}): PreviewPaneProps {
	return {
		baseViews: [],
		collectionCellEdit: null,
		collectionFilter: '',
		collectionKanbanGroupBy: '',
		collectionKanbanGroups: [],
		collectionRecordCreationError: '',
		collectionRecords: [],
		collectionSortColumn: '',
		collectionSortDirection: 'asc' as const,
		collectionSummaries: [],
		collectionTimelineDateField: '',
		collectionTimelineItems: [],
		files: [],
		hasVault: true,
		loading: false,
		saving: false,
		selectedBacklinks: [],
		selectedCollection: null,
		selectedContent: '',
		selectedFile: null,
		vaultIndex: createEmptyVaultIndex(),
		addFieldToSelectedCollection: vi.fn(),
		bulkSetCollectionField: vi.fn(),
		cancelCollectionCellEdit: vi.fn(),
		createCollectionRecord: vi.fn(),
		downloadCollectionExport: vi.fn(),
		editCollectionRecordField: vi.fn(),
		formatCollectionRecordValue: vi.fn(() => ''),
		handlePreviewChange: vi.fn(),
		handlePreviewClick: vi.fn(),
		isEditingCollectionCell: vi.fn(() => false),
		openBacklink: vi.fn(),
		openCollectionRecord: vi.fn(),
		saveCollectionCellEdit: vi.fn(async () => {}),
		selectCollectionView: vi.fn(),
		setCollectionFilter: vi.fn(),
		setPreviewHtml: vi.fn(),
		setSelectedContent: vi.fn(),
		sortCollectionBy: vi.fn(),
		updateCollectionCellEditValue: vi.fn(),
		...overrides
	};
}
