import {
    getLocalRoutePath,
    getPathExtension,
    normalizeLocalTextPath,
} from "./local-file-paths.js";
import {
    createServerFile,
    deleteServerFile,
    isServerDirectoryHandle,
    isServerFileHandle,
    moveServerFile,
    readServerFile,
    writeServerFile,
} from "./local-file-server.js";
import {
    createTauriFile,
    deleteTauriFile,
    isTauriDirectoryHandle,
    isTauriFileHandle,
    moveTauriFile,
    readTauriFile,
    writeTauriFile,
} from "./local-file-tauri.js";
import type {
    BrowserLocalDirectoryHandle,
    LocalDirectoryHandle,
    LocalFileHandle,
    LocalVaultFile,
} from "./local-files.js";

export const writeLocalFile = async (
    file: LocalVaultFile,
    content: string,
) => {
    await writeLocalFileHandle(file.handle, content);

    return createLocalVaultFileSnapshot(file.handle, file.path, content);
};

export const createLocalVaultFile = async (
    root: LocalDirectoryHandle,
    path: string,
    content: string,
    defaultExtension = ".md",
) => {
    const normalizedPath = normalizeLocalTextPath(path, defaultExtension);

    if (isServerDirectoryHandle(root)) {
        const createdPath = await createServerFile(normalizedPath, content);

        return createLocalVaultFileSnapshot(createLocalFileHandle(root, createdPath), createdPath, content);
    }

    if (isTauriDirectoryHandle(root)) {
        const createdPath = await createTauriFile(root.root, normalizedPath, content);

        return createLocalVaultFileSnapshot(createLocalFileHandle(root, createdPath), createdPath, content);
    }

    const { directory, fileName } = await getLocalParentDirectory(root, normalizedPath, true);

    if (!directory.getFileHandle) {
        throw new Error("This browser does not support creating files in selected folders.");
    }

    if (await localFileExists(directory, fileName)) {
        throw new Error(`A file already exists at ${normalizedPath}.`);
    }

    const handle = await directory.getFileHandle(fileName, { create: true });
    await writeLocalFileHandle(handle, content);

    return createLocalVaultFileSnapshot(handle, normalizedPath, content);
};

export const createLocalFile = async (
    root: LocalDirectoryHandle,
    path: string,
    content: string,
    defaultExtension = ".md",
) => {
    return (await createLocalVaultFile(root, path, content, defaultExtension)).path;
};

export const deleteLocalFile = async (
    root: LocalDirectoryHandle,
    path: string,
) => {
    const normalizedPath = normalizeLocalTextPath(path, "");

    if (isServerDirectoryHandle(root)) {
        await deleteServerFile(normalizedPath);
        return;
    }

    if (isTauriDirectoryHandle(root)) {
        await deleteTauriFile(root.root, normalizedPath);
        return;
    }

    const { directory, fileName } = await getLocalParentDirectory(root, normalizedPath, false);

    if (!directory.removeEntry) {
        throw new Error("This browser does not support deleting files in selected folders.");
    }

    await directory.removeEntry(fileName);
};

export const moveLocalVaultFile = async (
    root: LocalDirectoryHandle,
    currentPath: string,
    nextPath: string,
    content: string,
) => {
    const normalizedCurrentPath = normalizeLocalTextPath(currentPath, "");
    const normalizedNextPath = normalizeLocalTextPath(nextPath, "");

    if (normalizedCurrentPath === normalizedNextPath) {
        return createLocalVaultFileSnapshot(
            await getLocalFileHandle(root, normalizedCurrentPath),
            normalizedCurrentPath,
            content,
        );
    }

    if (normalizedCurrentPath.toLowerCase() === normalizedNextPath.toLowerCase()) {
        throw new Error("Case-only renames are not supported yet.");
    }

    if (isServerDirectoryHandle(root)) {
        const movedPath = await moveServerFile(normalizedCurrentPath, normalizedNextPath, content);

        return createLocalVaultFileSnapshot(createLocalFileHandle(root, movedPath), movedPath, content);
    }

    if (isTauriDirectoryHandle(root)) {
        const movedPath = await moveTauriFile(root.root, normalizedCurrentPath, normalizedNextPath, content);

        return createLocalVaultFileSnapshot(createLocalFileHandle(root, movedPath), movedPath, content);
    }

    const movedFile = await createLocalVaultFile(root, normalizedNextPath, content, "");
    await deleteLocalFile(root, normalizedCurrentPath);

    return movedFile;
};

export const moveLocalFile = async (
    root: LocalDirectoryHandle,
    currentPath: string,
    nextPath: string,
    content: string,
) => {
    return (await moveLocalVaultFile(root, currentPath, nextPath, content)).path;
};

export const createLocalVaultFileSnapshot = (
    handle: LocalFileHandle,
    path: string,
    content: string,
): LocalVaultFile => {
    return {
        extension: getPathExtension(path),
        handle,
        path,
        routePath: getLocalRoutePath(path),
        size: new TextEncoder().encode(content).byteLength,
        updatedAt: Date.now(),
    };
};

const createLocalFileHandle = (
    root: LocalDirectoryHandle,
    path: string,
): LocalFileHandle => {
    const name = path.split("/").at(-1) ?? path;

    if (isServerDirectoryHandle(root)) {
        return {
            kind: "file",
            name,
            path,
            source: "server",
            getFile: async () => {
                const content = await readServerFile(path);

                return new File([content], name, {
                    lastModified: Date.now(),
                    type: "text/plain",
                });
            },
        };
    }

    if (isTauriDirectoryHandle(root)) {
        return {
            kind: "file",
            name,
            path,
            previewOrigin: root.previewOrigin,
            previewRouteBase: root.previewRouteBase,
            root: root.root,
            source: "tauri",
            targetProjectRoot: root.targetProjectRoot,
            getFile: async () => {
                const content = await readTauriFile(root.root, path);

                return new File([content], name, {
                    lastModified: Date.now(),
                    type: "text/plain",
                });
            },
        };
    }

    throw new Error("Cannot create a file handle without a server or native vault root.");
};

export const getLocalFileHandle = async (
    root: LocalDirectoryHandle,
    path: string,
): Promise<LocalFileHandle> => {
    if (isServerDirectoryHandle(root) || isTauriDirectoryHandle(root)) {
        return createLocalFileHandle(root, path);
    }

    const { directory, fileName } = await getLocalParentDirectory(root, path, false);

    if (!directory.getFileHandle) {
        throw new Error("This browser does not support reading files in selected folders.");
    }

    return directory.getFileHandle(fileName);
};

const writeLocalFileHandle = async (
    handle: LocalFileHandle,
    content: string,
) => {
    if (isServerFileHandle(handle)) {
        await writeServerFile(handle.path, content);
        return;
    }

    if (isTauriFileHandle(handle)) {
        await writeTauriFile(handle.root, handle.path, content);
        return;
    }

    if (!handle.createWritable) {
        throw new Error("This browser does not support writing to selected files.");
    }

    const writable = await handle.createWritable();

    if ("getWriter" in writable) {
        const writer = (writable as unknown as WritableStream<string>).getWriter();
        await writer.write(content);
        await writer.close();
        return;
    }

    await writable.write(content);
    await writable.close();
};

export const getLocalParentDirectory = async (
    root: BrowserLocalDirectoryHandle,
    path: string,
    createParent: boolean,
) => {
    const segments = path.split("/");
    const fileName = segments.pop();

    if (!fileName) {
        throw new Error("File path is required.");
    }

    let directory = root;

    for (const segment of segments) {
        if (!directory.getDirectoryHandle) {
            throw new Error("This browser does not support nested folder access.");
        }

        directory = await directory.getDirectoryHandle(segment, { create: createParent });
    }

    return { directory, fileName };
};

export const localFileExists = async (
    directory: BrowserLocalDirectoryHandle,
    fileName: string,
) => {
    if (!directory.getFileHandle) {
        return false;
    }

    try {
        await directory.getFileHandle(fileName);

        return true;
    } catch (error) {
        if (isNotFoundError(error) || isTypeMismatchError(error)) {
            return false;
        }

        throw error;
    }
};

export const localDirectoryExists = async (
    directory: BrowserLocalDirectoryHandle,
    directoryName: string,
) => {
    if (!directory.getDirectoryHandle) {
        return false;
    }

    try {
        await directory.getDirectoryHandle(directoryName);

        return true;
    } catch (error) {
        if (isNotFoundError(error) || isTypeMismatchError(error)) {
            return false;
        }

        throw error;
    }
};

const isNotFoundError = (error: unknown) => {
    return error instanceof DOMException && error.name === "NotFoundError";
};

const isTypeMismatchError = (error: unknown) => {
    return error instanceof DOMException && error.name === "TypeMismatchError";
};
