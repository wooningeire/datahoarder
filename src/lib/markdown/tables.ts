import type { PortableMarkdownOptions } from "./render.js";

type RenderInline = (text: string, options: PortableMarkdownOptions) => string;

type MarkdownTableAlignment = "center" | "left" | "right" | "";

type RenderedMarkdownTable = {
    html: string,
    nextLineIndex: number,
};

export const parseMarkdownTable = (
    lines: string[],
    startIndex: number,
    options: PortableMarkdownOptions,
    renderInline: RenderInline,
): RenderedMarkdownTable | null => {
    const headerCells = parseMarkdownTableRow(lines[startIndex]);
    const separatorCells = parseMarkdownTableRow(lines[startIndex + 1] ?? "");

    if (!headerCells || !separatorCells || headerCells.length < 2 || !isMarkdownTableSeparator(separatorCells)) {
        return null;
    }

    const columnCount = headerCells.length;
    const alignments = separatorCells.slice(0, columnCount).map(getMarkdownTableAlignment);
    const bodyRows: string[][] = [];
    let lineIndex = startIndex + 2;

    while (lineIndex < lines.length) {
        const rowCells = parseMarkdownTableRow(lines[lineIndex]);

        if (!rowCells) {
            break;
        }

        bodyRows.push(normalizeMarkdownTableCells(rowCells, columnCount));
        lineIndex += 1;
    }

    const headerHtml = normalizeMarkdownTableCells(headerCells, columnCount)
        .map((cell, index) => renderMarkdownTableCell("th", cell, alignments[index] ?? "", options, renderInline))
        .join("");
    const bodyHtml = bodyRows.map((row) => {
        const cells = row
            .map((cell, index) => renderMarkdownTableCell("td", cell, alignments[index] ?? "", options, renderInline))
            .join("");

        return `<tr>${cells}</tr>`;
    }).join("");

    return {
        html: [
            "<div class=\"markdown-table-wrapper\">",
            "<table class=\"markdown-table\">",
            `<thead><tr>${headerHtml}</tr></thead>`,
            `<tbody>${bodyHtml}</tbody>`,
            "</table>",
            "</div>",
        ].join(""),
        nextLineIndex: lineIndex - 1,
    };
};

const parseMarkdownTableRow = (line: string) => {
    if (!line.includes("|")) {
        return null;
    }

    const trimmedLine = line.trim();
    const content = trimmedLine.startsWith("|") && trimmedLine.endsWith("|")
        ? trimmedLine.slice(1, -1)
        : trimmedLine;
    const cells: string[] = [];
    let currentCell = "";
    let inCode = false;
    let escaping = false;

    for (const character of content) {
        if (escaping) {
            currentCell += character;
            escaping = false;
            continue;
        }

        if (character === "\\") {
            escaping = true;
            continue;
        }

        if (character === "`") {
            inCode = !inCode;
            currentCell += character;
            continue;
        }

        if (character === "|" && !inCode) {
            cells.push(currentCell.trim());
            currentCell = "";
            continue;
        }

        currentCell += character;
    }

    if (escaping) {
        currentCell += "\\";
    }

    cells.push(currentCell.trim());

    return cells;
};

const isMarkdownTableSeparator = (cells: string[]) => {
    return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.replace(/\s+/gu, "")));
};

const getMarkdownTableAlignment = (cell: string): MarkdownTableAlignment => {
    const normalizedCell = cell.replace(/\s+/gu, "");
    const left = normalizedCell.startsWith(":");
    const right = normalizedCell.endsWith(":");

    if (left && right) {
        return "center";
    }

    if (right) {
        return "right";
    }

    if (left) {
        return "left";
    }

    return "";
};

const normalizeMarkdownTableCells = (cells: string[], columnCount: number) => {
    return Array.from({ length: columnCount }, (_item, index) => cells[index] ?? "");
};

const renderMarkdownTableCell = (
    tagName: "td" | "th",
    content: string,
    alignment: MarkdownTableAlignment,
    options: PortableMarkdownOptions,
    renderInline: RenderInline,
) => {
    const alignmentAttribute = alignment ? ` data-align="${alignment}"` : "";

    return `<${tagName}${alignmentAttribute}>${renderInline(content, options)}</${tagName}>`;
};
