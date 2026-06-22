import type { VaultIndex } from "../../vault/index.js";
import {
    isEditableTextFile,
    moveLocalDirectory,
    moveLocalVaultFile,
    normalizeLocalDirectoryPath,
    normalizeLocalTextPath,
    readLocalFile,
    writeLocalFile,
    type LocalDirectoryHandle,
    type LocalVaultDirectory,
    type LocalVaultFile,
} from "../../vault/local-files.js";
import type { SavedVaultSearch } from "../../vault/saved-search.js";
import {
    assertNoManagedFolderPathCollision,
    assertNoManagedPathCollision as assertNoLocalManagedPathCollision,
} from "../shared/path-availability.js";
import {
    applyMovedLocalDirectory,
    applyMovedLocalFile,
} from "./vault-snapshot-mutations.js";

export type VaultMoveActionContext = {
    dirty: boolean,
    directories: LocalVaultDirectory[],
    errorMessage: string,
    files: LocalVaultFile[],
    loading: boolean,
    savedContent: string,
    savedVaultSearches: SavedVaultSearch[],
    selectedContent: string,
    selectedFile: LocalVaultFile | null,
    selectedPath: string,
    status: string,
    vaultHandle: LocalDirectoryHandle | null,
    vaultIndex: VaultIndex,
    getErrorMessage: (error: unknown) => string,
    pruneStoredNoteLists: (nextVaultIndex?: VaultIndex) => void,
    replaceStoredNotePath: (previousPath: string, nextPath: string) => void,
};

type VaultMoveActionDependencies = {
    canMutateVault: () => Promise<boolean>,
};

export const createVaultMoveActions = (
    context: VaultMoveActionContext,
    dependencies: VaultMoveActionDependencies,
) => ({
    moveDirectoryToDirectory: async (directoryPath: string, targetDirectoryPath: string) => {
        if (!context.vaultHandle || context.loading || !(await dependencies.canMutateVault())) {
            return;
        }

        const currentPath = normalizeLocalDirectoryPath(directoryPath);
        const nextPath = normalizeLocalDirectoryPath(getMoveTargetPath(currentPath, targetDirectoryPath));

        if (nextPath === currentPath) {
            return;
        }

        try {
            context.errorMessage = "";

            if (isPathInsideDirectory(nextPath, currentPath)) {
                throw new Error("A folder cannot be moved inside itself.");
            }

            assertNoManagedFolderPathCollision(context.files, context.directories, nextPath);

            const selectedFileIsMoving = Boolean(
                context.selectedFile && isPathInsideDirectory(context.selectedFile.path, currentPath)
            );

            if (selectedFileIsMoving && context.dirty && context.selectedFile) {
                await writeLocalFile(context.selectedFile, context.selectedContent);
                context.savedContent = context.selectedContent;
            }

            const movedPath = await moveLocalDirectory(context.vaultHandle, currentPath, nextPath);

            for (const file of context.files) {
                if (isPathInsideDirectory(file.path, currentPath)) {
                    context.replaceStoredNotePath(file.path, rebaseMovedPath(file.path, currentPath, movedPath));
                }
            }

            await applyMovedLocalDirectory(
                context,
                currentPath,
                movedPath,
                `Moved ${currentPath} to ${movedPath}`,
            );
        } catch (error) {
            context.errorMessage = context.getErrorMessage(error);
        }
    },

    moveFileToDirectory: async (filePath: string, directoryPath: string) => {
        if (!context.vaultHandle || context.loading || !(await dependencies.canMutateVault())) {
            return;
        }

        const currentFile = context.files.find((file) => file.path === filePath);

        if (!currentFile || !isEditableTextFile(currentFile.path)) {
            return;
        }

        const nextPath = normalizeLocalTextPath(getMoveTargetPath(currentFile.path, directoryPath), "");

        if (nextPath === currentFile.path) {
            return;
        }

        try {
            context.errorMessage = "";
            assertNoLocalManagedPathCollision(context.files, nextPath, currentFile.path);

            const selectedFileIsMoving = context.selectedFile?.path === currentFile.path;
            const content = selectedFileIsMoving ? context.selectedContent : await readLocalFile(currentFile);
            const movedFile = await moveLocalVaultFile(
                context.vaultHandle,
                currentFile.path,
                nextPath,
                content,
            );

            context.replaceStoredNotePath(currentFile.path, movedFile.path);

            if (selectedFileIsMoving) {
                context.savedContent = content;
            }

            await applyMovedLocalFile(
                context,
                currentFile.path,
                movedFile,
                content,
                `Moved ${currentFile.path} to ${movedFile.path}`,
            );
        } catch (error) {
            context.errorMessage = context.getErrorMessage(error);
        }
    },
});

const getMoveTargetPath = (filePath: string, directoryPath: string): string => {
    const fileName = filePath.split("/").at(-1) ?? "";

    return directoryPath ? `${directoryPath}/${fileName}` : fileName;
};

const isPathInsideDirectory = (path: string, directoryPath: string): boolean => {
    return path.startsWith(`${directoryPath}/`);
};

const rebaseMovedPath = (path: string, previousDirectoryPath: string, nextDirectoryPath: string): string => {
    const rest = path.slice(previousDirectoryPath.length).replace(/^\//u, "");

    return rest ? `${nextDirectoryPath}/${rest}` : nextDirectoryPath;
};