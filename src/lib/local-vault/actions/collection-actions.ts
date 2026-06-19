import { formatCollectionRecordValue, type ResolvedCollection } from '../../collections/index.js';
import {
	readLocalFile,
	writeLocalFile,
	type LocalDirectoryHandle,
	type LocalVaultDirectory,
	type LocalVaultFile
} from '../../vault/local-files.js';
import { hasInlineField, setInlineField } from '../../note-model/fields.js';
import type { VaultIndex, VaultRecord } from '../../vault/index.js';
import type { SavedVaultSearch } from '../../vault/saved-search.js';
import {
	getCollectionViewSortColumn,
	hasOwnCaseInsensitiveProperty,
	isEditableCollectionColumn
} from '../preview/collection-view.js';
import type { CollectionCellEdit } from '../shared/types.js';
import { applyUpdatedLocalFile } from './vault-snapshot-mutations.js';

type CollectionActionContext = {
	collectionCellEdit: CollectionCellEdit | null;
	collectionFilter: string;
	collectionSortColumn: string;
	collectionSortDirection: 'asc' | 'desc';
	directories: LocalVaultDirectory[];
	dirty: boolean;
	errorMessage: string;
	files: LocalVaultFile[];
	lastCollectionViewDefaultsKey: string;
	loading: boolean;
	savedContent: string;
	savedVaultSearches: SavedVaultSearch[];
	saving: boolean;
	selectedCollection: ResolvedCollection | null;
	selectedContent: string;
	selectedFile: LocalVaultFile | null;
	selectedPath: string;
	selectedCollectionViewIndex: number;
	status: string;
	vaultHandle: LocalDirectoryHandle | null;
	vaultIndex: VaultIndex;
	canMutateVault: () => Promise<boolean>;
	getErrorMessage: (error: unknown) => string;
	pruneStoredNoteLists: (nextVaultIndex?: VaultIndex) => void;
	selectFile: (filePath: string) => Promise<void>;
};

export type CollectionActions = ReturnType<typeof createCollectionActions>;

export function createCollectionActions(context: CollectionActionContext) {
	return {
		applyCollectionViewDefaults,
		cancelCollectionCellEdit,
		editCollectionRecordField,
		isEditingCollectionCell,
		openCollectionRecord,
		saveCollectionCellEdit,
		selectCollectionView,
		setCollectionFilter,
		sortCollectionBy,
		updateCollectionCellEditValue
	};

	async function editCollectionRecordField(record: VaultRecord, column: string) {
		if (
			context.loading ||
			context.saving ||
			!context.selectedCollection ||
			!isEditableCollectionColumn(context.selectedCollection, column)
		) {
			return;
		}

		if (hasOwnCaseInsensitiveProperty(record.properties, column) && !hasInlineField(record.content, column)) {
			context.errorMessage = `Edit ${column} in ${record.path} source; frontmatter-backed collection cells are read-only here.`;
			return;
		}

		context.errorMessage = '';
		context.collectionCellEdit = {
			column,
			recordPath: record.path,
			value: formatCollectionRecordValue(record, column)
		};
	}

	async function saveCollectionCellEdit(record: VaultRecord, column: string) {
		if (
			!context.vaultHandle ||
			context.loading ||
			context.saving ||
			!context.selectedCollection ||
			!context.collectionCellEdit
		) {
			return;
		}

		if (!isEditingCollectionCell(record, column)) {
			return;
		}

		if (!(await context.canMutateVault())) {
			return;
		}

		const file = context.files.find((candidate) => candidate.path === record.path);

		if (!file) {
			context.errorMessage = `Could not find ${record.path} in the opened vault.`;
			return;
		}

		if (
			context.dirty &&
			context.selectedFile?.path === file.path &&
			!window.confirm('Save current edits with this collection update?')
		) {
			return;
		}

		if (
			context.dirty &&
			context.selectedFile?.path !== file.path &&
			!window.confirm('Discard unsaved edits before this collection update?')
		) {
			return;
		}

		if (context.dirty && context.selectedFile?.path !== file.path) {
			context.selectedContent = context.savedContent;
		}

		const requestedValue = context.collectionCellEdit.value;

		context.saving = true;
		context.errorMessage = '';

		try {
			const content = context.selectedFile?.path === file.path ? context.selectedContent : await readLocalFile(file);
			const nextContent = setInlineField(content, {
				key: column,
				value: requestedValue
			});

			const updatedFile = await writeLocalFile(file, nextContent);

			await applyUpdatedLocalFile(context, updatedFile, nextContent, `Updated ${column} on ${record.path}`);
			context.collectionCellEdit = null;
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
	}

	function cancelCollectionCellEdit() {
		context.collectionCellEdit = null;
	}

	function updateCollectionCellEditValue(value: string) {
		if (!context.collectionCellEdit) {
			return;
		}

		context.collectionCellEdit = {
			...context.collectionCellEdit,
			value
		};
	}


	function sortCollectionBy(column: string) {
		if (context.collectionSortColumn === column) {
			context.collectionSortDirection = context.collectionSortDirection === 'asc' ? 'desc' : 'asc';
			return;
		}

		context.collectionSortColumn = column;
		context.collectionSortDirection = 'asc';
	}

	function selectCollectionView(viewIndex: number) {
		context.collectionCellEdit = null;
		context.lastCollectionViewDefaultsKey = '';
		context.selectedCollectionViewIndex = viewIndex;
	}

	function setCollectionFilter(filter: string) {
		context.collectionFilter = filter;
	}

	function applyCollectionViewDefaults(collection: ResolvedCollection) {
		context.collectionFilter = collection.view.filter;
		context.collectionSortColumn = getCollectionViewSortColumn(collection);
		context.collectionSortDirection = collection.view.sortDirection;
	}

	function openCollectionRecord(record: VaultRecord) {
		void context.selectFile(record.routePath);
	}

	function isEditingCollectionCell(record: VaultRecord, column: string) {
		return context.collectionCellEdit?.recordPath === record.path && context.collectionCellEdit.column === column;
	}
}
