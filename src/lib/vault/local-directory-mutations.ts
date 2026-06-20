import { assertManageableLocalDirectoryPath } from "./local-directory-helpers.js";
import { normalizeLocalDirectoryPath } from "./local-file-paths.js";
import {
    createServerDirectory,
    isServerDirectoryHandle,
    moveServerDirectory,
} from "./local-file-server.js";
import {
    createTauriDirectory,
    isTauriDirectoryHandle,
    moveTauriDirectory,
} from "./local-file-tauri.js";
import {
    getLocalParentDirectory,
    localDirectoryExists,
    localFileExists,
} from "./local-file-mutations.js";
import type {
    BrowserLocalDirectoryHandle,
    LocalDirectoryHandle,
    LocalFileHandle,
} from "./local-files.js";

export const createLocalDirectory = async (root: LocalDirectoryHandle, path: string) => {
    const normalizedPath = normalizeLocalDirectoryPath(path);

    assertManageableLocalDirectoryPath(normalizedPath);

    if (isServerDirectoryHandle(root)) {
        return createServerDirectory(normalizedPath);
    }

    if (isTauriDirectoryHandle(root)) {
        return createTauriDirectory(root.root, normalizedPath);
    }

    const { directory, fileName } = await getLocalParentDirectory(root, normalizedPath, true);

    if (!directory.getDirectoryHandle) {
        throw new Error("This browser does not support creating folders in selected folders.");
    }

    if (await localFileExists(directory, fileName)) {
        throw new Error(`A file already exists at ${normalizedPath}.`);
    }

    if (await localDirectoryExists(directory, fileName)) {
        throw new Error(`A folder already exists at ${normalizedPath}.`);
    }

    await directory.getDirectoryHandle(fileName, { create: true });

    return normalizedPath;
};

export const moveLocalDirectory = async (
    root: LocalDirectoryHandle,
    currentPath: string,
    nextPath: string,
) => {
    const normalizedCurrentPath = normalizeLocalDirectoryPath(currentPath);
    const normalizedNextPath = normalizeLocalDirectoryPath(nextPath);

    assertManageableLocalDirectoryPath(normalizedCurrentPath);
    assertManageableLocalDirectoryPath(normalizedNextPath);

    if (normalizedCurrentPath === normalizedNextPath) {
        return normalizedCurrentPath;
    }

    if (normalizedCurrentPath.toLowerCase() === normalizedNextPath.toLowerCase()) {
        throw new Error("Case-only renames are not supported yet.");
    }

    if (isPathInsideDirectory(normalizedNextPath, normalizedCurrentPath)) {
        throw new Error("A folder cannot be moved inside itself.");
    }

    if (isServerDirectoryHandle(root)) {
        return moveServerDirectory(normalizedCurrentPath, normalizedNextPath);
    }

    if (isTauriDirectoryHandle(root)) {
        return moveTauriDirectory(root.root, normalizedCurrentPath, normalizedNextPath);
    }

    const { directory: currentParent, fileName: currentName } = await getLocalParentDirectory(
        root,
        normalizedCurrentPath,
        false,
    );
    const { directory: nextParent, fileName: nextName } = await getLocalParentDirectory(
        root,
        normalizedNextPath,
        true,
    );

    if (!currentParent.getDirectoryHandle) {
        throw new Error("This browser does not support reading folders in selected folders.");
    }

    if (!nextParent.getDirectoryHandle) {
        throw new Error("This browser does not support creating folders in selected folders.");
    }

    if (!currentParent.removeEntry) {
        throw new Error("This browser does not support moving folders in selected folders.");
    }

    if (await localFileExists(nextParent, nextName)) {
        throw new Error(`A file already exists at ${normalizedNextPath}.`);
    }

    if (await localDirectoryExists(nextParent, nextName)) {
        throw new Error(`A folder already exists at ${normalizedNextPath}.`);
    }

    const source = await currentParent.getDirectoryHandle(currentName);
    const target = await nextParent.getDirectoryHandle(nextName, { create: true });

    try {
        await copyLocalDirectory(source, target);
        await currentParent.removeEntry(currentName, { recursive: true });
    } catch (error) {
        await nextParent.removeEntry?.(nextName, { recursive: true });
        throw error;
    }

    return normalizedNextPath;
};

const copyLocalDirectory = async (
    source: BrowserLocalDirectoryHandle,
    target: BrowserLocalDirectoryHandle,
): Promise<void> => {
    for await (const [name, handle] of source.entries()) {
        if (handle.kind === "directory") {
            if (!target.getDirectoryHandle) {
                throw new Error("This browser does not support creating folders in selected folders.");
            }

            const targetDirectory = await target.getDirectoryHandle(name, { create: true });
            await copyLocalDirectory(handle, targetDirectory);
            continue;
        }

        if (!target.getFileHandle) {
            throw new Error("This browser does not support creating files in selected folders.");
        }

        const targetFile = await target.getFileHandle(name, { create: true });
        await copyLocalFile(handle, targetFile);
    }
};

const copyLocalFile = async (source: LocalFileHandle, target: LocalFileHandle): Promise<void> => {
    await writeLocalBlobHandle(target, await source.getFile());
};

const writeLocalBlobHandle = async (handle: LocalFileHandle, content: Blob): Promise<void> => {
    if (!("createWritable" in handle) || !handle.createWritable) {
        throw new Error("This browser does not support writing to selected files.");
    }

    const writable = await handle.createWritable();

    if ("getWriter" in writable) {
        const writer = (writable as unknown as WritableStream<Blob | string>).getWriter();
        await writer.write(content);
        await writer.close();
        return;
    }

    await writable.write(content);
    await writable.close();
};

const isPathInsideDirectory = (path: string, directory: string): boolean => path.startsWith(`${directory}/`);