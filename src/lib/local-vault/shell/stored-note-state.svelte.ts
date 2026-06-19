import type { LocalDirectoryHandle } from "../../vault/local-files.js";
import type {
    VaultIndex,
    VaultRecord,
} from "../../vault/index.js";
import {
    normalizeStoredNotePaths,
    pruneStoredNotePaths,
    readStoredPinnedNotePaths,
    replaceStoredNotePath,
    writeStoredPinnedNotePaths,
} from "./stored-notes.js";

type StoredNoteStateOptions = {
    getVaultHandle: () => LocalDirectoryHandle | null,
    getVaultIndex: () => VaultIndex,
};

export class StoredNoteState {
    pinnedNotePaths = $state<string[]>([]);
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
            return;
        }

        this.#savePinnedNotePaths([path, ...this.pinnedNotePaths]);
    };

    replacePinnedNotePath = (previousPath: string, nextPath: string): void => {
        this.#savePinnedNotePaths(replaceStoredNotePath(previousPath, nextPath, this.pinnedNotePaths));
    };

    prunePinnedNotePaths = (nextVaultIndex = this.#options.getVaultIndex()): void => {
        this.#savePinnedNotePaths(pruneStoredNotePaths(this.pinnedNotePaths, nextVaultIndex.recordsByPath));
    };

    loadPinnedNotePaths = (vaultName: string): void => {
        this.pinnedNotePaths = readStoredPinnedNotePaths(vaultName);
    };

    #savePinnedNotePaths(paths: string[]): void {
        this.pinnedNotePaths = normalizeStoredNotePaths(paths);

        const vaultHandle = this.#options.getVaultHandle();

        if (vaultHandle) {
            writeStoredPinnedNotePaths(vaultHandle.name, this.pinnedNotePaths);
        }
    }
}

export const createStoredNoteState = (
    options: StoredNoteStateOptions,
): StoredNoteState => new StoredNoteState(options);
