import type { ResolvedCollection } from '../../collections/index.js';
import type { LocalVaultFile } from '../../vault/local-files.js';
import type { SavedVaultSearch } from '../../vault/saved-search.js';
import type { VaultRecord } from '../../vault/index.js';
import type { CommandPaletteItem } from '../shared/types.js';

type CommandPaletteContext = {
	collectionRecordsCount: number;
	dirty: boolean;
	hasVault: boolean;
	loading: boolean;
	savedVaultSearches: SavedVaultSearch[];
	selectedCollection: ResolvedCollection | null;
	selectedExcalidrawNote: boolean;
	selectedFile: LocalVaultFile | null;
	selectedFilePinned: boolean;
	selectedRecord: VaultRecord | null;
	supported: boolean;
	templateFilesCount: number;
	vaultRecords: VaultRecord[];
	addCanvasElement: () => void;
	addFieldToSelectedCollection: () => void;
	applySavedVaultSearch: (search: SavedVaultSearch) => void;
	bulkSetCollectionField: () => void;
	chooseFolder: () => void;
	createCollectionRecord: () => void;
	createDrawingNote: () => void;
	createFolder: () => void;
	createNote: () => void;
	createNoteFromTemplate: () => void;
	downloadCollectionExport: (format: 'csv' | 'json') => void;
	downloadSelectedHtmlExport: () => void;
	refreshVault: () => void;
	reopenStoredFolder: () => void;
	saveSelectedFile: () => void;
	selectFile: (filePath: string) => Promise<void> | void;
	setSelectedInlineField: () => void;
	toggleSelectedPin: () => void;
};

const maxCommandPaletteResults = 18;

export function buildCommandPaletteItems(context: CommandPaletteContext): CommandPaletteItem[] {
	const items: CommandPaletteItem[] = [];

	if (context.supported && !context.loading) {
		items.push({
			detail: 'Choose a local notes folder',
			id: 'open-folder',
			keywords: ['vault', 'folder', 'workspace'],
			run: context.chooseFolder,
			title: 'Open Folder'
		});
	}

	if (context.supported && context.hasVault && !context.loading) {
		items.push(
			{
				detail: 'Request access to the remembered folder',
				id: 'reopen-folder',
				keywords: ['vault', 'folder', 'permission'],
				run: context.reopenStoredFolder,
				title: 'Reopen Folder'
			},
			{
				detail: 'Reload files and rebuild the vault index',
				id: 'refresh-vault',
				keywords: ['reload', 'index', 'vault'],
				run: context.refreshVault,
				title: 'Refresh Vault'
			},
			{
				detail: 'Create a blank Markdown note',
				id: 'new-note',
				keywords: ['capture', 'quick note', 'markdown'],
				run: context.createNote,
				title: 'New Note'
			},
			{
				detail: 'Create an SVX whiteboard note',
				id: 'new-drawing',
				keywords: ['canvas', 'whiteboard', 'drawing', 'svx'],
				run: context.createDrawingNote,
				title: 'New Drawing'
			},
			{
				detail: 'Create an empty folder in the vault root',
				id: 'new-folder',
				keywords: ['directory', 'organize', 'folder'],
				run: context.createFolder,
				title: 'New Folder'
			},
			{
				detail: context.templateFilesCount ? 'Create a note from a local template' : 'No templates found',
				id: 'new-from-template',
				keywords: ['template', 'reuse', 'component'],
				run: context.createNoteFromTemplate,
				title: 'New From Template'
			}
		);
	}

	if (context.selectedFile) {
		items.push({
			detail: `Export ${context.selectedFile.path} as standalone HTML`,
			id: 'export-html',
			keywords: ['download', 'standalone', 'public'],
			run: context.downloadSelectedHtmlExport,
			title: 'Export HTML'
		});
	}

	if (context.dirty && context.selectedFile) {
		items.push({
			detail: `Save ${context.selectedFile.path}`,
			id: 'save-file',
			keywords: ['write', 'persist'],
			run: context.saveSelectedFile,
			title: 'Save File'
		});
	}

	if (context.selectedRecord && !context.loading) {
		items.push(
			{
				detail: `${context.selectedFilePinned ? 'Remove pin from' : 'Pin'} ${context.selectedRecord.title}`,
				id: 'toggle-pin',
				keywords: ['quick note', 'favorite', 'recent'],
				run: context.toggleSelectedPin,
				title: context.selectedFilePinned ? 'Unpin Current Note' : 'Pin Current Note'
			},
			{
				detail: `Set an inline field on ${context.selectedRecord.title}`,
				id: 'set-field',
				keywords: ['metadata', 'property', 'field'],
				run: context.setSelectedInlineField,
				title: 'Set Field'
			}
		);
	}

	if (context.selectedExcalidrawNote) {
		items.push({
			detail: `Append an element to ${context.selectedFile?.path ?? 'the drawing'}`,
			id: 'add-canvas-element',
			keywords: ['drawing', 'excalidraw', 'whiteboard', 'svx'],
			run: context.addCanvasElement,
			title: 'Add Canvas Element'
		});
	}

	if (context.selectedCollection) {
		items.push(
			{
				detail: context.selectedCollection.definition.name,
				id: 'collection-new-record',
				keywords: ['database', 'row', 'record'],
				run: context.createCollectionRecord,
				title: 'New Collection Record'
			},
			{
				detail: context.selectedCollection.definition.name,
				id: 'collection-add-field',
				keywords: ['database', 'schema', 'column'],
				run: context.addFieldToSelectedCollection,
				title: 'Add Collection Field'
			},
			{
				detail: `${context.collectionRecordsCount} visible records`,
				id: 'collection-bulk-set-field',
				keywords: ['database', 'automation', 'mass update'],
				run: context.bulkSetCollectionField,
				title: 'Bulk Set Collection Field'
			},
			{
				detail: `${context.collectionRecordsCount} visible records`,
				id: 'collection-export-csv',
				keywords: ['download', 'spreadsheet'],
				run: () => context.downloadCollectionExport('csv'),
				title: 'Export Collection CSV'
			},
			{
				detail: `${context.collectionRecordsCount} visible records`,
				id: 'collection-export-json',
				keywords: ['download', 'data', 'automation'],
				run: () => context.downloadCollectionExport('json'),
				title: 'Export Collection JSON'
			}
		);
	}

	for (const search of context.savedVaultSearches) {
		items.push({
			detail: search.query,
			id: `saved-search:${search.path}`,
			keywords: ['saved search', 'query', search.name],
			run: () => context.applySavedVaultSearch(search),
			title: `Apply Saved Search: ${search.name}`
		});
	}

	for (const record of context.vaultRecords) {
		items.push({
			detail: record.path,
			id: `open-note:${record.path}`,
			keywords: ['open note', record.preview, record.tags.join(' ')],
			run: () => context.selectFile(record.routePath),
			title: `Open Note: ${record.title}`
		});
	}

	return items;
}

export function filterCommandPaletteItems(items: CommandPaletteItem[], query: string) {
	const tokens = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);

	if (!tokens.length) {
		return items.slice(0, maxCommandPaletteResults);
	}

	return items
		.filter((item) => {
			const haystack = [
				item.title,
				item.detail,
				...(item.keywords ?? [])
			].join('\n').toLowerCase();

			return tokens.every((token) => haystack.includes(token));
		})
		.slice(0, maxCommandPaletteResults);
}
