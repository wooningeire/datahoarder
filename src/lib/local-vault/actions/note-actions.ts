import { addCollectionField } from '../../collections/edit.js';
import { createCollectionRecordDraft, type ResolvedCollection } from '../../collections/index.js';
import { addDrawingElement } from '../../drawings/edit.js';
import { createWhiteboardNoteDraft } from '../../drawings/preview.js';
import {
	createLocalFile,
	normalizeLocalTextPath,
	readLocalFile,
	writeLocalFile,
	type LocalDirectoryHandle,
	type LocalVaultFile
} from '../../vault/local-files.js';
import { hasInlineField, setInlineField } from '../../note-model/fields.js';
import { getTemplateDisplayName, renderNoteTemplate } from '../../note-model/template.js';
import { getNoteTitle } from '../../vault/paths.js';
import {
	buildLocalVaultIndex,
	formatVaultValue,
	getVaultRecordValue,
	type VaultIndex,
	type VaultRecord
} from '../../vault/index.js';
import {
	assertNoManagedPathCollision as assertNoLocalManagedPathCollision,
	getAvailableNotePath as getAvailableLocalNotePath
} from '../shared/path-availability.js';
import type {
	InlineFileCreateRequest,
	RequestDialogConfig,
	RequestDialogValues
} from '../shared/types.js';

type NoteActionContext = {
	collectionRecordCreationError: string;
	dirty: boolean;
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
		if (
			!context.vaultHandle ||
			context.loading ||
			!(await context.canMutateVault()) ||
			!(await context.canLeaveSelectedFile())
		) {
			return;
		}

		if (!context.templateFiles.length) {
			context.status = 'No templates found. Add files under Templates/ or use .template.md.';
			return;
		}

		const requestedTemplateSelection = await context.requestForm({
			fields: [
				{
					id: 'template',
					inputKind: 'select',
					label: 'Template',
					options: context.templateFiles.map((file) => ({
						label: `${getTemplateDisplayName(file.path)} (${file.path})`,
						value: file.path
					})),
					required: true,
					value: context.templateFiles[0]?.path ?? ''
				}
			],
			submitLabel: 'Use Template',
			title: 'Choose Template'
		});

		if (requestedTemplateSelection === null) {
			return;
		}

		const requestedTemplate = requestedTemplateSelection.template;
		const templateFile = findTemplateFile(requestedTemplate);

		if (!templateFile) {
			context.errorMessage = `Template not found: ${requestedTemplate}`;
			return;
		}

		const suggestedPath = getAvailableLocalNotePath(
			context.files,
			getSuggestedCreatePath(
				directoryPath,
				`${getTemplateDisplayName(templateFile.path)}.md`,
				`${getTemplateDisplayName(templateFile.path)}.md`
			)
		);
		const suggestedCreatePath = splitCreatePath(suggestedPath);
		const requestedFileName = await context.requestInlineFileCreate({
			directoryPath: suggestedCreatePath.directoryPath,
			extension: '.md',
			fileName: suggestedCreatePath.fileName,
			inputLabel: 'New note name',
			kind: 'template',
			submitLabel: 'Create',
			title: 'New Note From Template'
		});

		if (requestedFileName === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const nextPath = getInlineCreatePath(suggestedCreatePath.directoryPath, requestedFileName, '.md');
			assertNoLocalManagedPathCollision(context.files, nextPath);
			const templateContent = await readLocalFile(templateFile);
			const renderedTemplate = renderNoteTemplate(templateContent, { path: nextPath });
			const createdPath = await createLocalFile(context.vaultHandle, nextPath, renderedTemplate.content, '.md');

			await context.reloadVaultAfterFileOperation(`Created ${createdPath} from ${templateFile.path}`, createdPath);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
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

	function findTemplateFile(template: string) {
		const normalizedTemplate = template.trim().toLowerCase();

		if (!normalizedTemplate) {
			return null;
		}

		return (
			context.templateFiles.find((file) => file.path.toLowerCase() === normalizedTemplate) ??
			context.templateFiles.find((file) => file.routePath.toLowerCase() === normalizedTemplate) ??
			context.templateFiles.find((file) => getTemplateDisplayName(file.path).toLowerCase() === normalizedTemplate) ??
			null
		);
	}
}

function getSuggestedCreatePath(directoryPath: string | undefined, globalPath: string, localFileName: string) {
	if (directoryPath === undefined) {
		return globalPath;
	}

	const normalizedDirectoryPath = directoryPath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');

	return normalizedDirectoryPath ? `${normalizedDirectoryPath}/${localFileName}` : localFileName;
}

function splitCreatePath(path: string) {
	const segments = path.split('/').filter(Boolean);
	const fileName = segments.pop() ?? 'Untitled.md';

	return {
		directoryPath: segments.join('/'),
		fileName
	};
}

function getInlineCreatePath(directoryPath: string, fileName: string, defaultExtension: string) {
	const fileNameStem = stripMatchingExtension(fileName, defaultExtension);

	if (!fileNameStem) {
		throw new Error('File name is required.');
	}

	const nextFileName = normalizeLocalTextPath(
		fileNameStem + defaultExtension,
		''
	);

	if (nextFileName.includes('/')) {
		throw new Error('Use a file name, not a path. Choose the folder in the sidebar first.');
	}

	return directoryPath ? `${directoryPath}/${nextFileName}` : nextFileName;
}

function stripMatchingExtension(fileName: string, extension: string) {
	const trimmedFileName = fileName.trim();

	if (!extension || !trimmedFileName.toLowerCase().endsWith(extension.toLowerCase())) {
		return trimmedFileName;
	}

	return trimmedFileName.slice(0, -extension.length);
}
