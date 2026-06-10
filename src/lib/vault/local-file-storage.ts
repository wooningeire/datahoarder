import type { LocalDirectoryHandle } from "./local-files.js";
import { isServerDirectoryHandle } from "./local-file-server.js";
import {
    canUseTauriNativeFileAccess,
    isTauriDirectoryHandle,
    storeTauriVaultRoot,
} from "./local-file-tauri.js";

const databaseName = "datahoarder-local-vault";
const objectStoreName = "handles";
const vaultHandleKey = "vault-directory-handle";

export const getStoredVaultHandle = async () => {
    if (canUseTauriNativeFileAccess()) {
        return undefined;
    }

    if (typeof indexedDB === "undefined") {
        return undefined;
    }

    const database = await openHandleDatabase();
    const transaction = database.transaction(objectStoreName, "readonly");
    const request = transaction.objectStore(objectStoreName).get(vaultHandleKey);

    return requestValue<LocalDirectoryHandle | undefined>(request);
};

export const storeVaultHandle = async (handle: LocalDirectoryHandle) => {
    if (isServerDirectoryHandle(handle)) {
        return;
    }

    if (isTauriDirectoryHandle(handle)) {
        storeTauriVaultRoot(handle.root);
        return;
    }

    const database = await openHandleDatabase();
    const transaction = database.transaction(objectStoreName, "readwrite");
    const request = transaction.objectStore(objectStoreName).put(handle, vaultHandleKey);

    await requestValue(request);
};

const openHandleDatabase = () => {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore(objectStoreName);
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
};

const requestValue = <T>(request: IDBRequest<T>) => {
    return new Promise<T>((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
};
