import { getLocalRoutePath, getPathExtension } from "./local-file-paths.js";
import type {
    LocalFileHandle,
    LocalVaultFile,
    TauriLocalDirectoryHandle,
    TauriLocalFileHandle,
} from "./local-files.js";

const tauriVaultRootStorageKey = "datahoarder-tauri-vault-root";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type TauriHostWindow = Window & {
    __TAURI__?: {
        core?: {
            invoke?: TauriInvoke,
        },
    },
    __TAURI_INTERNALS__?: {
        invoke?: TauriInvoke,
    },
};

type TauriVaultMetadataResponse = {
    name: string,
    previewOrigin?: string,
    previewRouteBase?: string,
    root: string,
    targetProjectRoot?: string | null,
};

type TauriVaultFileResponse = {
    path: string,
    size: number,
    updatedAt: number,
};

export const canUseTauriNativeFileAccess = () => {
    return Boolean(getTauriInvoke());
};

export const getTauriVaultHandle = async (root?: string) => {
    if (!canUseTauriNativeFileAccess()) {
        return null;
    }

    if (root?.trim()) {
        return createTauriVaultHandle(root);
    }

    const defaultMetadata = await tauriCommand<TauriVaultMetadataResponse | null>(
        "datahoarder_default_vault_root",
    );

    if (defaultMetadata) {
        return createTauriDirectoryHandle(defaultMetadata);
    }

    const storedRoot = getStoredTauriVaultRoot();

    if (!storedRoot) {
        return null;
    }

    try {
        return await createTauriVaultHandle(storedRoot);
    } catch {
        clearStoredTauriVaultRoot();
        return null;
    }
};

export const createTauriVaultHandle = async (root: string) => {
    const metadata = await tauriCommand<TauriVaultMetadataResponse>(
        "datahoarder_validate_vault_root",
        { root },
    );

    return createTauriDirectoryHandle(metadata);
};

export const pickTauriVaultHandle = async () => {
    const metadata = await tauriCommand<TauriVaultMetadataResponse | null>(
        "datahoarder_pick_vault_root",
    );

    return metadata ? createTauriDirectoryHandle(metadata) : null;
};

export const isTauriDirectoryHandle = (
    handle: unknown,
): handle is TauriLocalDirectoryHandle => {
    return Boolean(handle && typeof handle === "object" && "kind" in handle && handle.kind === "tauri-directory");
};

export const isTauriVaultFile = (
    file: LocalVaultFile | null | undefined,
): file is LocalVaultFile & { handle: TauriLocalFileHandle } => {
    return Boolean(file && isTauriFileHandle(file.handle));
};

export const ensureTauriVaultPreviewOrigin = async (file: LocalVaultFile | null | undefined) => {
    if (!isTauriVaultFile(file)) {
        return "";
    }

    if (file.handle.previewOrigin) {
        return file.handle.previewOrigin;
    }

    const metadata = await tauriCommand<TauriVaultMetadataResponse>(
        "datahoarder_ensure_vault_preview_origin",
        { root: file.handle.root },
    );
    const previewOrigin = metadata.previewOrigin ?? "";

    if (!previewOrigin) {
        return "";
    }

    file.handle.previewOrigin = previewOrigin;
    file.handle.previewRouteBase = metadata.previewRouteBase ?? "/notes";
    file.handle.targetProjectRoot = metadata.targetProjectRoot ?? null;

    return previewOrigin;
};

export const readTauriVault = async (handle: TauriLocalDirectoryHandle) => {
    const response = await tauriCommand<TauriVaultFileResponse[]>(
        "datahoarder_list_vault_files",
        { root: handle.root },
    );

    return response.map((file) => createTauriVaultFile(handle, file));
};

export const isTauriFileHandle = (handle: LocalFileHandle): handle is TauriLocalFileHandle => {
    return "source" in handle && handle.source === "tauri";
};

export const writeTauriFile = async (root: string, path: string, content: string) => {
    await tauriCommand("datahoarder_write_vault_file", { content, path, root });
};

export const createTauriFile = async (root: string, path: string, content: string) => {
    return tauriCommand<string>("datahoarder_create_vault_file", { content, path, root });
};

export const deleteTauriFile = async (root: string, path: string) => {
    await tauriCommand("datahoarder_delete_vault_file", { path, root });
};

export const moveTauriFile = async (root: string, currentPath: string, nextPath: string, content: string) => {
    return tauriCommand<string>("datahoarder_move_vault_file", {
        content,
        currentPath,
        nextPath,
        root,
    });
};

export const storeTauriVaultRoot = (root: string) => {
    try {
        localStorage.setItem(tauriVaultRootStorageKey, root);
    } catch {
        // Native access still works without persisted folder history.
    }
};

const createTauriDirectoryHandle = (metadata: TauriVaultMetadataResponse): TauriLocalDirectoryHandle => {
    return {
        kind: "tauri-directory",
        name: metadata.name,
        previewOrigin: metadata.previewOrigin ?? "",
        previewRouteBase: metadata.previewRouteBase ?? "/notes",
        root: metadata.root,
        source: "tauri",
        targetProjectRoot: metadata.targetProjectRoot ?? null,
    };
};

const createTauriVaultFile = (handle: TauriLocalDirectoryHandle, file: TauriVaultFileResponse): LocalVaultFile => {
    const extension = getPathExtension(file.path);

    return {
        extension,
        handle: {
            kind: "file",
            name: file.path.split("/").at(-1) ?? file.path,
            path: file.path,
            previewOrigin: handle.previewOrigin,
            previewRouteBase: handle.previewRouteBase,
            root: handle.root,
            source: "tauri",
            targetProjectRoot: handle.targetProjectRoot,
            getFile: async () => {
                const content = await readTauriFile(handle.root, file.path);

                return new File([content], file.path.split("/").at(-1) ?? file.path, {
                    lastModified: file.updatedAt,
                    type: "text/plain",
                });
            },
        },
        path: file.path,
        routePath: getLocalRoutePath(file.path),
        size: file.size,
        updatedAt: file.updatedAt,
    };
};

const readTauriFile = async (root: string, path: string) => {
    return tauriCommand<string>("datahoarder_read_vault_file", { path, root });
};

const tauriCommand = async <T>(command: string, args?: Record<string, unknown>) => {
    const invoke = getTauriInvoke();

    if (!invoke) {
        throw new Error("Tauri native file access is not available.");
    }

    try {
        return await invoke<T>(command, args);
    } catch (error) {
        throw normalizeTauriCommandError(error);
    }
};

const getTauriInvoke = () => {
    if (typeof window === "undefined") {
        return null;
    }

    const host = window as unknown as TauriHostWindow;

    return host.__TAURI__?.core?.invoke ?? host.__TAURI_INTERNALS__?.invoke ?? null;
};

const normalizeTauriCommandError = (error: unknown) => {
    if (error instanceof Error) {
        return error;
    }

    if (typeof error === "string") {
        return new Error(error);
    }

    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
        return new Error(error.message);
    }

    return new Error("Unknown Tauri error");
};

const getStoredTauriVaultRoot = () => {
    try {
        return localStorage.getItem(tauriVaultRootStorageKey) ?? "";
    } catch {
        return "";
    }
};

const clearStoredTauriVaultRoot = () => {
    try {
        localStorage.removeItem(tauriVaultRootStorageKey);
    } catch {
        // Native access still works without persisted folder history.
    }
};
