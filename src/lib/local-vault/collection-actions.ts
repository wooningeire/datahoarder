import { formatCollectionRecordValue, type ResolvedCollection } from '../collection.js';
import { readLocalFile, writeLocalFile, type LocalDirectoryHandle, type LocalVaultFile } from '../local-vault.js';
import { hasInlineField, setInlineField } from '../note-fields.js';
import { buildLocalVaultIndex, type VaultIndex, type VaultRecord } from '../vault-index.js';
import {
	getCollectionColumnLabel,
	getCollectionViewSortColumn,
	hasOwnCaseInsensitiveProperty,
	isEditableCollectionColumn
} from './collection-view.js';
import type { CollectionCellEdit } from './types.js';

type CollectionActionContext = {
	collectionCellEdit: CollectionCellEdit | null;
	collectionFilter: string;
	collectionRecords: VaultRecord[];
	collectionSortColumn: string;
	collectionSortDirection: 'asc' | 'desc';
	dirty: boolean;
	errorMessage: string;
	files: LocalVaultFile[];
	lastCollectionViewDefaultsKey: string;
	loading: boolean;
	savedContent: string;
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
	reloadVaultAfterFileOperation: (nextStatus: string, preferredPath?: string) => Promise<void>;
	saveSelectedFile: () => Promise<void>;
	selectFile: (filePath: string) => Promise<void>;
};

export type CollectionActions = ReturnType<typeof createCollectionActions>;

export function createCollectionActions(context: CollectionActionContext) {
	return {
		applyCollectionViewDefaults,
		bulkSetCollectionField,
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

		const requestedValue = context.collectionCellEdit.value;

		context.saving = true;
		context.errorMessage = '';

		try {
			const content = context.selectedFile?.path === file.path ? context.selectedContent : await readLocalFile(file);
			const nextContent = setInlineField(content, {
				key: column,
				value: requestedValue
			});

			await writeLocalFile(file, nextContent);

			if (context.selectedFile?.path === file.path) {
				context.selectedContent = nextContent;
				context.savedContent = nextContent;
			}

			await context.reloadVaultAfterFileOperation(
				`Updated ${column} on ${record.path}`,
				context.selectedPath || context.selectedFile?.path || ''
			);
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

	async function bulkSetCollectionField() {
		if (!context.vaultHandle || context.loading || context.saving || !context.selectedCollection) {
			return;
		}

		if (!context.collectionRecords.length) {
			context.status = 'No visible collection records to update.';
			return;
		}

		if (!(await context.canMutateVault())) {
			return;
		}

		if (context.dirty) {
			if (!window.confirm('Save current collection edits before this bulk update?')) {
				return;
			}

			await context.saveSelectedFile();

			if (context.dirty) {
				return;
			}
		}

		const defaultField =
			context.selectedCollection.columns.find((column) =>
				isEditableCollectionColumn(context.selectedCollection, column)
			) ?? 'status';
		const requestedKey = window.prompt('Field name for visible records', defaultField);

		if (requestedKey === null) {
			return;
		}

		const key = requestedKey.trim();

		if (!isEditableCollectionColumn(context.selectedCollection, key)) {
			context.errorMessage = `${key || 'That field'} cannot be edited from collection records.`;
			return;
		}

		const requestedValue = window.prompt(
			`Set ${getCollectionColumnLabel(key)} on ${context.collectionRecords.length} visible records`,
			''
		);

		if (requestedValue === null) {
			return;
		}

		if (!window.confirm(`Set ${key} on ${context.collectionRecords.length} visible collection records?`)) {
			return;
		}

		const recordsToUpdate = [...context.collectionRecords];
		const preferredPath = context.selectedPath || context.selectedFile?.path || '';
		let updatedCount = 0;
		const skippedPaths: string[] = [];

		context.saving = true;
		context.errorMessage = '';

		try {
			for (const record of recordsToUpdate) {
				const file = context.files.find((candidate) => candidate.path === record.path);

				if (!file) {
					skippedPaths.push(record.path);
					continue;
				}

				const content = context.selectedFile?.path === file.path ? context.selectedContent : await readLocalFile(file);

				if (hasOwnCaseInsensitiveProperty(record.properties, key) && !hasInlineField(content, key)) {
					skippedPaths.push(record.path);
					continue;
				}

				const nextContent = setInlineField(content, {
					key,
					value: requestedValue
				});

				await writeLocalFile(file, nextContent);
				updatedCount += 1;

				if (context.selectedFile?.path === file.path) {
					context.selectedContent = nextContent;
					context.savedContent = nextContent;
				}
			}

			const skippedStatus = skippedPaths.length ? ` Skipped ${skippedPaths.length} read-only or missing records.` : '';
			await context.reloadVaultAfterFileOperation(
				`Updated ${key} on ${updatedCount} visible records.${skippedStatus}`,
				preferredPath
			);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
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
