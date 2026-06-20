import {
    isEditableTextFile,
    moveLocalDirectory,
    moveLocalFile,
    normalizeLocalDirectoryPath,
    normalizeLocalTextPath,
    readLocalFile,
    writeLocalFile,
    type LocalDirectoryHandle,
    type LocalVaultDirectory,
    type LocalVaultFile,
} from "../../vault/local-files.js";
import {
    assertNoManagedFolderPathCollision,
    assertNoManagedPathCollision as assertNoLocalManagedPathCollision,
} from "../shared/path-availability.js";

export type VaultMoveActionContext = {
    dirty: boolean,
    directories: LocalVaultDirectory[],
    errorMessage: string,
    files: LocalVaultFile[],
    loading: boolean,
    savedContent: string,
    selectedContent: string,
    selectedFile: LocalVaultFile | null,
    selectedPath: string,
    vaultHandle: LocalDirectoryHandle | null,
    getErrorMessage: (error: unknown) => string,
    replaceStoredNotePath: (previousPath: string, nextPath: string) => void,
};

type VaultMoveActionDependencies = {
    canMutateVault: () => Promise<boolean>,
    reloadVaultAfterMove: (nextStatus: string, preferredPath: string) => Promise<void>,
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

            await dependencies.reloadVaultAfterMove(
                `Moved ${currentPath} to ${movedPath}`,
                selectedFileIsMoving ? rebaseMovedPath(context.selectedPath, currentPath, movedPath) : context.selectedPath,
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
            const movedPath = await moveLocalFile(
                context.vaultHandle,
                currentFile.path,
                nextPath,
                content,
            );

            context.replaceStoredNotePath(currentFile.path, movedPath);

            if (selectedFileIsMoving) {
                context.savedContent = content;
            }

            await dependencies.reloadVaultAfterMove(
                `Moved ${currentFile.path} to ${movedPath}`,
                selectedFileIsMoving ? movedPath : context.selectedPath,
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