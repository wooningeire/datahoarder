import type { LocalDirectoryHandle } from "../../vault/local-files.js";
import type { VaultIndex } from "../../vault/index.js";
import {
    getRecentNotePaths,
    maxRecentNotes,
    normalizeStoredNotePaths,
    pruneStoredNotePaths,
    readStoredNoteLists,
    replaceStoredNotePaths,
    writeStoredRecentNotePaths,
} from "./stored-notes.js";

type StoredNoteStateOptions = {
    getVaultHandle: () => LocalDirectoryHandle | null,
    getVaultIndex: () => VaultIndex,
};

export class StoredNoteState {
    recentNotePaths = $state<string[]>([]);
    #options: StoredNoteStateOptions;

    constructor(options: StoredNoteStateOptions) {
        this.#options = options;
    }

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
            recent: this.recentNotePaths,
        });

        this.#saveRecentNotePaths(nextLists.recent);
    };

    pruneStoredNoteLists = (nextVaultIndex = this.#options.getVaultIndex()): void => {
        const nextLists = pruneStoredNotePaths(
            {
                recent: this.recentNotePaths,
            },
            nextVaultIndex.recordsByPath,
        );

        this.#saveRecentNotePaths(nextLists.recent);
    };

    loadStoredNoteLists = (vaultName: string): void => {
        const lists = readStoredNoteLists(vaultName);

        this.recentNotePaths = lists.recent;
    };

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
