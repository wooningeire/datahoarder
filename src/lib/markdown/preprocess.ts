import { sanitizeFrontmatterKeysInContent } from "./preprocess-frontmatter.js";
import { normalizeDisplayMath } from "./preprocess-math.js";
import {
    normalizeObsidianLinksContent,
    type ObsidianLinkPreprocessOptions,
} from "./preprocess-obsidian.js";
import { escapeSvelteTextBraces } from "./preprocess-svelte.js";

type MarkupPreprocessorArgs = {
    content: string,
    filename: string,
};

type MarkupPreprocessorResult = {
    code: string,
} | undefined;

type MarkupPreprocessor = {
    name: string,
    markup: (args: MarkupPreprocessorArgs) => MarkupPreprocessorResult,
};

export const sanitizeFrontmatterKeys = (): MarkupPreprocessor => {
    return {
        name: "sanitize-frontmatter-keys",
        markup({ content, filename }) {
            if (!/\.(md|svx)$/u.test(filename) || !content.startsWith("---")) {
                return;
            }

            const sanitized = sanitizeFrontmatterKeysInContent(content);

            if (sanitized === content) {
                return;
            }

            return {
                code: sanitized,
            };
        },
    };
};

export const normalizeMarkdownMath = (): MarkupPreprocessor => {
    return {
        name: "normalize-markdown-math",
        markup({ content, filename }) {
            if (!/\.md$/u.test(filename)) {
                return;
            }

            const normalized = normalizeDisplayMath(content);

            if (normalized === content) {
                return;
            }

            return {
                code: normalized,
            };
        },
    };
};

export const normalizeObsidianLinks = ({
    notesDirectory,
    routeBase = "/notes",
}: ObsidianLinkPreprocessOptions): MarkupPreprocessor => {
    return {
        name: "normalize-obsidian-links",
        markup({ content, filename }) {
            if (!/\.md$/u.test(filename)) {
                return;
            }

            const normalized = normalizeObsidianLinksContent(content, filename, {
                notesDirectory,
                routeBase,
            });

            if (normalized === content) {
                return;
            }

            return {
                code: normalized,
            };
        },
    };
};

export const escapeMarkdownSvelteSyntax = (): MarkupPreprocessor => {
    return {
        name: "escape-markdown-svelte-syntax",
        markup({ content, filename }) {
            if (!/\.md$/u.test(filename)) {
                return;
            }

            const escapedBody = escapeSvelteTextBraces(content);

            if (escapedBody === content) {
                return;
            }

            return {
                code: escapedBody,
            };
        },
    };
};
