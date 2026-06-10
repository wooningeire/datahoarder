import { createLocalFile, readLocalFile, type LocalDirectoryHandle, type LocalVaultFile } from "../../vault/local-files.js";
import { getNoteTitle } from "../../vault/paths.js";
import { getTemplateDisplayName, renderNoteTemplate } from "../../note-model/template.js";
import {
    assertNoManagedPathCollision as assertNoLocalManagedPathCollision,
    getAvailableNotePath as getAvailableLocalNotePath,
} from "../shared/path-availability.js";
import type {
    InlineFileCreateRequest,
    RequestDialogConfig,
    RequestDialogValues,
} from "../shared/types.js";
import {
    getInlineCreatePath,
    getSuggestedCreatePath,
    splitCreatePath,
} from "./note-create-paths.js";

type NoteTemplateActionContext = {
    errorMessage: string,
    files: LocalVaultFile[],
    loading: boolean,
    templateFiles: LocalVaultFile[],
    status: string,
    vaultHandle: LocalDirectoryHandle | null,
    canLeaveSelectedFile: () => Promise<boolean>,
    canMutateVault: () => Promise<boolean>,
    getErrorMessage: (error: unknown) => string,
    reloadVaultAfterFileOperation: (nextStatus: string, preferredPath?: string) => Promise<void>,
    requestInlineFileCreate: (request: InlineFileCreateRequest) => Promise<string | null>,
    requestForm: (config: RequestDialogConfig) => Promise<RequestDialogValues | null>,
};

export const createNoteFromTemplateAction = async (
    context: NoteTemplateActionContext,
    directoryPath?: string,
) => {
    if (
        !context.vaultHandle ||
        context.loading ||
        !(await context.canMutateVault()) ||
        !(await context.canLeaveSelectedFile())
    ) {
        return;
    }

    if (!context.templateFiles.length) {
        context.status = "No templates found. Add files under Templates/ or use .template.md.";
        return;
    }

    const requestedTemplateSelection = await context.requestForm({
        fields: [
            {
                id: "template",
                inputKind: "select",
                label: "Template",
                options: context.templateFiles.map((file) => ({
                    label: `${getTemplateDisplayName(file.path)} (${file.path})`,
                    value: file.path,
                })),
                required: true,
                value: context.templateFiles[0]?.path ?? "",
            },
        ],
        submitLabel: "Use Template",
        title: "Choose Template",
    });

    if (requestedTemplateSelection === null) {
        return;
    }

    const requestedTemplate = requestedTemplateSelection.template;
    const templateFile = findTemplateFile(context.templateFiles, requestedTemplate);

    if (!templateFile) {
        context.errorMessage = `Template not found: ${requestedTemplate}`;
        return;
    }

    const suggestedPath = getAvailableLocalNotePath(
        context.files,
        getSuggestedCreatePath(
            directoryPath,
            `${getTemplateDisplayName(templateFile.path)}.md`,
            `${getTemplateDisplayName(templateFile.path)}.md`,
        ),
    );
    const suggestedCreatePath = splitCreatePath(suggestedPath);
    const requestedFileName = await context.requestInlineFileCreate({
        directoryPath: suggestedCreatePath.directoryPath,
        extension: ".md",
        fileName: suggestedCreatePath.fileName,
        inputLabel: "New note name",
        kind: "template",
        submitLabel: "Create",
        title: "New Note From Template",
    });

    if (requestedFileName === null) {
        return;
    }

    try {
        context.errorMessage = "";
        const nextPath = getInlineCreatePath(suggestedCreatePath.directoryPath, requestedFileName, ".md");
        assertNoLocalManagedPathCollision(context.files, nextPath);
        const templateContent = await readLocalFile(templateFile);
        const renderedTemplate = renderNoteTemplate(templateContent, { path: nextPath });
        const createdPath = await createLocalFile(context.vaultHandle, nextPath, renderedTemplate.content, ".md");

        await context.reloadVaultAfterFileOperation(`Created ${createdPath} from ${templateFile.path}`, createdPath);
    } catch (error) {
        context.errorMessage = context.getErrorMessage(error);
    }
};

const findTemplateFile = (templateFiles: LocalVaultFile[], template: string) => {
    const normalizedTemplate = template.trim().toLowerCase();

    if (!normalizedTemplate) {
        return null;
    }

    return (
        templateFiles.find((file) => file.path.toLowerCase() === normalizedTemplate) ??
        templateFiles.find((file) => file.routePath.toLowerCase() === normalizedTemplate) ??
        templateFiles.find((file) => getTemplateDisplayName(file.path).toLowerCase() === normalizedTemplate) ??
        null
    );
};
