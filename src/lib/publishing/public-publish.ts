import { createStandaloneHtmlDocument, escapeHtml } from "./html-export.js";
import { getDirectoryPath } from "../vault/paths.js";
import type {
    VaultPropertyValue,
    VaultRecord,
} from "../vault/index.js";
import {
    getPublicPublishRecords,
} from "./public-publish-profiles.js";

export type PublicPublishMatchRule =
    | VaultPropertyValue
    | PublicPublishMatchRuleObject;

export type PublicPublishMatchRuleObject = {
    equals?: VaultPropertyValue,
    exists?: boolean,
    includes?: VaultPropertyValue,
};

export type PublicPublishSource = {
    files: string[],
    folders: string[],
    match: Record<string, PublicPublishMatchRule>,
    query: string,
    tags: string[],
};

export type PublicPublishProfile = {
    name: string,
    outputDirectory: string,
    path: string,
    requirePublic: boolean,
    source: PublicPublishSource,
    subtitle: string,
};

export type PublicPublishEntry = {
    outputPath: string,
    preview: string,
    routePath: string,
    sourcePath: string,
    title: string,
    updatedAt: number,
};

export type PublicPublishFile = {
    content: string,
    path: string,
};

export type PublicPublishBundle = {
    entries: PublicPublishEntry[],
    files: PublicPublishFile[],
    outputDirectory: string,
};

export type PublicPublishOptions = {
    outputDirectory?: string,
    profile?: PublicPublishProfile | null,
    subtitle?: string,
};

export type RenderPublicRecordHtml = (
    record: VaultRecord,
    entry: PublicPublishEntry,
    entries: PublicPublishEntry[],
) => string;

export {
    getPublicPublishRecords,
    getPublicVaultRecords,
    isPublicPublishProfileFile,
    isPublicVaultRecord,
    parsePublicPublishProfile,
    readPublicPublishProfiles,
} from "./public-publish-profiles.js";

export const createPublicPublishBundle = (
    records: VaultRecord[],
    renderBodyHtml: RenderPublicRecordHtml,
    options: PublicPublishOptions = {},
): PublicPublishBundle => {
    const outputDirectory = normalizeOutputDirectory(
        options.outputDirectory ?? options.profile?.outputDirectory ?? "public",
    );
    const publicRecords = getPublicPublishRecords(records, options.profile ?? null);
    const entries = createPublicPublishEntries(publicRecords, outputDirectory);
    const files: PublicPublishFile[] = [
        {
            path: `${outputDirectory}/index.html`,
            content: createStandaloneHtmlDocument({
                bodyHtml: renderPublicPublishIndexHtml(entries, `${outputDirectory}/index.html`),
                subtitle: options.subtitle ?? options.profile?.subtitle ?? "Datahoarder public index",
                title: options.profile?.name ?? "Public Notes",
            }),
        },
        ...entries.map((entry) => {
            const record = publicRecords.find((candidate) => candidate.path === entry.sourcePath);
            const bodyHtml = record ? renderBodyHtml(record, entry, entries) : "";

            return {
                path: entry.outputPath,
                content: createStandaloneHtmlDocument({
                    bodyHtml,
                    subtitle: options.subtitle ?? options.profile?.subtitle ?? "Datahoarder public note",
                    title: entry.title,
                }),
            };
        }),
    ];

    return {
        entries,
        files,
        outputDirectory,
    };
};

export const createPublicPublishEntries = (records: VaultRecord[], outputDirectory = "public") => {
    const normalizedOutputDirectory = normalizeOutputDirectory(outputDirectory);
    const usedPaths = new Set<string>([`${normalizedOutputDirectory}/index.html`]);

    return records.map((record) => {
        const outputPath = getUniqueOutputPath(getPublicPublishOutputPath(record, normalizedOutputDirectory), usedPaths);
        usedPaths.add(outputPath);

        return {
            outputPath,
            preview: record.preview,
            routePath: record.routePath,
            sourcePath: record.path,
            title: record.title,
            updatedAt: record.updatedAt,
        };
    });
};

export const getPublicPublishOutputPath = (record: VaultRecord, outputDirectory = "public") => {
    const routeSegments = record.routePath.split("/").map(slugifyPathSegment).filter(Boolean);
    const fileSegments = routeSegments.length ? routeSegments : [slugifyPathSegment(record.title) || "note"];
    const fileName = `${fileSegments.pop() ?? "note"}.html`;

    return [normalizeOutputDirectory(outputDirectory), ...fileSegments, fileName].filter(Boolean).join("/");
};

export const renderPublicPublishIndexHtml = (
    entries: PublicPublishEntry[],
    indexPath = "public/index.html",
) => {
    if (!entries.length) {
        return "<p>No public notes were selected.</p>";
    }

    const items = entries
        .slice()
        .sort((entryA, entryB) => entryA.title.localeCompare(entryB.title, undefined, { sensitivity: "base" }))
        .map((entry) => {
            const href = getPublicPublishHref(indexPath, entry.outputPath);

            return [
                "<li>",
                `<a href="${escapeHtml(href)}">${escapeHtml(entry.title)}</a>`,
                "</li>",
            ].filter(Boolean).join("");
        })
        .join("\n");

    return `<ul class="public-index">${items}</ul>`;
};

export const getPublicPublishHref = (currentOutputPath: string, targetOutputPath: string, heading = "") => {
    if (!targetOutputPath) {
        return "#";
    }

    const relativePath = getRelativePublishPath(getDirectoryPath(currentOutputPath), targetOutputPath);
    const hash = heading ? `#${encodeURIComponent(heading)}` : "";

    return `${relativePath}${hash}`;
};

const getUniqueOutputPath = (path: string, usedPaths: Set<string>) => {
    if (!usedPaths.has(path)) {
        return path;
    }

    const extensionIndex = path.lastIndexOf(".");
    const stem = extensionIndex > 0 ? path.slice(0, extensionIndex) : path;
    const extension = extensionIndex > 0 ? path.slice(extensionIndex) : "";

    for (let index = 2; index < 1000; index += 1) {
        const candidate = `${stem}-${index}${extension}`;

        if (!usedPaths.has(candidate)) {
            return candidate;
        }
    }

    return path;
};

const getRelativePublishPath = (fromDirectory: string, targetPath: string) => {
    const fromSegments = fromDirectory.split("/").filter(Boolean);
    const targetSegments = targetPath.split("/").filter(Boolean);

    while (fromSegments.length && targetSegments.length && fromSegments[0] === targetSegments[0]) {
        fromSegments.shift();
        targetSegments.shift();
    }

    return [...fromSegments.map(() => ".."), ...targetSegments].join("/") || "./";
};

const normalizeOutputDirectory = (path: string) => {
    const segments = path.replace(/\\/gu, "/").split("/").map(slugifyPathSegment).filter(Boolean);

    return segments.join("/") || "public";
};

const slugifyPathSegment = (segment: string) => {
    const slug = segment
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "");

    return slug || "note";
};
