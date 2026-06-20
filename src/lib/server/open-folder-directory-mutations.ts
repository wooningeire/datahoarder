import { mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { assertManageableLocalDirectoryPath } from "../vault/local-directory-helpers.js";
import { normalizeLocalDirectoryPath } from "../vault/local-files.js";
import {
    requireOpenFolderRoot,
    resolveDirectoryPathWithinRoot,
} from "./open-folder-root.js";

export const moveOpenFolderDirectory = async (currentPath: string, nextPath: string) => {
    const normalizedCurrentPath = normalizeLocalDirectoryPath(currentPath);
    const normalizedNextPath = normalizeLocalDirectoryPath(nextPath);

    assertManageableLocalDirectoryPath(normalizedCurrentPath);
    assertManageableLocalDirectoryPath(normalizedNextPath);

    if (normalizedCurrentPath === normalizedNextPath) {
        return normalizedCurrentPath;
    }

    if (normalizedCurrentPath.toLowerCase() === normalizedNextPath.toLowerCase()) {
        throw new Error("Case-only renames are not supported yet.");
    }

    if (isPathInsideDirectory(normalizedNextPath, normalizedCurrentPath)) {
        throw new Error("A folder cannot be moved inside itself.");
    }

    const root = await requireOpenFolderRoot();
    const currentFilesystemPath = resolveDirectoryPathWithinRoot(root, normalizedCurrentPath);
    const nextFilesystemPath = resolveDirectoryPathWithinRoot(root, normalizedNextPath);
    const currentStats = await stat(currentFilesystemPath);

    if (!currentStats.isDirectory()) {
        throw new Error(`${normalizedCurrentPath} is not a folder.`);
    }

    try {
        await stat(nextFilesystemPath);
        throw new Error(`A file or folder already exists at ${normalizedNextPath}.`);
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }
    }

    await mkdir(dirname(nextFilesystemPath), { recursive: true });
    await rename(currentFilesystemPath, nextFilesystemPath);

    return normalizedNextPath;
};

const isPathInsideDirectory = (path: string, directory: string): boolean => path.startsWith(`${directory}/`);

const isNotFoundError = (error: unknown): boolean => (
    error instanceof Error && "code" in error && error.code === "ENOENT"
);