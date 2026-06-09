import type { LocalDirectoryHandle } from "../../vault/local-files.js";
import type {
    VaultIndex,
    VaultRecord,
} from "../../vault/index.js";
import {
    getRecentNotePaths,
    maxRecentNotes,
    normalizeStoredNotePaths,
    pruneStoredNotePaths,
    readStoredNoteLists,
    replaceStoredNotePaths,
    writeStoredPinnedNotePaths,
    writeStoredRecentNotePaths,
} from "./stored-notes.js";

type StoredNoteStateOptions = {
    getVaultHandle: () => LocalDirectoryHandle | null,
    getVaultIndex: () => VaultIndex,
    setStatus: (status: string) => void,
};

export class StoredNoteState {
    pinnedNotePaths = $state<string[]>([]);
    recentNotePaths = $state<string[]>([]);
    #options: StoredNoteStateOptions;

    constructor(options: StoredNoteStateOptions) {
        this.#options = options;
    }

    toggleSelectedPin = (selectedRecord: VaultRecord | null): void => {
        if (!selectedRecord) {
            return;
        }

        this.togglePinnedPath(selectedRecord.path);
    };

    togglePinnedPath = (path: string): void => {
        if (!this.#options.getVaultIndex().recordsByPath.has(path)) {
            return;
        }

        if (this.pinnedNotePaths.includes(path)) {
            this.#savePinnedNotePaths(this.pinnedNotePaths.filter((storedPath) => storedPath !== path));
            this.#options.setStatus(`Unpinned ${path}`);
            return;
        }

        this.#savePinnedNotePaths([path, ...this.pinnedNotePaths]);
        this.#options.setStatus(`Pinned ${path}`);
    };

    recordRecentNote = (path: string): void => {
        this.#saveRecentNotePaths(
            getRecentNotePaths(
                path,
                this.recentNotePaths,
                this.#options.getVaultIndex().recordsByPath,
            ),
        );
    };

    replaceStoredNotePath = (previousPath: string, nextPath: string): void => {
        const nextLists = replaceStoredNotePaths(previousPath, nextPath, {
            pinned: this.pinnedNotePaths,
            recent: this.recentNotePaths,
        });

        this.#savePinnedNotePaths(nextLists.pinned);
        this.#saveRecentNotePaths(nextLists.recent);
    };

    pruneStoredNoteLists = (nextVaultIndex = this.#options.getVaultIndex()): void => {
        const nextLists = pruneStoredNotePaths(
            {
                pinned: this.pinnedNotePaths,
                recent: this.recentNotePaths,
            },
            nextVaultIndex.recordsByPath,
        );

        this.#savePinnedNotePaths(nextLists.pinned);
        this.#saveRecentNotePaths(nextLists.recent);
    };

    loadStoredNoteLists = (vaultName: string): void => {
        const lists = readStoredNoteLists(vaultName);

        this.pinnedNotePaths = lists.pinned;
        this.recentNotePaths = lists.recent;
    };

    #savePinnedNotePaths(paths: string[]): void {
        this.pinnedNotePaths = normalizeStoredNotePaths(paths);

        const vaultHandle = this.#options.getVaultHandle();

        if (vaultHandle) {
            writeStoredPinnedNotePaths(vaultHandle.name, this.pinnedNotePaths);
        }
    }

    #saveRecentNotePaths(paths: string[]): void {
        this.recentNotePaths = normalizeStoredNotePaths(paths, maxRecentNotes);

        const vaultHandle = this.#options.getVaultHandle();

        if (vaultHandle) {
            writeStoredRecentNotePaths(vaultHandle.name, this.recentNotePaths);
        }
    }
}

export const createStoredNoteState = (
    options: StoredNoteStateOptions,
): StoredNoteState => new StoredNoteState(options);
