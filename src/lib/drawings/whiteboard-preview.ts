import type {
    WhiteboardItem,
    WhiteboardViewport,
} from "../whiteboard/whiteboard.js";
import {
    defaultBackgroundColor,
    defaultStrokeColor,
    escapeAttribute,
    escapeHtml,
    formatJson,
    getDiamondPoints,
    round,
    sanitizeColor,
    slugifyTitle,
    type Bounds,
} from "./preview-utils.js";

export type WhiteboardDrawingNoteItem = Exclude<WhiteboardItem, { kind: "component" }>;

export type WhiteboardNoteDraft = {
    content: string,
    title: string,
};

export type WhiteboardNoteState = {
    items: WhiteboardDrawingNoteItem[],
    viewport: WhiteboardViewport,
};

const defaultWhiteboardViewport: WhiteboardViewport = { x: 120, y: 96, scale: 1 };

export const createWhiteboardNoteDraft = (title: string): WhiteboardNoteDraft => {
    const normalizedTitle = title.trim() || "Untitled Drawing";
    const slug = slugifyTitle(normalizedTitle);
    const items = createStarterWhiteboardItems(normalizedTitle, slug);
    const viewport = { ...defaultWhiteboardViewport };
    const content = [
        "---",
        "tags: [drawing, whiteboard]",
        "---",
        "<script lang=\"ts\">",
        "import { InfiniteWhiteboard, type WhiteboardItem, type WhiteboardViewport } from '@vaie/datahoarder';",
        "",
        `let items = $state<WhiteboardItem[]>(${formatJson(items)});`,
        `let viewport = $state<WhiteboardViewport>(${formatJson(viewport)});`,
        "</script>",
        "",
        `# ${normalizedTitle}`,
        "",
        "<div class=\"drawing-whiteboard\">",
        `\t<InfiniteWhiteboard bind:items bind:viewport ariaLabel="${escapeAttribute(`${normalizedTitle} whiteboard`)}" />`,
        "</div>",
        "",
        "<style lang=\"scss\">",
        ".drawing-whiteboard {",
        "\theight: min(72vh, 44rem);",
        "\tmin-height: 28rem;",
        "\toverflow: hidden;",
        "\tborder: 1px solid oklch(0.78 0.04 245 / 0.75);",
        "\tborder-radius: 0.5rem;",
        "}",
        "</style>",
        "",
    ].join("\n");

    return {
        content,
        title: normalizedTitle,
    };
};

export const isWhiteboardNoteContent = (content: string) => {
    return /<InfiniteWhiteboard\b/u.test(content) && /\bWhiteboardItem\b/u.test(content);
};

export const parseWhiteboardNoteState = (content: string): WhiteboardNoteState | null => {
    if (!isWhiteboardNoteContent(content)) {
        return null;
    }

    const itemsRange = getWhiteboardInitializerRange(content, "items");
    const viewportRange = getWhiteboardInitializerRange(content, "viewport");

    if (!itemsRange || !viewportRange) {
        return null;
    }

    try {
        const parsedItems = JSON.parse(itemsRange.text) as unknown;
        const parsedViewport = JSON.parse(viewportRange.text) as unknown;

        if (!Array.isArray(parsedItems)) {
            return null;
        }

        return {
            items: parsedItems.filter(isWhiteboardDrawingNoteItem),
            viewport: normalizeWhiteboardViewport(parsedViewport),
        };
    } catch {
        return null;
    }
};

export const updateWhiteboardNoteState = (content: string, state: WhiteboardNoteState) => {
    const itemsRange = getWhiteboardInitializerRange(content, "items");
    const viewportRange = getWhiteboardInitializerRange(content, "viewport");

    if (!itemsRange || !viewportRange) {
        throw new Error("Whiteboard state was not readable.");
    }

    return [
        { range: viewportRange, text: formatJson(state.viewport) },
        { range: itemsRange, text: formatJson(state.items) },
    ]
        .sort((a, b) => b.range.start - a.range.start)
        .reduce(
            (nextContent, replacement) =>
                `${nextContent.slice(0, replacement.range.start)}${replacement.text}${nextContent.slice(replacement.range.end)}`,
            content,
        );
};

export const renderWhiteboardNotePreview = (content: string) => {
    const state = parseWhiteboardNoteState(content);

    if (!state) {
        return "<p>Whiteboard data was not readable.</p>";
    }

    return renderWhiteboardSvg(state);
};

export const renderWhiteboardSvg = (state: WhiteboardNoteState) => {
    const items = state.items.filter((item) => item.width > 0 && item.height > 0);

    if (!items.length) {
        return "<p>Whiteboard has no visible items.</p>";
    }

    const bounds = getWhiteboardBounds(items);
    const padding = 32;
    const viewBox = [
        round(bounds.minX - padding),
        round(bounds.minY - padding),
        round(bounds.maxX - bounds.minX + padding * 2),
        round(bounds.maxY - bounds.minY + padding * 2),
    ].join(" ");
    const body = items.map(renderWhiteboardItem).filter(Boolean).join("\n");
    const ariaLabel = getWhiteboardAriaLabel(state);

    return [
        `<svg class="whiteboard-preview-svg" viewBox="${viewBox}" role="img" aria-label="${escapeAttribute(ariaLabel)}" xmlns="http://www.w3.org/2000/svg">`,
        body,
        "</svg>",
    ].join("\n");
};

const createStarterWhiteboardItems = (title: string, slug: string): WhiteboardDrawingNoteItem[] => {
    return [
        {
            kind: "shape",
            id: `${slug}-frame`,
            x: 20,
            y: 40,
            width: 340,
            height: 180,
            shape: "rectangle",
            label: "",
            fill: "oklch(0.92 0.08 215)",
            stroke: "oklch(0.45 0.13 245)",
            strokeWidth: 2,
        },
        {
            kind: "text",
            id: `${slug}-title`,
            x: 48,
            y: 82,
            width: 280,
            height: 96,
            text: title,
            background: "transparent",
            color: "oklch(0.24 0.04 260)",
            zIndex: 2,
        },
        {
            kind: "drawing",
            id: `${slug}-stroke`,
            x: 360,
            y: 116,
            width: 140,
            height: 72,
            points: [
                { x: 8, y: 54 },
                { x: 34, y: 22 },
                { x: 64, y: 42 },
                { x: 94, y: 12 },
                { x: 128, y: 58 },
            ],
            stroke: "oklch(0.5 0.16 248)",
            strokeWidth: 5,
            zIndex: 1,
        },
    ];
};

const getWhiteboardInitializerRange = (content: string, name: "items" | "viewport") => {
    const pattern = new RegExp(
        `\\b(?:let|const)\\s+${name}\\b[^=]*=\\s*(?:\\$state(?:<[^>]+>)?\\s*\\(\\s*)?`,
        "u",
    );
    const match = pattern.exec(content);

    if (!match) {
        return null;
    }

    const start = match.index + match[0].length;
    const opener = content[start];
    const closer = opener === "[" ? "]" : opener === "{" ? "}" : "";

    if (!closer) {
        return null;
    }

    const end = findMatchingBracket(content, start, opener, closer);

    if (end < 0) {
        return null;
    }

    return {
        start,
        end: end + 1,
        text: content.slice(start, end + 1),
    };
};

const findMatchingBracket = (content: string, start: number, opener: string, closer: string) => {
    let depth = 0;
    let escaping = false;
    let inString = false;

    for (let index = start; index < content.length; index += 1) {
        const character = content[index];

        if (inString) {
            if (escaping) {
                escaping = false;
                continue;
            }

            if (character === "\\") {
                escaping = true;
                continue;
            }

            if (character === "\"") {
                inString = false;
            }

            continue;
        }

        if (character === "\"") {
            inString = true;
            continue;
        }

        if (character === opener) {
            depth += 1;
            continue;
        }

        if (character === closer) {
            depth -= 1;

            if (depth === 0) {
                return index;
            }
        }
    }

    return -1;
};

const isWhiteboardDrawingNoteItem = (item: unknown): item is WhiteboardDrawingNoteItem => {
    if (!item || typeof item !== "object") {
        return false;
    }

    const candidate = item as Partial<WhiteboardDrawingNoteItem>;

    return (
        (candidate.kind === "text" || candidate.kind === "shape" || candidate.kind === "drawing") &&
        typeof candidate.id === "string" &&
        typeof candidate.x === "number" &&
        typeof candidate.y === "number" &&
        typeof candidate.width === "number" &&
        typeof candidate.height === "number"
    );
};

const normalizeWhiteboardViewport = (value: unknown): WhiteboardViewport => {
    if (!value || typeof value !== "object") {
        return { ...defaultWhiteboardViewport };
    }

    const viewport = value as Partial<WhiteboardViewport>;

    return {
        x: typeof viewport.x === "number" ? viewport.x : defaultWhiteboardViewport.x,
        y: typeof viewport.y === "number" ? viewport.y : defaultWhiteboardViewport.y,
        scale: typeof viewport.scale === "number" ? viewport.scale : defaultWhiteboardViewport.scale,
    };
};

const renderWhiteboardItem = (item: WhiteboardDrawingNoteItem) => {
    const transform = getWhiteboardTransform(item);

    if (item.kind === "shape") {
        return renderWhiteboardShape(item, transform);
    }

    if (item.kind === "drawing") {
        return renderWhiteboardDrawing(item, transform);
    }

    return renderWhiteboardText(item, transform);
};

const renderWhiteboardShape = (
    item: Extract<WhiteboardDrawingNoteItem, { kind: "shape" }>,
    transform: string,
) => {
    const stroke = sanitizeColor(item.stroke, defaultStrokeColor);
    const fill = sanitizeColor(item.fill, defaultBackgroundColor);
    const strokeWidth = Math.max(1, item.strokeWidth ?? 2);
    const commonAttributes = [
        `stroke="${escapeAttribute(stroke)}"`,
        `stroke-width="${round(strokeWidth)}"`,
        `fill="${escapeAttribute(fill)}"`,
        transform,
    ].filter(Boolean).join(" ");
    const label = item.label?.trim();
    const labelHtml = label
        ? renderWhiteboardLabel(label, item.x + item.width / 2, item.y + item.height / 2, transform)
        : "";

    if (item.shape === "ellipse") {
        return [
            `<ellipse cx="${round(item.x + item.width / 2)}" cy="${round(item.y + item.height / 2)}" rx="${round(Math.abs(item.width / 2))}" ry="${round(Math.abs(item.height / 2))}" ${commonAttributes}></ellipse>`,
            labelHtml,
        ].filter(Boolean).join("\n");
    }

    if (item.shape === "diamond") {
        return [
            `<polygon points="${getDiamondPoints(item.x, item.y, item.width, item.height)}" ${commonAttributes}></polygon>`,
            labelHtml,
        ].filter(Boolean).join("\n");
    }

    return [
        `<rect x="${round(item.x)}" y="${round(item.y)}" width="${round(item.width)}" height="${round(item.height)}" rx="8" ${commonAttributes}></rect>`,
        labelHtml,
    ].filter(Boolean).join("\n");
};

const renderWhiteboardDrawing = (
    item: Extract<WhiteboardDrawingNoteItem, { kind: "drawing" }>,
    transform: string,
) => {
    if (item.points.length < 2) {
        return "";
    }

    const points = item.points.map((point) => `${round(item.x + point.x)},${round(item.y + point.y)}`).join(" ");
    const stroke = sanitizeColor(item.stroke, defaultStrokeColor);
    const strokeWidth = Math.max(1, item.strokeWidth ?? 4);

    return `<polyline points="${points}" fill="none" stroke="${escapeAttribute(stroke)}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${round(strokeWidth)}" ${transform}></polyline>`;
};

const renderWhiteboardText = (
    item: Extract<WhiteboardDrawingNoteItem, { kind: "text" }>,
    transform: string,
) => {
    const fill = sanitizeColor(item.background, "transparent");
    const color = sanitizeColor(item.color, defaultStrokeColor);
    const lines = item.text.split(/\r?\n/u);
    const rect = fill === "none"
        ? ""
        : `<rect x="${round(item.x)}" y="${round(item.y)}" width="${round(item.width)}" height="${round(item.height)}" rx="8" fill="${escapeAttribute(fill)}" ${transform}></rect>`;
    const tspans = lines.map((line, index) => {
        const dy = index === 0 ? 0 : 22;

        return `<tspan x="${round(item.x + 16)}" dy="${round(dy)}">${escapeHtml(line)}</tspan>`;
    }).join("");
    const text = `<text x="${round(item.x + 16)}" y="${round(item.y + 28)}" fill="${escapeAttribute(color)}" font-size="18" font-family="Inter, Segoe UI, sans-serif" ${transform}>${tspans}</text>`;

    return [rect, text].filter(Boolean).join("\n");
};

const renderWhiteboardLabel = (label: string, x: number, y: number, transform: string) => {
    return `<text x="${round(x)}" y="${round(y)}" fill="${escapeAttribute(defaultStrokeColor)}" font-size="18" font-weight="700" font-family="Inter, Segoe UI, sans-serif" text-anchor="middle" dominant-baseline="middle" ${transform}>${escapeHtml(label)}</text>`;
};

const getWhiteboardAriaLabel = (state: WhiteboardNoteState) => {
    const titleItem = state.items.find(
        (item): item is Extract<WhiteboardDrawingNoteItem, { kind: "text" }> =>
            item.kind === "text" && item.text.trim().length > 0,
    );
    const title = titleItem?.text.trim().replace(/\s+/gu, " ");

    return title ? `${title} whiteboard` : "Whiteboard preview";
};

const getWhiteboardBounds = (items: WhiteboardDrawingNoteItem[]): Bounds => {
    return items.reduce(
        (bounds, item) => ({
            maxX: Math.max(bounds.maxX, item.x + Math.max(1, item.width)),
            maxY: Math.max(bounds.maxY, item.y + Math.max(1, item.height)),
            minX: Math.min(bounds.minX, item.x),
            minY: Math.min(bounds.minY, item.y),
        }),
        { maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity },
    );
};

const getWhiteboardTransform = (item: WhiteboardDrawingNoteItem) => {
    const rotation = item.rotation ?? 0;

    if (!rotation) {
        return "";
    }

    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;

    return `transform="rotate(${round(rotation)} ${round(centerX)} ${round(centerY)})"`;
};
