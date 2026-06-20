import type {
    LocalFileHandle,
    LocalVaultFile,
    ServerLocalDirectoryHandle,
    ServerLocalFileHandle,
} from "./local-files.js";

type ServerVaultMetadata = {
    enabled: boolean,
    name: string,
    root: string,
};

type ServerVaultFileResponse = {
    extension: string,
    path: string,
    routePath: string,
    size: number,
    updatedAt: number,
};

type ServerVaultDirectoryResponse = {
    path: string,
};

export const getServerVaultHandle = async () => {
    const metadata = await fetchServerVaultMetadata();

    if (!metadata?.enabled) {
        return null;
    }

    return {
        kind: "server-directory",
        name: metadata.name,
        root: metadata.root,
        source: "server",
    } satisfies ServerLocalDirectoryHandle;
};

export const canUseServerVault = async () => {
    return Boolean(await getServerVaultHandle());
};

export const isServerDirectoryHandle = (
    handle: unknown,
): handle is ServerLocalDirectoryHandle => {
    return Boolean(handle && typeof handle === "object" && "kind" in handle && handle.kind === "server-directory");
};

export const isServerVaultFile = (file: LocalVaultFile | null | undefined) => {
    return Boolean(file && "source" in file.handle && file.handle.source === "server");
};

export const readServerVault = async () => {
    const response = await serverRequest<ServerVaultFileResponse[]>("/api/vault/files");

    return response.map(createServerVaultFile);
};

export const readServerVaultDirectories = async () => {
    return serverRequest<ServerVaultDirectoryResponse[]>("/api/vault/directories");
};

export const isServerFileHandle = (handle: LocalFileHandle): handle is ServerLocalFileHandle => {
    return "source" in handle && handle.source === "server";
};

export const readServerFile = async (path: string) => {
    const response = await fetch(`/api/vault/file?path=${encodeURIComponent(path)}`, {
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(await getServerResponseError(response));
    }

    return response.text();
};

export const writeServerFile = async (path: string, content: string) => {
    await serverRequest("/api/vault/file", {
        body: JSON.stringify({ content, path }),
        headers: { "content-type": "application/json" },
        method: "PUT",
    });
};

export const createServerFile = async (path: string, content: string) => {
    const result = await serverRequest<{ path: string }>("/api/vault/file", {
        body: JSON.stringify({ content, path }),
        headers: { "content-type": "application/json" },
        method: "POST",
    });

    return result.path;
};

export const createServerDirectory = async (path: string) => {
    const result = await serverRequest<{ path: string }>("/api/vault/directory", {
        body: JSON.stringify({ path }),
        headers: { "content-type": "application/json" },
        method: "POST",
    });

    return result.path;
};

export const moveServerDirectory = async (currentPath: string, nextPath: string) => {
    const result = await serverRequest<{ path: string }>("/api/vault/directory", {
        body: JSON.stringify({ currentPath, nextPath }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
    });

    return result.path;
};

export const deleteServerFile = async (path: string) => {
    await serverRequest("/api/vault/file", {
        body: JSON.stringify({ path }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
    });
};

export const moveServerFile = async (currentPath: string, nextPath: string, content: string) => {
    const result = await serverRequest<{ path: string }>("/api/vault/file", {
        body: JSON.stringify({ content, currentPath, nextPath }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
    });

    return result.path;
};

const fetchServerVaultMetadata = async () => {
    if (typeof fetch === "undefined") {
        return null;
    }

    try {
        const response = await fetch("/api/vault", { cache: "no-store" });

        if (!response.ok) {
            return null;
        }

        return (await response.json()) as ServerVaultMetadata;
    } catch {
        return null;
    }
};

const createServerVaultFile = (file: ServerVaultFileResponse): LocalVaultFile => {
    return {
        ...file,
        handle: {
            kind: "file",
            name: file.path.split("/").at(-1) ?? file.path,
            path: file.path,
            source: "server",
            getFile: async () => {
                const content = await readServerFile(file.path);

                return new File([content], file.path.split("/").at(-1) ?? file.path, {
                    lastModified: file.updatedAt,
                    type: "text/plain",
                });
            },
        },
    };
};

const serverRequest = async <T = unknown>(url: string, init?: RequestInit) => {
    const response = await fetch(url, {
        cache: "no-store",
        ...init,
    });

    if (!response.ok) {
        throw new Error(await getServerResponseError(response));
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
};

const getServerResponseError = async (response: Response) => {
    try {
        const payload = (await response.json()) as { message?: string };

        return payload.message || response.statusText;
    } catch {
        return response.statusText;
    }
};
