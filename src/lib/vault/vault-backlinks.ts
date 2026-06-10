import { getDirectoryPath, stripCompiledNoteExtension } from "./paths.js";
import type {
    VaultBacklink,
    VaultLink,
    VaultRecord,
} from "./index.js";

type RecordLookup = {
    byName: Map<string, VaultRecord>,
    byPath: Map<string, VaultRecord>,
    byPathWithoutExtension: Map<string, VaultRecord>,
    byRoutePath: Map<string, VaultRecord>,
};

export const createBacklinksByPath = (records: VaultRecord[]) => {
    const backlinksByPath = new Map<string, VaultBacklink>();
    const backlinksByTargetPath = new Map<string, VaultBacklink[]>();
    const lookup = createRecordLookup(records);

    for (const record of records) {
        for (const link of record.links) {
            const linkedRecord = resolveVaultLinkRecord(record, link, lookup);

            if (!linkedRecord || linkedRecord.path === record.path) {
                continue;
            }

            const backlinkKey = `${linkedRecord.path}\n${record.path}`;
            const backlink = backlinksByPath.get(backlinkKey) ?? { links: [], record };

            backlink.links.push(link);
            backlinksByPath.set(backlinkKey, backlink);

            const targetBacklinks = backlinksByTargetPath.get(linkedRecord.path) ?? [];

            if (!targetBacklinks.includes(backlink)) {
                targetBacklinks.push(backlink);
                backlinksByTargetPath.set(linkedRecord.path, targetBacklinks);
            }
        }
    }

    return backlinksByTargetPath;
};

const resolveVaultLinkRecord = (sourceRecord: VaultRecord, link: VaultLink, lookup: RecordLookup) => {
    const target = cleanLinkTarget(link.target);

    if (!target) {
        return null;
    }

    const candidates = getLinkTargetCandidates(sourceRecord, target);

    for (const candidate of candidates) {
        const normalizedCandidate = normalizeLinkedPath(stripCompiledNoteExtension(candidate));
        const record =
            lookup.byRoutePath.get(normalizedCandidate) ??
            lookup.byPathWithoutExtension.get(normalizedCandidate) ??
            lookup.byPath.get(normalizeLinkedPath(candidate));

        if (record) {
            return record;
        }
    }

    if (!target.includes("/")) {
        return lookup.byName.get(normalizeLinkedPath(stripCompiledNoteExtension(target))) ?? null;
    }

    return null;
};

const createRecordLookup = (records: VaultRecord[]) => {
    const byName = new Map<string, VaultRecord>();
    const byPath = new Map<string, VaultRecord>();
    const byPathWithoutExtension = new Map<string, VaultRecord>();
    const byRoutePath = new Map<string, VaultRecord>();

    for (const record of records) {
        const routePath = normalizeLinkedPath(record.routePath);
        const path = normalizeLinkedPath(record.path);
        const name = routePath.split("/").at(-1);

        byRoutePath.set(routePath, record);
        byPath.set(path, record);
        byPathWithoutExtension.set(normalizeLinkedPath(stripCompiledNoteExtension(record.path)), record);

        if (name && !byName.has(name)) {
            byName.set(name, record);
        }
    }

    return {
        byName,
        byPath,
        byPathWithoutExtension,
        byRoutePath,
    };
};

const getLinkTargetCandidates = (sourceRecord: VaultRecord, target: string) => {
    if (target.startsWith("#")) {
        return [sourceRecord.routePath, sourceRecord.path];
    }

    const rootRelative = target.startsWith("/");
    const normalizedTarget = normalizeLinkedPath(target);

    if (rootRelative) {
        return [normalizedTarget];
    }

    const sourceDirectory = getDirectoryPath(sourceRecord.routePath);
    const siblingTarget = sourceDirectory ? normalizeLinkedPath(`${sourceDirectory}/${target}`) : normalizedTarget;

    return [...new Set([siblingTarget, normalizedTarget])];
};

const cleanLinkTarget = (target: string) => {
    const trimmedTarget = target.trim();

    if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmedTarget)) {
        return "";
    }

    const withoutHash = trimmedTarget.split("#")[0] ?? "";
    const withoutQuery = withoutHash.split("?")[0] ?? "";

    return withoutQuery.trim();
};

const normalizeLinkedPath = (path: string) => {
    const segments: string[] = [];
    let escapedRoot = false;

    for (const segment of path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").split("/")) {
        if (!segment || segment === ".") {
            continue;
        }

        if (segment === "..") {
            if (segments.length) {
                segments.pop();
            } else {
                escapedRoot = true;
            }

            continue;
        }

        segments.push(segment);
    }

    return escapedRoot ? "" : segments.join("/").toLowerCase();
};
