import {
    formatVaultValue,
    getVaultRecordValue,
    type VaultPropertyValue,
    type VaultRecord,
} from "../vault/index.js";
import { getDirectoryPath } from "../vault/paths.js";
import type {
    CollectionMatchRule,
    CollectionMatchRuleObject,
    CollectionSource,
} from "./types.js";

export const matchesCollectionSource = (
    record: VaultRecord,
    source: CollectionSource,
    collectionPath: string,
) => {
    if (!hasExplicitSource(source)) {
        return false;
    }

    return (
        matchesFolders(record, source.folders, collectionPath) &&
        matchesFiles(record, source.files, collectionPath) &&
        matchesTags(record, source.tags) &&
        matchesRules(record, source.match)
    );
};

export const hasExplicitSource = (source: CollectionSource) => {
    return (
        source.files.length > 0 ||
        source.folders.length > 0 ||
        source.tags.length > 0 ||
        Object.keys(source.match).length > 0
    );
};

export const getCollectionRecordFolder = (collectionPath: string, source: CollectionSource) => {
    if (source.folders.length) {
        return getSourcePathCandidates(source.folders[0], collectionPath)[0] ?? "";
    }

    return getDirectoryPath(collectionPath);
};

export const getSourcePathCandidates = (path: string, collectionPath: string) => {
    const normalizedPath = normalizePath(path);

    if (path.trim().startsWith("/")) {
        return [normalizedPath];
    }

    const collectionDirectory = getDirectoryPath(collectionPath);
    const relativePath = normalizePath(collectionDirectory ? `${collectionDirectory}/${path}` : path);

    return [...new Set([relativePath, normalizedPath])].filter(Boolean);
};

export const normalizeSourcePath = (path: string) => {
    const rootRelative = path.trim().startsWith("/");
    const normalizedPath = normalizePath(path);

    return rootRelative && normalizedPath ? `/${normalizedPath}` : normalizedPath;
};

export const normalizePath = (path: string) => {
    const segments: string[] = [];

    for (const segment of path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").split("/")) {
        if (!segment || segment === ".") {
            continue;
        }

        if (segment === "..") {
            segments.pop();
            continue;
        }

        segments.push(segment);
    }

    return segments.join("/");
};

export const isUnsupportedBuiltinMatchField = (field: string) => {
    const normalizedField = field.toLowerCase();

    return isBuiltinCollectionField(field) && normalizedField !== "tags" && normalizedField !== "title";
};

export const isBuiltinCollectionField = (field: string) => {
    return [
        "basename",
        "file.ctime",
        "file.folder",
        "file.mtime",
        "file.name",
        "file.path",
        "file.size",
        "folder",
        "path",
        "preview",
        "size",
        "tags",
        "title",
        "updatedat",
    ].includes(field.toLowerCase());
};

export const hasValue = (value: VaultPropertyValue): boolean => {
    return (
        value !== null &&
        value !== undefined &&
        value !== "" &&
        (!Array.isArray(value) || value.length > 0) &&
        (typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 0)
    );
};

export const valuesEqual = (
    valueA: VaultPropertyValue,
    valueB: VaultPropertyValue | undefined,
): boolean => {
    if (Array.isArray(valueA)) {
        return valueA.some((item) => valuesEqual(item, valueB));
    }

    if (Array.isArray(valueB)) {
        return valueB.some((item) => valuesEqual(valueA, item));
    }

    return formatVaultValue(valueA).toLowerCase() === formatVaultValue(valueB ?? "").toLowerCase();
};

export const valueIncludes = (
    value: VaultPropertyValue,
    expected: VaultPropertyValue | undefined,
) => {
    if (Array.isArray(value)) {
        return value.some((item) => valuesEqual(item, expected));
    }

    return formatVaultValue(value).toLowerCase().includes(formatVaultValue(expected ?? "").toLowerCase());
};

export const isMatchRuleObject = (rule: CollectionMatchRule): rule is CollectionMatchRuleObject => {
    return isRecord(rule) && ("equals" in rule || "exists" in rule || "includes" in rule);
};

const matchesFolders = (record: VaultRecord, folders: string[], collectionPath: string) => {
    if (!folders.length) {
        return true;
    }

    return folders.some((folder) =>
        getSourcePathCandidates(folder, collectionPath).some(
            (candidate) => record.path === candidate || record.path.startsWith(`${candidate}/`),
        )
    );
};

const matchesFiles = (record: VaultRecord, files: string[], collectionPath: string) => {
    if (!files.length) {
        return true;
    }

    const paths = new Set(files.flatMap((file) => getSourcePathCandidates(file, collectionPath)));

    return paths.has(record.path) || paths.has(record.routePath);
};

const matchesTags = (record: VaultRecord, tags: string[]) => {
    if (!tags.length) {
        return true;
    }

    const recordTags = new Set(record.tags.map((tag) => tag.toLowerCase()));

    return tags.every((tag) => recordTags.has(tag.replace(/^#/u, "").toLowerCase()));
};

const matchesRules = (record: VaultRecord, rules: Record<string, CollectionMatchRule>) => {
    return Object.entries(rules).every(([key, rule]) => {
        const value = getVaultRecordValue(record, key);

        if (isMatchRuleObject(rule)) {
            if (typeof rule.exists === "boolean") {
                const exists = hasValue(value);

                if (rule.exists !== exists) {
                    return false;
                }
            }

            if ("equals" in rule && !valuesEqual(value, rule.equals)) {
                return false;
            }

            if ("includes" in rule && !valueIncludes(value, rule.includes)) {
                return false;
            }

            return true;
        }

        return valuesEqual(value, rule);
    });
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return Boolean(value) && !Array.isArray(value) && typeof value === "object";
};
