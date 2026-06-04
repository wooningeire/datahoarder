import type { VaultRecord } from '../../vault/index.js';

export type StoredNoteLists = {
	pinned: string[];
	recent: string[];
};

export const maxRecentNotes = 8;

const pinnedNoteStoragePrefix = 'datahoarder-local-vault-pinned-notes';
const recentNoteStoragePrefix = 'datahoarder-local-vault-recent-notes';

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

export function getRecentNotePaths(path: string, recentPaths: string[], recordsByPath: Map<string, VaultRecord>) {
	return recordsByPath.has(path)
		? normalizeStoredNotePaths([path, ...recentPaths.filter((storedPath) => storedPath !== path)], maxRecentNotes)
		: recentPaths;
}

export function replaceStoredNotePaths(previousPath: string, nextPath: string, lists: StoredNoteLists): StoredNoteLists {
	const replacePath = (path: string) => (path === previousPath ? nextPath : path);

	return {
		pinned: normalizeStoredNotePaths(lists.pinned.map(replacePath)),
		recent: normalizeStoredNotePaths(lists.recent.map(replacePath), maxRecentNotes)
	};
}

export function pruneStoredNotePaths(lists: StoredNoteLists, recordsByPath: Map<string, VaultRecord>): StoredNoteLists {
	const isIndexed = (path: string) => recordsByPath.has(path);

	return {
		pinned: normalizeStoredNotePaths(lists.pinned.filter(isIndexed)),
		recent: normalizeStoredNotePaths(lists.recent.filter(isIndexed), maxRecentNotes)
	};
}

export function readStoredNoteLists(vaultName: string): StoredNoteLists {
	return {
		pinned: readStoredNotePaths(pinnedNoteStoragePrefix, vaultName),
		recent: readStoredNotePaths(recentNoteStoragePrefix, vaultName, maxRecentNotes)
	};
}

export function writeStoredPinnedNotePaths(vaultName: string, paths: string[]) {
	writeStoredNotePaths(pinnedNoteStoragePrefix, vaultName, paths);
}

export function writeStoredRecentNotePaths(vaultName: string, paths: string[]) {
	writeStoredNotePaths(recentNoteStoragePrefix, vaultName, paths);
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

		return normalizeStoredNotePaths(storedPaths.filter((path): path is string => typeof path === 'string'), limit);
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
	return `${prefix}:${vaultName || 'vault'}`;
}
