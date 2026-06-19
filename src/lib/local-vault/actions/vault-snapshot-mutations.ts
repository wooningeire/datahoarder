import { buildLocalVaultIndex, type VaultIndex } from "../../vault/index.js";
import { sortLocalVaultDirectories } from "../../vault/local-directory-helpers.js";
import {
    sortLocalVaultFiles,
    type LocalVaultDirectory,
    type LocalVaultFile,
} from "../../vault/local-files.js";
import { getDirectoryPath } from "../../vault/paths.js";
import {
    readSavedVaultSearches,
    type SavedVaultSearch,
} from "../../vault/saved-search.js";

type VaultSnapshotMutationContext = {
    directories: LocalVaultDirectory[],
    files: LocalVaultFile[],
    savedContent: string,
    savedVaultSearches: SavedVaultSearch[],
    selectedContent: string,
    selectedPath: string,
    status: string,
    vaultIndex: VaultIndex,
    prunePinnedNotePaths: (nextVaultIndex?: VaultIndex) => void,
};

type CreatedFileOptions = {
    select?: boolean,
};

export const applyCreatedLocalFile = async (
    context: VaultSnapshotMutationContext,
    file: LocalVaultFile,
    content: string,
    status: string,
    options: CreatedFileOptions = {},
) => {
    context.files = upsertLocalVaultFiles(context.files, [file]);
    context.directories = addFileParentDirectories(context.directories, file.path);

    if (options.select ?? true) {
        selectLocalFile(context, file, content);
    }

    await rebuildVaultDerivedState(context, [file.path]);
    context.status = status;
};

export const applyCreatedLocalDirectory = (
    context: Pick<VaultSnapshotMutationContext, "directories" | "status">,
    path: string,
    status: string,
) => {
    context.directories = addDirectoryPath(context.directories, path);
    context.status = status;
};

export const applyUpdatedLocalFile = async (
    context: VaultSnapshotMutationContext,
    file: LocalVaultFile,
    content: string,
    status: string,
) => {
    context.files = upsertLocalVaultFiles(context.files, [file]);

    if (isSelectedPath(context, file.path, file.routePath)) {
        selectLocalFile(context, file, content);
    }

    await rebuildVaultDerivedState(context, [file.path]);
    context.status = status;
};

export const applyUpdatedLocalFiles = async (
    context: VaultSnapshotMutationContext,
    files: LocalVaultFile[],
    status: string,
) => {
    context.files = upsertLocalVaultFiles(context.files, files);

    await rebuildVaultDerivedState(context, files.map((file) => file.path));
    context.status = status;
};

export const applyMovedLocalFile = async (
    context: VaultSnapshotMutationContext,
    previousPath: string,
    file: LocalVaultFile,
    content: string,
    status: string,
) => {
    const previousFile = context.files.find((candidate) => candidate.path === previousPath);
    context.files = upsertLocalVaultFiles(
        removeLocalVaultFiles(context.files, [previousPath]),
        [file],
    );
    context.directories = addFileParentDirectories(context.directories, file.path);

    if (isSelectedPath(context, previousPath, previousFile?.routePath ?? previousPath)) {
        selectLocalFile(context, file, content);
    }

    await rebuildVaultDerivedState(context, [previousPath, file.path]);
    context.status = status;
};

export const applyDeletedLocalFile = async (
    context: VaultSnapshotMutationContext,
    deletedPath: string,
    status: string,
) => {
    const deletedFile = context.files.find((file) => file.path === deletedPath);

    context.files = removeLocalVaultFiles(context.files, [deletedPath]);

    if (isSelectedPath(context, deletedPath, deletedFile?.routePath ?? deletedPath)) {
        context.selectedPath = "";
        context.selectedContent = "";
        context.savedContent = "";
    }

    await rebuildVaultDerivedState(context, [deletedPath]);
    context.status = status;
};

const rebuildVaultDerivedState = async (
    context: VaultSnapshotMutationContext,
    changedPaths: string[],
) => {
    const nextVaultIndex = await buildLocalVaultIndex(context.files, {
        changedPaths,
        previousIndex: context.vaultIndex,
    });

    context.vaultIndex = nextVaultIndex;
    context.savedVaultSearches = await readSavedVaultSearches(context.files);
    context.prunePinnedNotePaths(nextVaultIndex);
};

const selectLocalFile = (
    context: VaultSnapshotMutationContext,
    file: LocalVaultFile,
    content: string,
) => {
    context.selectedPath = file.path;
    context.selectedContent = content;
    context.savedContent = content;
};

const upsertLocalVaultFiles = (
    files: LocalVaultFile[],
    updates: LocalVaultFile[],
) => {
    const byPath = new Map(files.map((file) => [normalizeLookupPath(file.path), file]));

    for (const file of updates) {
        byPath.set(normalizeLookupPath(file.path), file);
    }

    return sortLocalVaultFiles([...byPath.values()]);
};

const removeLocalVaultFiles = (
    files: LocalVaultFile[],
    paths: string[],
) => {
    const removedPaths = new Set(paths.map(normalizeLookupPath));

    return sortLocalVaultFiles(files.filter((file) => !removedPaths.has(normalizeLookupPath(file.path))));
};

const addFileParentDirectories = (
    directories: LocalVaultDirectory[],
    filePath: string,
) => {
    return addDirectoryPath(directories, getDirectoryPath(filePath));
};

const addDirectoryPath = (
    directories: LocalVaultDirectory[],
    path: string,
) => {
    const directoryPaths = new Set(directories.map((directory) => normalizeLookupPath(directory.path)));
    const nextDirectories = [...directories];

    for (const ancestorPath of getAncestorDirectoryPaths(path)) {
        const lookupPath = normalizeLookupPath(ancestorPath);

        if (directoryPaths.has(lookupPath)) {
            continue;
        }

        directoryPaths.add(lookupPath);
        nextDirectories.push({ path: ancestorPath });
    }

    return sortLocalVaultDirectories(nextDirectories);
};

const getAncestorDirectoryPaths = (path: string) => {
    const segments = path.split("/").filter(Boolean);
    const ancestors: string[] = [];

    for (let index = 0; index < segments.length; index += 1) {
        ancestors.push(segments.slice(0, index + 1).join("/"));
    }

    return ancestors;
};

const isSelectedPath = (
    context: Pick<VaultSnapshotMutationContext, "selectedPath">,
    path: string,
    routePath: string,
) => {
    return context.selectedPath === path || context.selectedPath === routePath;
};

const normalizeLookupPath = (path: string) => path.toLocaleLowerCase();
