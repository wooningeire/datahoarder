import {
    normalizeLocalDirectoryPath,
    normalizeLocalTextPath,
} from "../../vault/local-files.js";

export const getSuggestedCreatePath = (
    directoryPath: string | undefined,
    globalPath: string,
    localFileName: string,
): string => {
    if (directoryPath === undefined) {
        return globalPath;
    }

    const normalizedDirectoryPath = directoryPath.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");

    return normalizedDirectoryPath ? `${normalizedDirectoryPath}/${localFileName}` : localFileName;
};

export const splitCreatePath = (path: string) => {
    const segments = path.split("/").filter(Boolean);
    const fileName = segments.pop() ?? "Untitled.md";

    return {
        directoryPath: segments.join("/"),
        fileName,
    };
};

export const getInlineCreatePath = (
    directoryPath: string,
    fileName: string,
    defaultExtension: string,
): string => {
    const fileNameStem = stripMatchingExtension(fileName, defaultExtension);

    if (!fileNameStem) {
        throw new Error("File name is required.");
    }

    const nextFileName = normalizeLocalTextPath(
        fileNameStem + defaultExtension,
        "",
    );

    if (nextFileName.includes("/")) {
        throw new Error("Use a file name, not a path. Choose the folder in the sidebar first.");
    }

    return directoryPath ? `${directoryPath}/${nextFileName}` : nextFileName;
};

export const getInlineCreateDirectoryPath = (
    directoryPath: string,
    directoryName: string,
): string => {
    const nextDirectoryName = normalizeLocalDirectoryPath(directoryName);

    if (nextDirectoryName.includes("/")) {
        throw new Error("Use a folder name, not a path. Choose the parent folder in the sidebar first.");
    }

    return directoryPath ? `${directoryPath}/${nextDirectoryName}` : nextDirectoryName;
};

const stripMatchingExtension = (fileName: string, extension: string): string => {
    const trimmedFileName = fileName.trim();

    if (!extension || !trimmedFileName.toLowerCase().endsWith(extension.toLowerCase())) {
        return trimmedFileName;
    }

    return trimmedFileName.slice(0, -extension.length);
};
