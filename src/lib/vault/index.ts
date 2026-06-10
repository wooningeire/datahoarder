import { isDatahoarderBoardFile } from "../boards/local-board.js";
import type { SimpleYamlValue } from "../shared/simple-yaml.js";
import type { LocalVaultFile } from "./local-files.js";
import { createBacklinksByPath } from "./vault-backlinks.js";
import { toVaultRecord } from "./vault-records.js";

export type VaultPropertyValue = SimpleYamlValue;

export type VaultLink = {
    label: string,
    target: string,
    type: "board" | "markdown" | "obsidian",
};

export type VaultRecord = {
    basename: string,
    content: string,
    extension: string,
    folder: string,
    links: VaultLink[],
    path: string,
    preview: string,
    properties: Record<string, VaultPropertyValue>,
    routePath: string,
    size: number,
    tags: string[],
    title: string,
    updatedAt: number,
};

export type VaultIndex = {
    backlinksByPath: Map<string, VaultBacklink[]>,
    records: VaultRecord[],
    recordsByPath: Map<string, VaultRecord>,
    recordsByRoutePath: Map<string, VaultRecord>,
};

export type VaultIndexBuildOptions = {
    changedPaths?: Iterable<string>,
    concurrency?: number,
    previousIndex?: VaultIndex | null,
};

export type VaultBacklink = {
    links: VaultLink[],
    record: VaultRecord,
};

const indexedNoteExtensionPattern = /\.(md|svx)$/iu;
const defaultIndexConcurrency = 8;

export const createEmptyVaultIndex = (): VaultIndex => {
    return {
        backlinksByPath: new Map(),
        records: [],
        recordsByPath: new Map(),
        recordsByRoutePath: new Map(),
    };
};

export const buildLocalVaultIndex = async (
    files: LocalVaultFile[],
    options: VaultIndexBuildOptions = {},
) => {
    const changedPaths = new Set(
        [...(options.changedPaths ?? [])].map((path) => path.trim()).filter(Boolean),
    );
    const indexedFiles = files.filter((file) => isIndexedNoteFile(file.path));
    const records = await mapFilesWithConcurrency(
        indexedFiles,
        (file) => getReusableVaultRecord(file, options.previousIndex ?? null, changedPaths) ?? toVaultRecord(file),
        options.concurrency ?? defaultIndexConcurrency,
    );

    return createVaultIndex(records);
};

export const createVaultIndex = (records: VaultRecord[]): VaultIndex => {
    const recordsByPath = new Map(records.map((record) => [record.path, record]));
    const recordsByRoutePath = new Map(records.map((record) => [record.routePath, record]));

    return {
        backlinksByPath: createBacklinksByPath(records),
        records,
        recordsByPath,
        recordsByRoutePath,
    };
};

export const isIndexedNoteFile = (path: string) => {
    return indexedNoteExtensionPattern.test(path) || isDatahoarderBoardFile(path);
};

export const getVaultRecordValue = (record: VaultRecord, key: string): VaultPropertyValue => {
    const normalizedKey = key.trim().toLowerCase();

    if (normalizedKey.startsWith("note.")) {
        return getPropertyValue(record.properties, key.trim().slice(5));
    }

    switch (normalizedKey) {
        case "basename":
        case "file.name":
            return record.basename;
        case "folder":
        case "file.folder":
            return record.folder;
        case "path":
        case "file.path":
            return record.path;
        case "preview":
            return record.preview;
        case "size":
        case "file.size":
            return record.size;
        case "tags":
            return record.tags;
        case "title":
            return record.title;
        case "updatedat":
        case "file.ctime":
        case "file.mtime":
            return record.updatedAt;
        default:
            return getPropertyPathValue(record.properties, key);
    }
};

export const getVaultBacklinks = (index: VaultIndex, targetRecord: VaultRecord): VaultBacklink[] => {
    return index.backlinksByPath.get(targetRecord.path) ?? [];
};

export const formatVaultValue = (value: VaultPropertyValue): string => {
    if (Array.isArray(value)) {
        return value.map(formatVaultValue).filter(Boolean).join(", ");
    }

    if (value === null || value === undefined) {
        return "";
    }

    if (typeof value === "object") {
        if (Object.keys(value).length === 0) {
            return "";
        }

        return JSON.stringify(value);
    }

    return String(value);
};

const getReusableVaultRecord = (
    file: LocalVaultFile,
    previousIndex: VaultIndex | null,
    changedPaths: Set<string>,
) => {
    if (!previousIndex || changedPaths.has(file.path) || changedPaths.has(file.routePath)) {
        return null;
    }

    const record = previousIndex.recordsByPath.get(file.path);

    if (
        !record ||
        record.extension !== file.extension ||
        record.routePath !== file.routePath ||
        record.size !== file.size ||
        record.updatedAt !== file.updatedAt
    ) {
        return null;
    }

    return record;
};

const getPropertyValue = (properties: Record<string, VaultPropertyValue>, key: string) => {
    const exactValue = properties[key];

    if (exactValue !== undefined) {
        return exactValue;
    }

    const matchingKey = findPropertyKey(properties, key);

    return matchingKey ? properties[matchingKey] : "";
};

const getPropertyPathValue = (properties: Record<string, VaultPropertyValue>, key: string): VaultPropertyValue => {
    const directValue = getPropertyValue(properties, key);

    if (directValue !== "") {
        return directValue;
    }

    const path = key.split(".").map((part) => part.trim()).filter(Boolean);

    if (path.length < 2) {
        return directValue;
    }

    let value: VaultPropertyValue | undefined = getPropertyValue(properties, path[0]);

    for (const segment of path.slice(1)) {
        if (!isPropertyRecord(value)) {
            return "";
        }

        value = getPropertyValue(value, segment);
    }

    return value ?? "";
};

const findPropertyKey = (properties: Record<string, VaultPropertyValue>, key: string) => {
    const normalizedKey = normalizePropertyKey(key);

    return Object.keys(properties).find((propertyKey) => normalizePropertyKey(propertyKey) === normalizedKey);
};

const isPropertyRecord = (value: VaultPropertyValue | undefined): value is Record<string, VaultPropertyValue> => {
    return Boolean(value) && !Array.isArray(value) && typeof value === "object";
};

const normalizePropertyKey = (key: string) => {
    return key.trim().toLocaleLowerCase();
};

const mapFilesWithConcurrency = async <T>(
    files: LocalVaultFile[],
    mapper: (file: LocalVaultFile) => Promise<T> | T,
    concurrency: number,
) => {
    if (!files.length) {
        return [];
    }

    const results = new Array<T>(files.length);
    const workerCount = Math.min(files.length, getSafeConcurrency(concurrency));
    let nextIndex = 0;
    let completed = 0;

    const runWorker = async () => {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;

            if (index >= files.length) {
                return;
            }

            results[index] = await mapper(files[index]);
            completed += 1;

            if (completed % workerCount === 0) {
                await yieldToEventLoop();
            }
        }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));

    return results;
};

const getSafeConcurrency = (concurrency: number) => {
    if (!Number.isFinite(concurrency) || concurrency < 1) {
        return defaultIndexConcurrency;
    }

    return Math.max(1, Math.min(32, Math.floor(concurrency)));
};

const yieldToEventLoop = () => {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
};
