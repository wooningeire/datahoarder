import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Component } from "svelte";
import { isSvelteKitRoutePreviewFile } from "../shared/sveltekit-routes.js";
import type { LocalVaultFile } from "../vault/local-files.js";

type SvelteServerModule = {
    default?: Component<Record<string, never>>,
};

const allowedCompiledImports = new Set(["svelte/internal/server"]);
const compiledNoteCache = new Map<string, Promise<Component<Record<string, never>>>>();
const compiledNoteCacheDirectory = resolve(".svelte-kit", "datahoarder-svelte-notes");
let svelteNoteRuntime: Promise<typeof import("./svelte-note-runtime.js")> | null = null;

export const isSvelteNotePreviewFile = (path: string) => {
    return path.toLowerCase().endsWith(".svelte") && !isSvelteKitRoutePreviewFile(path);
};

export const isSvelteMarkupNotePreviewFile = (path: string) => {
    const lowerPath = path.toLowerCase();

    return (
        lowerPath.endsWith(".md") ||
        lowerPath.endsWith(".svx") ||
        (lowerPath.endsWith(".svelte") && !isSvelteKitRoutePreviewFile(path))
    );
};

export const renderSvelteNotePreview = async (
    content: string,
    file: Pick<LocalVaultFile, "path" | "size" | "updatedAt">,
) => {
    try {
        const component = await getCompiledSvelteNoteComponent(content, file);
        const runtime = await getSvelteNoteRuntime();
        const rendered = runtime.render(component);

        return [
            rendered.head,
            '<section class="datahoarder-svelte-note">',
            rendered.body,
            "</section>",
        ].filter(Boolean).join("\n");
    } catch (error) {
        return renderSvelteNotePanel({
            body: "Datahoarder could not render this Svelte note.",
            detail: getPreviewErrorDetail(error),
            title: "Svelte Note Preview Failed",
        });
    }
};

export const resetSvelteNotePreviewCacheForTest = () => {
    compiledNoteCache.clear();
};

const getCompiledSvelteNoteComponent = (
    content: string,
    file: Pick<LocalVaultFile, "path" | "size" | "updatedAt">,
) => {
    const cacheKey = getSvelteNoteCacheKey(content, file);
    const cached = compiledNoteCache.get(cacheKey);

    if (cached) {
        return cached;
    }

    const compiled = compileSvelteNoteComponent(content, file, cacheKey);

    compiledNoteCache.set(cacheKey, compiled);
    return compiled;
};

const compileSvelteNoteComponent = async (
    content: string,
    file: Pick<LocalVaultFile, "path" | "size" | "updatedAt">,
    cacheKey: string,
) => {
    const runtime = await getSvelteNoteRuntime();
    const source = await getSvelteNoteSource(content, file, runtime);
    const compiled = runtime.compile(source, {
        css: "injected",
        dev: false,
        filename: file.path.replace(/\\/gu, "/"),
        generate: "server",
    });
    const unsupportedImports = getUnsupportedCompiledImports(compiled.js.code);

    if (unsupportedImports.length) {
        throw new Error(
            [
                "Svelte note imports are not supported yet. Keep v1 Svelte notes single-file.",
                `Unsupported imports: ${unsupportedImports.join(", ")}`,
            ].join("\n"),
        );
    }

    await mkdir(compiledNoteCacheDirectory, { recursive: true });

    const modulePath = resolve(compiledNoteCacheDirectory, `${cacheKey}.mjs`);

    await writeFile(modulePath, compiled.js.code, "utf8");

    const moduleUrl = `${pathToFileURL(modulePath).href}?v=${cacheKey}`;
    const noteModule = await import(/* @vite-ignore */ moduleUrl) as SvelteServerModule;

    if (!noteModule.default) {
        throw new Error("Compiled Svelte note did not export a component.");
    }

    return noteModule.default;
};

const getSvelteNoteSource = async (
    content: string,
    file: Pick<LocalVaultFile, "path" | "size" | "updatedAt">,
    runtime: Awaited<ReturnType<typeof getSvelteNoteRuntime>>,
) => {
    const path = file.path.toLowerCase();

    if (!path.endsWith(".md") && !path.endsWith(".svx")) {
        return content;
    }

    const compiled = await runtime.compileMDSvex(content, {
        extensions: [".svx", ".md"],
        filename: file.path.replace(/\\/gu, "/"),
    });

    if (!compiled?.code) {
        throw new Error("mdsvex did not produce Svelte source.");
    }

    return compiled.code;
};

const getSvelteNoteRuntime = () => {
    if (!svelteNoteRuntime) {
        svelteNoteRuntime = import("./svelte-note-runtime.js");
    }

    return svelteNoteRuntime;
};

const getSvelteNoteCacheKey = (
    content: string,
    file: Pick<LocalVaultFile, "path" | "size" | "updatedAt">,
) => {
    return createHash("sha256")
        .update(file.path)
        .update("\0")
        .update(String(file.size))
        .update("\0")
        .update(String(file.updatedAt))
        .update("\0")
        .update(content)
        .digest("hex");
};

const getUnsupportedCompiledImports = (code: string) => {
    const imports = new Set<string>();
    const importPattern = /^\s*import\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["'];?/gmu;
    const exportPattern = /^\s*export\s+[^'"]*?\s+from\s+["']([^"']+)["'];?/gmu;

    for (const match of code.matchAll(importPattern)) {
        imports.add(match[1]);
    }

    for (const match of code.matchAll(exportPattern)) {
        imports.add(match[1]);
    }

    return [...imports]
        .filter((specifier) => !allowedCompiledImports.has(specifier))
        .sort((left, right) => left.localeCompare(right));
};

const renderSvelteNotePanel = ({
    body,
    detail = "",
    title,
}: {
    body: string,
    detail?: string,
    title: string,
}) => {
    return [
        '<section class="datahoarder-svelte-note-panel">',
        `<h1>${escapeHtml(title)}</h1>`,
        `<p>${escapeHtml(body)}</p>`,
        detail ? `<pre><code>${escapeHtml(detail)}</code></pre>` : "",
        "</section>",
    ].filter(Boolean).join("");
};

const getPreviewErrorDetail = (error: unknown) => {
    if (error instanceof Error) {
        const frame = getErrorFrame(error);

        return [error.message, frame].filter(Boolean).join("\n\n");
    }

    return typeof error === "string" ? error : "Unknown Svelte note preview error.";
};

const getErrorFrame = (error: Error) => {
    if ("frame" in error && typeof error.frame === "string") {
        return error.frame;
    }

    return "";
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
            case '"':
                return "&quot;";
            case "'":
                return "&#39;";
            default:
                return character;
        }
    });
};
