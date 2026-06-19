import { addCollectionField } from '../../collections/edit.js';
import { createCollectionRecordDraft, type ResolvedCollection } from '../../collections/index.js';
import { createWhiteboardNoteDraft } from '../../drawings/preview.js';
import {
	createLocalDirectory,
	createLocalVaultFile,
	writeLocalFile,
	type LocalDirectoryHandle,
	type LocalVaultDirectory,
	type LocalVaultFile
} from '../../vault/local-files.js';
import { getNoteTitle } from '../../vault/paths.js';
import type { VaultIndex } from '../../vault/index.js';
import type { SavedVaultSearch } from '../../vault/saved-search.js';
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
import {
	applyCreatedLocalDirectory,
	applyCreatedLocalFile,
	applyUpdatedLocalFile
} from './vault-snapshot-mutations.js';

type NoteActionContext = {
	collectionRecordCreationError: string;
	dirty: boolean;
	directories: LocalVaultDirectory[];
	errorMessage: string;
	files: LocalVaultFile[];
	loading: boolean;
	savedContent: string;
	savedVaultSearches: SavedVaultSearch[];
	saving: boolean;
	selectedCollection: ResolvedCollection | null;
	selectedContent: string;
	selectedFile: LocalVaultFile | null;
	selectedPath: string;
	status: string;
	templateFiles: LocalVaultFile[];
	vaultHandle: LocalDirectoryHandle | null;
	vaultIndex: VaultIndex;
	canLeaveSelectedFile: () => Promise<boolean>;
	canMutateVault: () => Promise<boolean>;
	getErrorMessage: (error: unknown) => string;
	pruneStoredNoteLists: (nextVaultIndex?: VaultIndex) => void;
	requestInlineFileCreate: (request: InlineFileCreateRequest) => Promise<string | null>;
	requestForm: (config: RequestDialogConfig) => Promise<RequestDialogValues | null>;
};

export type NoteActions = ReturnType<typeof createNoteActions>;

export function createNoteActions(context: NoteActionContext) {
	return {
		addFieldToSelectedCollection,
		createCollectionRecord,
		createDrawingNote,
		createFolder,
		createNote,
		createNoteFromTemplate
	};


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
			const createdFile = await createLocalVaultFile(context.vaultHandle, nextPath, content, '.md');

			await applyCreatedLocalFile(context, createdFile, content, `Created ${createdFile.path}`);
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
			const createdFile = await createLocalVaultFile(context.vaultHandle, nextPath, draft.content, '.svx');

			await applyCreatedLocalFile(context, createdFile, draft.content, `Created drawing ${createdFile.path}`);
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

			applyCreatedLocalDirectory(context, createdPath, `Created folder ${createdPath}`);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
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
			const createdFile = await createLocalVaultFile(context.vaultHandle, nextPath, draft.content, '.md');

			await applyCreatedLocalFile(
				context,
				createdFile,
				draft.content,
				`Created collection record ${createdFile.path}`
			);
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

			const updatedFile = await writeLocalFile(context.selectedFile, result.content);

			await applyUpdatedLocalFile(
				context,
				updatedFile,
				result.content,
				`Added ${result.field.name} field to ${context.selectedFile.path}`
			);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
	}

}
