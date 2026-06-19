import type { VaultRecord } from "../../vault/index.js";

const pinnedNoteStoragePrefix = "datahoarder-local-vault-pinned-notes";

export function getStoredNoteRecords(paths: string[], recordsByPath: Map<string, VaultRecord>) {
    const records: VaultRecord[] = [];
    const seenPaths = new Set<string>();

    for (const path of paths) {
        if (seenPaths.has(path)) {
            continue;
        }

        const record = recordsByPath.get(path);

        if (!record) {
            continue;
        }

        seenPaths.add(path);
        records.push(record);
    }

    return records;
}

export function replaceStoredNotePath(previousPath: string, nextPath: string, paths: string[]) {
    return normalizeStoredNotePaths(paths.map((path) => (path === previousPath ? nextPath : path)));
}

export function pruneStoredNotePaths(paths: string[], recordsByPath: Map<string, VaultRecord>) {
    return normalizeStoredNotePaths(paths.filter((path) => recordsByPath.has(path)));
}

export function readStoredPinnedNotePaths(vaultName: string) {
    return readStoredNotePaths(pinnedNoteStoragePrefix, vaultName);
}

export function writeStoredPinnedNotePaths(vaultName: string, paths: string[]) {
    writeStoredNotePaths(pinnedNoteStoragePrefix, vaultName, paths);
}

export function normalizeStoredNotePaths(paths: string[], limit = Number.POSITIVE_INFINITY) {
    const seenPaths = new Set<string>();
    const uniquePaths: string[] = [];

    for (const path of paths) {
        const trimmedPath = path.trim();

        if (!trimmedPath || seenPaths.has(trimmedPath)) {
            continue;
        }

        seenPaths.add(trimmedPath);
        uniquePaths.push(trimmedPath);

        if (uniquePaths.length >= limit) {
            break;
        }
    }

    return uniquePaths;
}

function readStoredNotePaths(prefix: string, vaultName: string, limit = Number.POSITIVE_INFINITY) {
    try {
        const storedValue = window.localStorage.getItem(getNoteStorageKey(prefix, vaultName));
        const storedPaths = storedValue ? JSON.parse(storedValue) : [];

        if (!Array.isArray(storedPaths)) {
            return [];
        }

        return normalizeStoredNotePaths(storedPaths.filter((path): path is string => typeof path === "string"), limit);
    } catch {
        return [];
    }
}

function writeStoredNotePaths(prefix: string, vaultName: string, paths: string[]) {
    try {
        window.localStorage.setItem(getNoteStorageKey(prefix, vaultName), JSON.stringify(paths));
    } catch {
        // Browsers may deny localStorage in hardened profiles; the vault remains usable without it.
    }
}

function getNoteStorageKey(prefix: string, vaultName: string) {
    return `${prefix}:${vaultName || "vault"}`;
}
