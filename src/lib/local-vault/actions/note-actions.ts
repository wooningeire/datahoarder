import { addCollectionField } from '../../collections/edit.js';
import { createCollectionRecordDraft, type ResolvedCollection } from '../../collections/index.js';
import { addDrawingElement } from '../../drawings/edit.js';
import { createWhiteboardNoteDraft } from '../../drawings/preview.js';
import {
	createLocalDirectory,
	createLocalFile,
	writeLocalFile,
	type LocalDirectoryHandle,
	type LocalVaultDirectory,
	type LocalVaultFile
} from '../../vault/local-files.js';
import { sortLocalVaultDirectories } from '../../vault/local-directory-helpers.js';
import { hasInlineField, setInlineField } from '../../note-model/fields.js';
import { getNoteTitle } from '../../vault/paths.js';
import {
	buildLocalVaultIndex,
	formatVaultValue,
	getVaultRecordValue,
	type VaultIndex,
	type VaultRecord
} from '../../vault/index.js';
import {
	assertNoManagedFolderPathCollision,
	assertNoManagedPathCollision as assertNoLocalManagedPathCollision,
	getAvailableFolderPath as getAvailableLocalFolderPath,
	getAvailableNotePath as getAvailableLocalNotePath
} from '../shared/path-availability.js';
import type {
	InlineFileCreateRequest,
	RequestDialogConfig,
	RequestDialogValues
} from '../shared/types.js';
import {
	getInlineCreateDirectoryPath,
	getInlineCreatePath,
	getSuggestedCreatePath,
	splitCreatePath
} from './note-create-paths.js';
import { createNoteFromTemplateAction } from './note-template-actions.js';

type NoteActionContext = {
	collectionRecordCreationError: string;
	dirty: boolean;
	directories: LocalVaultDirectory[];
	errorMessage: string;
	files: LocalVaultFile[];
	loading: boolean;
	savedContent: string;
	saving: boolean;
	selectedCollection: ResolvedCollection | null;
	selectedContent: string;
	selectedExcalidrawNote: boolean;
	selectedFile: LocalVaultFile | null;
	selectedRecord: VaultRecord | null;
	status: string;
	templateFiles: LocalVaultFile[];
	vaultHandle: LocalDirectoryHandle | null;
	vaultIndex: VaultIndex;
	canLeaveSelectedFile: () => Promise<boolean>;
	canMutateVault: () => Promise<boolean>;
	getErrorMessage: (error: unknown) => string;
	reloadVaultAfterFileOperation: (nextStatus: string, preferredPath?: string) => Promise<void>;
	requestInlineFileCreate: (request: InlineFileCreateRequest) => Promise<string | null>;
	requestForm: (config: RequestDialogConfig) => Promise<RequestDialogValues | null>;
};

export type NoteActions = ReturnType<typeof createNoteActions>;

export function createNoteActions(context: NoteActionContext) {
	return {
		addCanvasElement,
		addFieldToSelectedCollection,
		createCollectionRecord,
		createDrawingNote,
		createFolder,
		createNote,
		createNoteFromTemplate,
		setSelectedInlineField
	};

	async function setSelectedInlineField() {
		if (!context.selectedFile || !context.selectedRecord) {
			return;
		}

		if (context.dirty && !window.confirm('Save current edits with this field update?')) {
			return;
		}

		const requestedField = await context.requestForm({
			fields: [
				{
					id: 'key',
					label: 'Field Name',
					required: true,
					value: 'status'
				},
				{
					id: 'value',
					label: 'Field Value',
					value: formatVaultValue(getVaultRecordValue(context.selectedRecord, 'status'))
				}
			],
			submitLabel: 'Update Field',
			title: 'Set Inline Field'
		});

		if (requestedField === null) {
			return;
		}

		const requestedKey = requestedField.key;
		const requestedValue = requestedField.value;

		context.saving = true;
		context.errorMessage = '';

		try {
			const nextContent = setInlineField(context.selectedContent, {
				key: requestedKey,
				value: requestedValue
			});

			await writeLocalFile(context.selectedFile, nextContent);
			context.selectedContent = nextContent;
			context.savedContent = nextContent;
			context.vaultIndex = await buildLocalVaultIndex(context.files, {
				changedPaths: [context.selectedFile.path],
				previousIndex: context.vaultIndex
			});
			context.status = `Updated ${requestedKey.trim()} on ${context.selectedFile.path}`;
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
	}

	async function createNote(directoryPath?: string) {
		if (
			!context.vaultHandle ||
			context.loading ||
			!(await context.canMutateVault()) ||
			!(await context.canLeaveSelectedFile())
		) {
			return;
		}

		const suggestedPath = getAvailableLocalNotePath(
			context.files,
			getSuggestedCreatePath(directoryPath, 'Untitled.md', 'Untitled.md')
		);
		const suggestedCreatePath = splitCreatePath(suggestedPath);
		const requestedFileName = await context.requestInlineFileCreate({
			directoryPath: suggestedCreatePath.directoryPath,
			extension: '.md',
			fileName: suggestedCreatePath.fileName,
			inputLabel: 'New note name',
			kind: 'note',
			submitLabel: 'Create',
			title: 'New Note'
		});

		if (requestedFileName === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const nextPath = getInlineCreatePath(suggestedCreatePath.directoryPath, requestedFileName, '.md');
			assertNoLocalManagedPathCollision(context.files, nextPath);
			const content = `# ${getNoteTitle(nextPath)}\n\n`;
			const createdPath = await createLocalFile(context.vaultHandle, nextPath, content, '.md');

			await context.reloadVaultAfterFileOperation(`Created ${createdPath}`, createdPath);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function createDrawingNote(directoryPath?: string) {
		if (
			!context.vaultHandle ||
			context.loading ||
			!(await context.canMutateVault()) ||
			!(await context.canLeaveSelectedFile())
		) {
			return;
		}

		const suggestedPath = getAvailableLocalNotePath(
			context.files,
			getSuggestedCreatePath(directoryPath, 'Drawings/Untitled Drawing.svx', 'Untitled Drawing.svx')
		);
		const suggestedCreatePath = splitCreatePath(suggestedPath);
		const requestedFileName = await context.requestInlineFileCreate({
			directoryPath: suggestedCreatePath.directoryPath,
			extension: '.svx',
			fileName: suggestedCreatePath.fileName,
			inputLabel: 'New drawing name',
			kind: 'drawing',
			submitLabel: 'Create',
			title: 'New Drawing'
		});

		if (requestedFileName === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const nextPath = getInlineCreatePath(suggestedCreatePath.directoryPath, requestedFileName, '.svx');
			assertNoLocalManagedPathCollision(context.files, nextPath);
			const draft = createWhiteboardNoteDraft(getNoteTitle(nextPath));
			const createdPath = await createLocalFile(context.vaultHandle, nextPath, draft.content, '.svx');

			await context.reloadVaultAfterFileOperation(`Created drawing ${createdPath}`, createdPath);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function createFolder(directoryPath?: string) {
		if (
			!context.vaultHandle ||
			context.loading ||
			!(await context.canMutateVault()) ||
			!(await context.canLeaveSelectedFile())
		) {
			return;
		}

		const suggestedPath = getAvailableLocalFolderPath(
			context.files,
			context.directories,
			getSuggestedCreatePath(directoryPath, 'New Folder', 'New Folder')
		);
		const suggestedCreatePath = splitCreatePath(suggestedPath);
		const requestedFolderName = await context.requestInlineFileCreate({
			directoryPath: suggestedCreatePath.directoryPath,
			extension: '',
			fileName: suggestedCreatePath.fileName,
			inputLabel: 'New folder name',
			kind: 'folder',
			submitLabel: 'Create',
			title: 'New Folder'
		});

		if (requestedFolderName === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const nextPath = getInlineCreateDirectoryPath(suggestedCreatePath.directoryPath, requestedFolderName);

			assertNoManagedFolderPathCollision(context.files, context.directories, nextPath);

			const createdPath = await createLocalDirectory(context.vaultHandle, nextPath);

			// Empty folders do not affect files or the index, so keep the selected file mounted.
			context.directories = sortLocalVaultDirectories([...context.directories, { path: createdPath }]);
			context.status = `Created folder ${createdPath}`;
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function addCanvasElement() {
		if (!context.selectedFile || !context.selectedExcalidrawNote) {
			return;
		}

		if (context.dirty && !window.confirm('Save current edits with this canvas update?')) {
			return;
		}

		const requestedElement = await context.requestForm({
			fields: [
				{
					id: 'kind',
					inputKind: 'select',
					label: 'Element Type',
					options: [
						{ label: 'Text', value: 'text' },
						{ label: 'Rectangle', value: 'rectangle' },
						{ label: 'Ellipse', value: 'ellipse' },
						{ label: 'Diamond', value: 'diamond' },
						{ label: 'Arrow', value: 'arrow' }
					],
					required: true,
					value: 'text'
				},
				{
					id: 'label',
					label: 'Element Label',
					value: getNoteTitle(context.selectedFile.path)
				}
			],
			submitLabel: 'Add Element',
			title: 'Add Canvas Element'
		});

		if (requestedElement === null) {
			return;
		}

		const requestedKind = requestedElement.kind;
		const requestedLabel = requestedElement.label;

		context.saving = true;
		context.errorMessage = '';

		try {
			const result = addDrawingElement(context.selectedContent, {
				kind: requestedKind,
				text: requestedLabel
			});

			await writeLocalFile(context.selectedFile, result.content);
			context.selectedContent = result.content;
			context.savedContent = result.content;
			context.vaultIndex = await buildLocalVaultIndex(context.files, {
				changedPaths: [context.selectedFile.path],
				previousIndex: context.vaultIndex
			});
			context.status = `Added ${result.kind} to ${context.selectedFile.path}`;
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
	}

	async function createNoteFromTemplate(directoryPath?: string) {
		await createNoteFromTemplateAction(context, directoryPath);
	}

	async function createCollectionRecord() {
		if (
			!context.vaultHandle ||
			!context.selectedCollection ||
			context.loading ||
			!(await context.canMutateVault()) ||
			!(await context.canLeaveSelectedFile())
		) {
			return;
		}

		if (context.collectionRecordCreationError) {
			context.errorMessage = context.collectionRecordCreationError;
			return;
		}

		const suggestedDraft = createCollectionRecordDraft(context.selectedCollection.definition, 'Untitled');
		const suggestedPath = getAvailableLocalNotePath(context.files, suggestedDraft.path);
		const suggestedCreatePath = splitCreatePath(suggestedPath);
		const requestedFileName = await context.requestInlineFileCreate({
			directoryPath: suggestedCreatePath.directoryPath,
			extension: '.md',
			fileName: suggestedCreatePath.fileName,
			inputLabel: 'New record file name',
			kind: 'collection-record',
			submitLabel: 'Create',
			title: 'New Collection Record'
		});

		if (requestedFileName === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const nextPath = getInlineCreatePath(suggestedCreatePath.directoryPath, requestedFileName, '.md');
			const draft = createCollectionRecordDraft(context.selectedCollection.definition, getNoteTitle(nextPath));
			assertNoLocalManagedPathCollision(context.files, nextPath);
			const createdPath = await createLocalFile(context.vaultHandle, nextPath, draft.content, '.md');

			await context.reloadVaultAfterFileOperation(`Created collection record ${createdPath}`, createdPath);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function addFieldToSelectedCollection() {
		if (
			!context.vaultHandle ||
			!context.selectedFile ||
			!context.selectedCollection ||
			context.loading ||
			context.saving
		) {
			return;
		}

		if (!(await context.canMutateVault())) {
			return;
		}

		if (context.dirty && !window.confirm('Save current collection edits with this field?')) {
			return;
		}

		const requestedField = await context.requestForm({
			fields: [
				{
					id: 'name',
					label: 'Field Name',
					required: true,
					value: 'priority'
				},
				{
					help: 'Examples: text, number, date, boolean, enum.',
					id: 'type',
					label: 'Field Type',
					required: true,
					value: 'text'
				}
			],
			submitLabel: 'Add Field',
			title: 'New Collection Field'
		});

		if (requestedField === null) {
			return;
		}

		const requestedName = requestedField.name;
		const requestedType = requestedField.type;

		context.saving = true;
		context.errorMessage = '';

		try {
			const result = addCollectionField(context.selectedContent, {
				name: requestedName,
				type: requestedType,
				viewIndex: context.selectedCollection.viewIndex
			});

			await writeLocalFile(context.selectedFile, result.content);
			context.selectedContent = result.content;
			context.savedContent = result.content;
			await context.reloadVaultAfterFileOperation(
				`Added ${result.field.name} field to ${context.selectedFile.path}`,
				context.selectedFile.path
			);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
	}

}
