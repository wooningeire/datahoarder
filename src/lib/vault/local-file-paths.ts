import { isIgnoredLocalDirectoryName } from "./local-directory-helpers.js";
import { stripCompiledNoteExtension } from "./paths.js";

const textExtensionPattern = /\.(base|css|csv|html|js|json|md|scss|svelte|svx|ts|txt|yaml|yml)$/iu;

export const isEditableTextFile = (path: string) => {
    const fileName = path.replace(/\\/gu, "/").split("/").at(-1) ?? "";

    if (!fileName || fileName.startsWith(".")) {
        return false;
    }

    return !fileName.includes(".") || textExtensionPattern.test(fileName);
};

export const getLocalRoutePath = (path: string) => {
    if (path.endsWith(".base")) {
        return path;
    }

    return stripCompiledNoteExtension(path);
};

export const normalizeLocalDirectoryPath = (path: string) => {
    return normalizeLocalPathSegments(path, "Folder path").join("/");
};

export const normalizeLocalTextPath = (path: string, defaultExtension = ".md") => {
    let normalizedPath = normalizeLocalPathSegments(path, "File path").join("/");

    if (defaultExtension && !getPathExtension(normalizedPath)) {
        normalizedPath = `${normalizedPath}${defaultExtension}`;
    }

    if (!isEditableTextFile(normalizedPath)) {
        throw new Error("Only editable text files can be managed here.");
    }

    if (normalizedPath.split("/").slice(0, -1).some(isIgnoredLocalDirectoryName)) {
        throw new Error("This folder name is reserved by the vault index.");
    }

    return normalizedPath;
};

export const getPathExtension = (path: string) => {
    const fileName = path.split("/").at(-1) ?? "";
    const extensionIndex = fileName.lastIndexOf(".");

    return extensionIndex > 0 ? fileName.slice(extensionIndex).toLowerCase() : "";
};

const normalizeLocalPathSegments = (path: string, label: string) => {
    const trimmedPath = path.trim().replace(/\\/gu, "/");

    if (!trimmedPath) {
        throw new Error(`${label} is required.`);
    }

    if (/^(?:[a-z]:)?\//iu.test(trimmedPath) || /^[a-z]:/iu.test(trimmedPath)) {
        throw new Error("Use a path relative to the opened vault.");
    }

    const segments = trimmedPath
        .replace(/^\.\/+/u, "")
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (!segments.length) {
        throw new Error(`${label} is required.`);
    }

    if (segments.some((segment) => segment === "." || segment === "..")) {
        throw new Error("File paths cannot contain . or .. segments.");
    }

    if (segments.some((segment) => /[<>:"|?*\u0000-\u001f]/u.test(segment))) {
        throw new Error("File paths cannot contain Windows-reserved characters.");
    }

    return segments;
};
