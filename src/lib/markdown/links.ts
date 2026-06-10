import { getDirectoryPath, joinRouteBase, stripCompiledNoteExtension } from "../vault/paths.js";
import { escapeAttribute } from "./html.js";
import type { PortableMarkdownOptions } from "./render.js";

type LinkLookup = {
    byName: Map<string, string[]>,
    byPath: Map<string, string>,
};

export type RenderedLink = {
    embedParameters: Record<string, string>,
    heading?: string,
    href: string,
    label: string,
    notePath?: string,
};

export const renderAnchor = (label: string, link: RenderedLink) => {
    return `<a href="${escapeAttribute(link.href)}"${getNoteDataAttributes(link)}>${label}</a>`;
};

export const toObsidianLink = (linkContent: string, options: PortableMarkdownOptions) => {
    const parts = linkContent.split("|").map((part) => part.trim());
    const rawTarget = parts[0] ?? "";
    const { alias, parameters } = parseObsidianLinkParts(parts.slice(1));
    const headingIndex = rawTarget.indexOf("#");
    const targetPath = headingIndex >= 0 ? rawTarget.slice(0, headingIndex).trim() : rawTarget;
    const heading = headingIndex >= 0 ? rawTarget.slice(headingIndex + 1).trim() : "";
    const normalizedTarget = normalizeObsidianTargetPath(targetPath);
    const label = alias || getDefaultObsidianLabel(normalizedTarget, heading);

    if (!label) {
        return null;
    }

    if (/^(?:https?|mailto):/iu.test(targetPath)) {
        return {
            embedParameters: parameters,
            href: `${targetPath}${getObsidianHash(heading)}`,
            label,
        };
    }

    const notePath = resolveObsidianNotePath(normalizedTarget, options);
    const routeBase = options.routeBase ?? "";
    const href = notePath
        ? (
            options.resolveNoteHref?.(notePath, heading) ??
                `${joinRouteBase(routeBase, notePath)}${getObsidianHash(heading)}`
        )
        : "#";

    return {
        embedParameters: parameters,
        heading,
        href,
        label,
        notePath,
    };
};

const getNoteDataAttributes = (link: RenderedLink) => {
    if (!link.notePath) {
        return "";
    }

    const headingAttribute = link.heading
        ? ` data-note-heading="${escapeAttribute(link.heading)}"`
        : "";

    return ` data-note-path="${escapeAttribute(link.notePath)}"${headingAttribute}`;
};

const parseObsidianLinkParts = (parts: string[]) => {
    const aliasParts: string[] = [];
    const parameters: Record<string, string> = {};

    for (const part of parts) {
        const parameter = parseEmbedParameter(part);

        if (parameter) {
            parameters[parameter.key] = parameter.value;
            continue;
        }

        if (part) {
            aliasParts.push(part);
        }
    }

    return {
        alias: aliasParts.join("|").trim(),
        parameters,
    };
};

const parseEmbedParameter = (value: string) => {
    const separatorIndex = value.indexOf("=");

    if (separatorIndex <= 0) {
        return null;
    }

    const rawKey = value.slice(0, separatorIndex).trim();
    const key = normalizeEmbedParameterKey(rawKey);

    if (!key) {
        return null;
    }

    return {
        key,
        value: value.slice(separatorIndex + 1).trim(),
    };
};

export const normalizeEmbedParameterKey = (key: string) => {
    return /^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(key) ? key.toLocaleLowerCase() : "";
};

const resolveObsidianNotePath = (targetPath: string, options: PortableMarkdownOptions) => {
    if (!targetPath) {
        return options.currentPath ?? "";
    }

    const lookup = getLookup(options.notePaths ?? []);
    const targetKey = targetPath.toLowerCase();
    const currentDirectory = options.currentPath ? getDirectoryPath(options.currentPath) : "";

    if (!targetPath.includes("/") && currentDirectory) {
        const siblingMatch = lookup.byPath.get(`${currentDirectory}/${targetKey}`.toLowerCase());

        if (siblingMatch) {
            return siblingMatch;
        }
    }

    const directMatch = lookup.byPath.get(targetKey);

    if (directMatch) {
        return directMatch;
    }

    if (!targetPath.includes("/")) {
        const nameMatches = lookup.byName.get(targetKey) ?? [];
        const sameDirectoryMatch = nameMatches.find((notePath) => getDirectoryPath(notePath) === currentDirectory);

        return sameDirectoryMatch ?? nameMatches[0] ?? targetPath;
    }

    return targetPath;
};

const getLookup = (notePaths: string[]): LinkLookup => {
    const byPath = new Map<string, string>();
    const byName = new Map<string, string[]>();

    for (const notePath of notePaths) {
        const normalizedPath = stripCompiledNoteExtension(notePath).replace(/\\/gu, "/");
        byPath.set(normalizedPath.toLowerCase(), normalizedPath);

        const nameKey = normalizedPath.split("/").at(-1)?.toLowerCase();

        if (!nameKey) {
            continue;
        }

        const matches = byName.get(nameKey) ?? [];
        matches.push(normalizedPath);
        byName.set(nameKey, matches);
    }

    return { byName, byPath };
};

const normalizeObsidianTargetPath = (targetPath: string) => {
    return targetPath.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").replace(/\.(md|svx|svelte)$/u, "");
};

const getDefaultObsidianLabel = (targetPath: string, heading: string) => {
    if (targetPath) {
        return targetPath.split("/").at(-1) ?? targetPath;
    }

    return heading;
};

const getObsidianHash = (heading: string) => {
    return heading ? `#${encodeURIComponent(heading)}` : "";
};
