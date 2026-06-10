import {
    getDatahoarderBoardLinks,
    getDatahoarderBoardPreview,
    isDatahoarderBoardFile,
    parseDatahoarderBoard,
} from "../boards/local-board.js";
import { stripFrontmatter } from "../note-model/raw.js";
import { parseSimpleYaml } from "../shared/simple-yaml.js";
import { readLocalFile, type LocalVaultFile } from "./local-files.js";
import { getDirectoryPath, getNoteTitle } from "./paths.js";
import type {
    VaultLink,
    VaultPropertyValue,
    VaultRecord,
} from "./index.js";

export const toVaultRecord = async (file: LocalVaultFile): Promise<VaultRecord> => {
    const content = await readLocalFile(file);

    if (isDatahoarderBoardFile(file.path)) {
        return toBoardVaultRecord(file, content);
    }

    const frontmatter = getFrontmatter(content);
    const body = stripFrontmatter(content).trim();
    const properties = mergeProperties(parseInlineProperties(body), frontmatter ? parseSimpleYaml(frontmatter) : {});
    const title = getTitle(file.path, body, properties);

    return {
        basename: getBasename(file.path),
        content,
        extension: file.extension,
        folder: getDirectoryPath(file.path),
        links: getLinks(body),
        path: file.path,
        preview: getPreview(body, title),
        properties,
        routePath: file.routePath,
        size: file.size,
        tags: getTags(body, properties),
        title,
        updatedAt: file.updatedAt,
    };
};

const toBoardVaultRecord = (file: LocalVaultFile, content: string): VaultRecord => {
    const board = parseDatahoarderBoard(content, file.path);

    return {
        basename: getBoardBasename(file.path),
        content,
        extension: file.extension,
        folder: getDirectoryPath(file.path),
        links: getDatahoarderBoardLinks(board),
        path: file.path,
        preview: getDatahoarderBoardPreview(board),
        properties: board.properties,
        routePath: file.routePath,
        size: file.size,
        tags: board.tags,
        title: board.title,
        updatedAt: file.updatedAt,
    };
};

const getFrontmatter = (content: string) => {
    return content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1] ?? "";
};

const parseInlineProperties = (body: string) => {
    const properties: Record<string, VaultPropertyValue> = {};
    let fenceMarker = "";

    for (const line of body.split(/\r?\n/u)) {
        const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);

        if (fenceMarker) {
            if (fenceMatch && fenceMatch[1][0] === fenceMarker[0] && fenceMatch[1].length >= fenceMarker.length) {
                fenceMarker = "";
            }

            continue;
        }

        if (fenceMatch) {
            fenceMarker = fenceMatch[1];
            continue;
        }

        const propertyMatch = line.match(/^\s*([\p{L}_][\p{L}\p{N}_ ./-]*?)::\s*(.*)$/u);

        if (!propertyMatch) {
            continue;
        }

        const key = propertyMatch[1].trim();

        if (!key) {
            continue;
        }

        appendPropertyValue(properties, key, parseInlinePropertyValue(key, propertyMatch[2].trim()));
    }

    return properties;
};

const parseInlinePropertyValue = (key: string, rawValue: string): VaultPropertyValue => {
    if (!rawValue) {
        return "";
    }

    const parsed = parseSimpleYaml(`${key}: ${rawValue}`);

    return parsed[key] ?? getPropertyValue(parsed, key);
};

const mergeProperties = (
    bodyProperties: Record<string, VaultPropertyValue>,
    frontmatterProperties: Record<string, VaultPropertyValue>,
) => {
    const properties = { ...bodyProperties };

    for (const [key, value] of Object.entries(frontmatterProperties)) {
        const existingKey = findPropertyKey(properties, key);

        if (existingKey && existingKey !== key) {
            delete properties[existingKey];
        }

        properties[key] = value;
    }

    return properties;
};

const appendPropertyValue = (
    properties: Record<string, VaultPropertyValue>,
    key: string,
    value: VaultPropertyValue,
) => {
    const existingKey = findPropertyKey(properties, key);

    if (!existingKey) {
        properties[key] = value;
        return;
    }

    const existingValue = properties[existingKey];
    properties[existingKey] = Array.isArray(existingValue) ? [...existingValue, value] : [existingValue, value];
};

const getPropertyValue = (properties: Record<string, VaultPropertyValue>, key: string) => {
    const exactValue = properties[key];

    if (exactValue !== undefined) {
        return exactValue;
    }

    const matchingKey = findPropertyKey(properties, key);

    return matchingKey ? properties[matchingKey] : "";
};

const findPropertyKey = (properties: Record<string, VaultPropertyValue>, key: string) => {
    const normalizedKey = normalizePropertyKey(key);

    return Object.keys(properties).find((propertyKey) => normalizePropertyKey(propertyKey) === normalizedKey);
};

const normalizePropertyKey = (key: string) => {
    return key.trim().toLocaleLowerCase();
};

const getTitle = (path: string, body: string, properties: Record<string, VaultPropertyValue>) => {
    const frontmatterTitle = properties.title;

    if (typeof frontmatterTitle === "string" && frontmatterTitle.trim()) {
        return frontmatterTitle.trim();
    }

    const firstHeading = body.match(/^#\s+(.+)$/mu)?.[1]?.trim();

    if (firstHeading) {
        return firstHeading;
    }

    return getNoteTitle(path);
};

const getBasename = (path: string) => {
    return path.split("/").at(-1)?.replace(/\.(md|svx)$/iu, "") ?? path;
};

const getBoardBasename = (path: string) => {
    return path.split("/").at(-1)?.replace(/\.dhboard\.(?:json|ya?ml)$/iu, "") ?? path;
};

const getPreview = (body: string, title: string) => {
    const plain = body
        .replace(/^#{1,6}\s+.+$/gmu, "")
        .replace(/```[\s\S]*?```/gu, "")
        .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
        .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu, "$2$1")
        .replace(/[*_`>#-]/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();

    return plain || title;
};

const getTags = (body: string, properties: Record<string, VaultPropertyValue>) => {
    const tags = new Set<string>();
    const propertyTags = properties.tags ?? properties.tag;

    for (const tag of toStringList(propertyTags)) {
        tags.add(normalizeTag(tag));
    }

    for (const match of body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
        tags.add(normalizeTag(match[1]));
    }

    return [...tags].filter(Boolean).sort((a, b) => a.localeCompare(b));
};

const getLinks = (body: string) => {
    const links: VaultLink[] = [];

    for (const match of body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu)) {
        const target = match[1].trim();

        if (!target) {
            continue;
        }

        links.push({
            label: match[2]?.trim() || target,
            target,
            type: "obsidian",
        });
    }

    for (const match of body.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/gu)) {
        const target = match[2].trim();

        if (!target || /^(?:https?|mailto):/iu.test(target)) {
            continue;
        }

        links.push({
            label: match[1].trim(),
            target,
            type: "markdown",
        });
    }

    return links;
};

const toStringList = (value: VaultPropertyValue | undefined): string[] => {
    if (Array.isArray(value)) {
        return value.flatMap(toStringList);
    }

    if (value === null || value === undefined || typeof value === "object") {
        return [];
    }

    return String(value)
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
};

const normalizeTag = (tag: string) => {
    return tag.trim().replace(/^#/u, "");
};
