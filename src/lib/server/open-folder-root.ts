import { stat } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import {
    normalizeLocalDirectoryPath,
    normalizeLocalTextPath,
} from "../vault/local-files.js";
import { getEnv } from "./open-folder-env.js";

export const getOpenFolderRoot = async () => {
    const rawRoot =
        getEnv("DATAHOARDER_OPEN_FOLDER") ??
        getEnv("DATAHOARDER_VAULT_ROOT") ??
        getEnv("DATAHOARDER_WORKSPACE_ROOT");

    if (!rawRoot?.trim()) {
        return null;
    }

    const root = resolve(rawRoot);

    try {
        const rootStats = await stat(root);

        return rootStats.isDirectory() ? root : null;
    } catch {
        return null;
    }
};

export const requireOpenFolderRoot = async () => {
    const root = await getOpenFolderRoot();

    if (!root) {
        throw new Error("Set DATAHOARDER_OPEN_FOLDER to a folder before using the server vault.");
    }

    return root;
};

export const resolvePathWithinRoot = (root: string, path: string) => {
    const normalizedPath = normalizeLocalTextPath(path, "");

    return resolveNormalizedPathWithinRoot(root, normalizedPath);
};

export const resolveDirectoryPathWithinRoot = (root: string, path: string) => {
    const normalizedPath = normalizeLocalDirectoryPath(path);

    return resolveNormalizedPathWithinRoot(root, normalizedPath);
};

const resolveNormalizedPathWithinRoot = (root: string, normalizedPath: string) => {
    const resolvedRoot = resolve(root);
    const filesystemPath = resolve(resolvedRoot, ...normalizedPath.split("/"));

    if (filesystemPath !== resolvedRoot && !filesystemPath.startsWith(`${resolvedRoot}${sep}`)) {
        throw new Error("Path escapes the opened folder.");
    }

    return filesystemPath;
};

export const getOpenFolderName = (root: string | null) => {
    return root ? basename(root) : "";
};
