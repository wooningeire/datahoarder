import { stripFrontmatter } from "../note-model/raw.js";
import { escapeAttribute, escapeHtml } from "./html.js";
import { normalizeEmbedParameterKey, renderAnchor, toObsidianLink } from "./links.js";
import type { PortableMarkdownOptions } from "./render.js";

type PortableMarkdownRenderer = (content: string, options: PortableMarkdownOptions) => string;

export const renderEmbedBlock = (
    linkContent: string,
    options: PortableMarkdownOptions,
    renderMarkdown: PortableMarkdownRenderer,
) => {
    const link = toObsidianLink(linkContent, options);

    if (!link?.notePath || !options.resolveEmbedContent) {
        return renderMissingEmbed();
    }

    const maxEmbedDepth = options.maxEmbedDepth ?? 4;
    const embedDepth = options._embedDepth ?? 0;
    const embedKey = `${link.notePath}#${link.heading ?? ""}`.toLowerCase();
    const embedStack = options._embedStack ?? [];

    if (embedDepth >= maxEmbedDepth || embedStack.includes(embedKey)) {
        return renderMissingEmbed("Embed skipped to avoid a recursive loop.");
    }

    const embeddedContent = options.resolveEmbedContent(link.notePath);
    const embeddedBody = embeddedContent
        ? getEmbeddedMarkdownBody(embeddedContent, link.heading ?? "")
        : "";

    if (!embeddedBody) {
        return renderMissingEmbed();
    }

    const bodyHtml = renderParameterizedEmbedMarkdown(
        embeddedBody,
        link.embedParameters,
        {
            ...options,
            currentPath: link.notePath,
            interactiveTaskLists: false,
            _embedDepth: embedDepth + 1,
            _embedStack: [...embedStack, embedKey],
        },
        renderMarkdown,
    );

    return [
        `<aside class="note-embed" data-note-path="${escapeAttribute(link.notePath)}">`,
        `<header>${renderAnchor(escapeHtml(link.label), link)}</header>`,
        `<div class="note-embed-body">${bodyHtml}</div>`,
        "</aside>",
    ].join("");
};

const renderMissingEmbed = (message = "Embedded note unavailable.") => {
    return `<aside class="note-embed note-embed-missing"><p>${escapeHtml(message)}</p></aside>`;
};

const renderParameterizedEmbedMarkdown = (
    content: string,
    parameters: Record<string, string>,
    options: PortableMarkdownOptions,
    renderMarkdown: PortableMarkdownRenderer,
) => {
    if (!Object.keys(parameters).length) {
        return renderMarkdown(content, options);
    }

    const replacements = new Map<string, string>();
    let index = 0;
    const tokenizedContent = content.replace(/\{\{\s*([\w.-]+)\s*\}\}/gu, (match, key: string) => {
        const value = parameters[normalizeEmbedPlaceholderKey(key)];

        if (value === undefined) {
            return match;
        }

        const token = `datahoarder-embed-param-${index}:`;
        index += 1;
        replacements.set(token, value);

        return token;
    });
    const html = renderMarkdown(tokenizedContent, options);

    return replaceEmbedParameterTokensInText(html, replacements);
};

const normalizeEmbedPlaceholderKey = (key: string) => {
    const normalizedKey = normalizeEmbedParameterKey(key);

    return normalizedKey.startsWith("embed.") ? normalizedKey.slice("embed.".length) : normalizedKey;
};

const replaceEmbedParameterTokensInText = (html: string, replacements: Map<string, string>) => {
    let result = "";
    let inTag = false;

    for (let index = 0; index < html.length;) {
        const character = html[index];

        if (character === "<") {
            inTag = true;
            result += character;
            index += 1;
            continue;
        }

        if (character === ">") {
            inTag = false;
            result += character;
            index += 1;
            continue;
        }

        if (!inTag) {
            const replacement = getEmbedParameterTokenReplacement(html, index, replacements);

            if (replacement) {
                result += escapeHtml(replacement.value);
                index += replacement.token.length;
                continue;
            }
        }

        result += character;
        index += 1;
    }

    return result;
};

const getEmbedParameterTokenReplacement = (
    html: string,
    index: number,
    replacements: Map<string, string>,
) => {
    for (const [token, value] of replacements) {
        if (html.startsWith(token, index)) {
            return { token, value };
        }
    }

    return null;
};

const getEmbeddedMarkdownBody = (content: string, heading: string) => {
    const body = stripFrontmatter(content).trim();

    if (!heading) {
        return body;
    }

    const lines = body.split(/\r?\n/u);
    const normalizedHeading = normalizeHeadingText(heading);
    let startIndex = -1;
    let headingLevel = 0;

    for (let index = 0; index < lines.length; index += 1) {
        const match = lines[index].match(/^(#{1,6})\s+(.+)$/u);

        if (!match || normalizeHeadingText(match[2]) !== normalizedHeading) {
            continue;
        }

        startIndex = index + 1;
        headingLevel = match[1].length;
        break;
    }

    if (startIndex < 0) {
        return "";
    }

    const endIndex = lines.findIndex((line, index) => {
        if (index < startIndex) {
            return false;
        }

        const match = line.match(/^(#{1,6})\s+/u);

        return Boolean(match && match[1].length <= headingLevel);
    });

    return lines.slice(startIndex, endIndex < 0 ? undefined : endIndex).join("\n").trim();
};

const normalizeHeadingText = (text: string) => {
    return text
        .replace(/[*_`]/gu, "")
        .replace(/\s+/gu, " ")
        .trim()
        .toLowerCase();
};
