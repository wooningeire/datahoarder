import { readdirSync } from "node:fs";
import { basename, relative, resolve } from "node:path";

export type ObsidianLinkPreprocessOptions = {
    notesDirectory: string,
    routeBase?: string,
};

type ObsidianLinkOptions = {
    notesDirectory: string,
    routeBase: string,
};

type ObsidianLink = {
    heading: string,
    label: string,
    targetPath: string,
};

type ObsidianNoteLookup = {
    byName: Map<string, string[]>,
    byPath: Map<string, string>,
};

const noteExtensionPattern = /\.(md|svx|svelte)$/u;
const cachedObsidianNoteLookups = new Map<string, ObsidianNoteLookup>();

export const normalizeObsidianLinksContent = (
    content: string,
    filename: string,
    options: ObsidianLinkOptions,
) => {
    const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u)?.[0] ?? "";
    const currentPath = getCurrentNotePath(filename, options.notesDirectory);

    return (
        frontmatter +
        replaceObsidianLinksInMarkdown(content.slice(frontmatter.length), currentPath, options)
    );
};

const replaceObsidianLinksInMarkdown = (
    content: string,
    currentPath: string | null,
    options: ObsidianLinkOptions,
) => {
    const parts = content.split(/(\r?\n)/u);
    let normalized = "";
    let inFence = false;

    for (let index = 0; index < parts.length; index += 2) {
        const line = parts[index] ?? "";
        const newline = parts[index + 1] ?? "";
        const isFenceLine = /^\s*(`{3,}|~{3,})/u.test(line);

        normalized += inFence || isFenceLine ? line : replaceObsidianLinksInLine(line, currentPath, options);
        normalized += newline;

        if (isFenceLine) {
            inFence = !inFence;
        }
    }

    return normalized;
};

const replaceObsidianLinksInLine = (
    line: string,
    currentPath: string | null,
    options: ObsidianLinkOptions,
) => {
    let normalized = "";
    let index = 0;

    while (index < line.length) {
        const codeSpan = line.slice(index).match(/^`+/u);

        if (codeSpan) {
            const marker = codeSpan[0];
            const closeIndex = line.indexOf(marker, index + marker.length);

            if (closeIndex < 0) {
                normalized += line.slice(index);
                break;
            }

            const end = closeIndex + marker.length;
            normalized += line.slice(index, end);
            index = end;
            continue;
        }

        if (line.startsWith("[[", index) && line[index - 1] !== "!") {
            const closeIndex = line.indexOf("]]", index + 2);

            if (closeIndex < 0) {
                normalized += line.slice(index);
                break;
            }

            const replacement = toObsidianAnchor(line.slice(index + 2, closeIndex), currentPath, options);
            normalized += replacement ?? line.slice(index, closeIndex + 2);
            index = closeIndex + 2;
            continue;
        }

        normalized += line[index];
        index += 1;
    }

    return normalized;
};

const toObsidianAnchor = (
    linkContent: string,
    currentPath: string | null,
    options: ObsidianLinkOptions,
) => {
    const parsed = parseObsidianLink(linkContent);

    if (!parsed) {
        return null;
    }

    return `<a href="${escapeHtml(getObsidianHref(parsed, currentPath, options))}">${escapeHtml(parsed.label)}</a>`;
};

const parseObsidianLink = (linkContent: string): ObsidianLink | null => {
    const separatorIndex = linkContent.indexOf("|");
    const rawTarget = (separatorIndex >= 0 ? linkContent.slice(0, separatorIndex) : linkContent).trim();
    const alias = separatorIndex >= 0 ? linkContent.slice(separatorIndex + 1).trim() : "";
    const headingIndex = rawTarget.indexOf("#");
    const targetPath = headingIndex >= 0 ? rawTarget.slice(0, headingIndex).trim() : rawTarget;
    const heading = headingIndex >= 0 ? rawTarget.slice(headingIndex + 1).trim() : "";
    const label = alias || getDefaultObsidianLabel(targetPath, heading);

    if (!label) {
        return null;
    }

    return {
        heading,
        label,
        targetPath,
    };
};

const getDefaultObsidianLabel = (targetPath: string, heading: string) => {
    const normalizedTarget = normalizeObsidianTargetPath(targetPath);

    if (normalizedTarget) {
        return basename(normalizedTarget);
    }

    return heading;
};

const getObsidianHref = (
    { targetPath, heading }: ObsidianLink,
    currentPath: string | null,
    options: ObsidianLinkOptions,
) => {
    const externalTarget = targetPath.trim();

    if (/^(?:https?|mailto):/iu.test(externalTarget)) {
        return `${externalTarget}${getObsidianHash(heading)}`;
    }

    const notePath = resolveObsidianNotePath(targetPath, currentPath, options);
    const baseHref = notePath
        ? `${normalizeRouteBase(options.routeBase)}/${encodeRoutePath(notePath)}`
        : normalizeRouteBase(options.routeBase) || "/";

    return `${baseHref}${getObsidianHash(heading)}`;
};

const getObsidianHash = (heading: string) => {
    return heading ? `#${encodeURIComponent(heading)}` : "";
};

const resolveObsidianNotePath = (
    targetPath: string,
    currentPath: string | null,
    options: ObsidianLinkOptions,
) => {
    const normalizedTarget = normalizeObsidianTargetPath(targetPath);

    if (!normalizedTarget) {
        return currentPath;
    }

    const lookup = getObsidianNoteLookup(options.notesDirectory);
    const targetKey = normalizedTarget.toLowerCase();
    const currentDirectory = currentPath ? getDirectoryPath(currentPath) : "";

    if (!normalizedTarget.includes("/") && currentDirectory) {
        const siblingMatch = lookup.byPath.get(`${currentDirectory}/${targetKey}`.toLowerCase());

        if (siblingMatch) {
            return siblingMatch;
        }
    }

    const directMatch = lookup.byPath.get(targetKey);

    if (directMatch) {
        return directMatch;
    }

    if (!normalizedTarget.includes("/")) {
        const nameMatches = lookup.byName.get(targetKey) ?? [];
        const sameDirectoryMatch = nameMatches.find((notePath) => getDirectoryPath(notePath) === currentDirectory);
        const closestDirectoryMatch = getClosestDirectoryMatch(nameMatches, currentDirectory);

        return sameDirectoryMatch ?? closestDirectoryMatch ?? nameMatches[0] ?? normalizedTarget;
    }

    return normalizedTarget;
};

const getClosestDirectoryMatch = (notePaths: string[], currentDirectory: string) => {
    if (!currentDirectory) {
        return null;
    }

    let bestMatch = null;
    let bestScore = -1;

    for (const notePath of notePaths) {
        const score = getSharedPathPrefixLength(getDirectoryPath(notePath), currentDirectory);

        if (score > bestScore) {
            bestMatch = notePath;
            bestScore = score;
        }
    }

    return bestMatch;
};

const getSharedPathPrefixLength = (pathA: string, pathB: string) => {
    const segmentsA = pathA ? pathA.toLowerCase().split("/") : [];
    const segmentsB = pathB ? pathB.toLowerCase().split("/") : [];
    let index = 0;

    while (segmentsA[index] && segmentsA[index] === segmentsB[index]) {
        index += 1;
    }

    return index;
};

const getObsidianNoteLookup = (notesDirectory: string) => {
    const cacheKey = resolve(notesDirectory);
    const cachedLookup = cachedObsidianNoteLookups.get(cacheKey);

    if (cachedLookup) {
        return cachedLookup;
    }

    const byPath = new Map<string, string>();
    const byName = new Map<string, string[]>();

    for (const filesystemPath of getNoteFiles(notesDirectory)) {
        const notePath = getRouteNotePath(filesystemPath, notesDirectory);

        if (!notePath) {
            continue;
        }

        byPath.set(notePath.toLowerCase(), notePath);

        const nameKey = basename(notePath).toLowerCase();
        const nameMatches = byName.get(nameKey) ?? [];
        nameMatches.push(notePath);
        byName.set(nameKey, nameMatches);
    }

    const lookup = { byName, byPath };
    cachedObsidianNoteLookups.set(cacheKey, lookup);
    return lookup;
};

const getNoteFiles = (directory: string): string[] => {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filesystemPath = resolve(directory, entry.name);

        if (entry.isDirectory()) {
            return getNoteFiles(filesystemPath);
        }

        return entry.isFile() && noteExtensionPattern.test(entry.name) ? [filesystemPath] : [];
    });
};

const getCurrentNotePath = (filename: string, notesDirectory: string) => {
    return filename ? getRouteNotePath(resolve(filename), notesDirectory) : null;
};

const getRouteNotePath = (filesystemPath: string, notesDirectory: string) => {
    const notePath = relative(notesDirectory, filesystemPath).replace(/\\/gu, "/");

    if (notePath.startsWith("../") || notePath === ".." || !noteExtensionPattern.test(notePath)) {
        return null;
    }

    return notePath.replace(noteExtensionPattern, "");
};

const normalizeObsidianTargetPath = (targetPath: string) => {
    return targetPath.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").replace(noteExtensionPattern, "");
};

const getDirectoryPath = (notePath: string) => {
    const separatorIndex = notePath.lastIndexOf("/");

    return separatorIndex >= 0 ? notePath.slice(0, separatorIndex) : "";
};

const encodeRoutePath = (path: string) => {
    return path.split("/").map(encodeURIComponent).join("/");
};

const normalizeRouteBase = (routeBase: string) => {
    if (!routeBase || routeBase === "/") {
        return "";
    }

    return `/${routeBase.replace(/^\/+|\/+$/gu, "")}`;
};

const escapeHtml = (text: string) => {
    return text.replace(/[&<>"']/gu, (character) => {
        switch (character) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case "\"":
                return "&quot;";
            case "'":
                return "&#39;";
            default:
                return character;
        }
    });
};
