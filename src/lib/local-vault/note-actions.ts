import { addCollectionField } from '../collections/edit.js';
import { createCollectionRecordDraft, type ResolvedCollection } from '../collections/index.js';
import { addExcalidrawElement } from '../drawings/edit.js';
import { createExcalidrawNoteDraft } from '../drawings/preview.js';
import {
	createLocalFile,
	normalizeLocalTextPath,
	readLocalFile,
	writeLocalFile,
	type LocalDirectoryHandle,
	type LocalVaultFile
} from '../vault/local-files.js';
import { hasInlineField, setInlineField } from '../note-model/fields.js';
import { getTemplateDisplayName, renderNoteTemplate } from '../note-model/template.js';
import { getNoteTitle } from '../vault/paths.js';
import {
	buildLocalVaultIndex,
	formatVaultValue,
	getVaultRecordValue,
	type VaultIndex,
	type VaultRecord
} from '../vault/index.js';
import {
	assertNoManagedPathCollision as assertNoLocalManagedPathCollision,
	getAvailableNotePath as getAvailableLocalNotePath
} from './path-availability.js';

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

		const requestedKey = window.prompt('Field name', 'status');

		if (requestedKey === null) {
			return;
		}

		const existingValue = formatVaultValue(getVaultRecordValue(context.selectedRecord, requestedKey));
		const requestedValue = window.prompt('Field value', existingValue);

		if (requestedValue === null) {
			return;
		}

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

	async function createNote() {
		if (
			!context.vaultHandle ||
			context.loading ||
			!(await context.canMutateVault()) ||
			!(await context.canLeaveSelectedFile())
		) {
			return;
		}

		const suggestedPath = getAvailableLocalNotePath(context.files, 'Untitled.md');
		const requestedPath = window.prompt('New note path', suggestedPath);

		if (requestedPath === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const nextPath = normalizeLocalTextPath(requestedPath, '.md');
			assertNoLocalManagedPathCollision(context.files, nextPath);
			const content = `# ${getNoteTitle(nextPath)}\n\n`;
			const createdPath = await createLocalFile(context.vaultHandle, nextPath, content, '.md');

			await context.reloadVaultAfterFileOperation(`Created ${createdPath}`, createdPath);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		}
	}

	async function createDrawingNote() {
		if (
			!context.vaultHandle ||
			context.loading ||
			!(await context.canMutateVault()) ||
			!(await context.canLeaveSelectedFile())
		) {
			return;
		}

		const suggestedPath = getAvailableLocalNotePath(context.files, 'Drawings/Untitled Drawing.md');
		const requestedPath = window.prompt('New drawing path', suggestedPath);

		if (requestedPath === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const nextPath = normalizeLocalTextPath(requestedPath, '.md');
			assertNoLocalManagedPathCollision(context.files, nextPath);
			const draft = createExcalidrawNoteDraft(getNoteTitle(nextPath));
			const createdPath = await createLocalFile(context.vaultHandle, nextPath, draft.content, '.md');

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

		const requestedKind = window.prompt('Canvas element type', 'text');

		if (requestedKind === null) {
			return;
		}

		const requestedLabel = window.prompt('Canvas element label', getNoteTitle(context.selectedFile.path));

		if (requestedLabel === null) {
			return;
		}

		context.saving = true;
		context.errorMessage = '';

		try {
			const result = addExcalidrawElement(context.selectedContent, {
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

	async function createNoteFromTemplate() {
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

		const requestedTemplate = window.prompt('Template path or name', context.templateFiles[0]?.path ?? '');

		if (requestedTemplate === null) {
			return;
		}

		const templateFile = findTemplateFile(requestedTemplate);

		if (!templateFile) {
			context.errorMessage = `Template not found: ${requestedTemplate}`;
			return;
		}

		const suggestedPath = getAvailableLocalNotePath(context.files, `${getTemplateDisplayName(templateFile.path)}.md`);
		const requestedPath = window.prompt('New note path', suggestedPath);

		if (requestedPath === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const nextPath = normalizeLocalTextPath(requestedPath, '.md');
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

		const requestedTitle = window.prompt('New collection record title', 'Untitled');

		if (requestedTitle === null) {
			return;
		}

		try {
			context.errorMessage = '';
			const draft = createCollectionRecordDraft(context.selectedCollection.definition, requestedTitle);
			const nextPath = getAvailableLocalNotePath(context.files, draft.path);
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

		const requestedName = window.prompt('New collection field name', 'priority');

		if (requestedName === null) {
			return;
		}

		const requestedType = window.prompt('New collection field type', 'text');

		if (requestedType === null) {
			return;
		}

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
