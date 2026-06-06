import { tick } from 'svelte';
import type { ComponentProps } from 'svelte';
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { updateWhiteboardNoteState } from '../../drawings/preview.js';
import { createEmptyVaultIndex } from '../../vault/index.js';
import type { LocalVaultFile } from '../../vault/local-files.js';
import PreviewPane from './PreviewPane.svelte';

type PreviewPaneProps = ComponentProps<typeof PreviewPane>;

const whiteboardPath = 'Line.svx';
const whiteboardContent = [
	'---',
	'tags: [drawing, whiteboard]',
	'---',
	'<script lang="ts">',
	"import { InfiniteWhiteboard, type WhiteboardItem, type WhiteboardViewport } from '@vaie/datahoarder';",
	'',
	'let items = $state<WhiteboardItem[]>([',
	'  {',
	'    "kind": "drawing",',
	'    "id": "line-stroke",',
	'    "x": 140,',
	'    "y": 140,',
	'    "width": 220,',
	'    "height": 120,',
	'    "points": [',
	'      { "x": 12, "y": 92 },',
	'      { "x": 70, "y": 18 },',
	'      { "x": 132, "y": 60 },',
	'      { "x": 208, "y": 26 }',
	'    ],',
	'    "stroke": "oklch(0.45 0.16 248)",',
	'    "strokeWidth": 5',
	'  }',
	']);',
	'let viewport = $state<WhiteboardViewport>({ "x": 120, "y": 96, "scale": 1 });',
	'</script>',
	'',
	'# Line Handle Smoke',
	'',
	'<div class="drawing-whiteboard">',
	'  <InfiniteWhiteboard bind:items bind:viewport ariaLabel="Line handle smoke whiteboard" />',
	'</div>'
].join('\n');

describe('PreviewPane whiteboard preview', () => {
	it('keeps the active whiteboard mounted when same-file edits update selectedContent', async () => {
		const file = createFile(whiteboardPath, whiteboardContent);
		const props = createPreviewPaneProps({
			files: [file],
			selectedContent: whiteboardContent,
			selectedFile: file
		});
		const screen = await render(PreviewPane, props);

		await expect.element(page.getByLabelText('Whiteboard Preview')).toBeInTheDocument();

		const preview = document.querySelector('.whiteboard-note-preview');
		expect(preview).toBeInstanceOf(HTMLElement);

		const editedContent = updateWhiteboardNoteState(whiteboardContent, {
			items: [
				{
					kind: 'drawing',
					id: 'line-stroke',
					x: 140,
					y: 140,
					width: 260,
					height: 140,
					points: [
						{ x: 12, y: 92 },
						{ x: 70, y: 18 },
						{ x: 132, y: 60 },
						{ x: 208, y: 26 }
					],
					stroke: 'oklch(0.45 0.16 248)',
					strokeWidth: 5
				}
			],
			viewport: { x: 120, y: 96, scale: 1 }
		});

		await screen.rerender({
			...props,
			selectedContent: editedContent
		});
		await tick();

		expect(document.querySelector('.whiteboard-note-preview')).toBe(preview);
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
