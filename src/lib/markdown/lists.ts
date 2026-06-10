import type { PortableMarkdownOptions } from "./render.js";

type RenderInline = (text: string, options: PortableMarkdownOptions) => string;

type MarkdownListType = "ordered" | "unordered";

type MarkdownListItem = {
    content: string,
    indent: number,
    type: MarkdownListType,
};

export const parseMarkdownList = (
    lines: string[],
    startIndex: number,
    indent: number,
    type: MarkdownListType,
    options: PortableMarkdownOptions,
    taskListIndex: { value: number },
    renderInline: RenderInline,
) => {
    const tagName = type === "ordered" ? "ol" : "ul";
    const items: string[] = [];
    let lineIndex = startIndex;

    while (lineIndex < lines.length) {
        const item = getMarkdownListItem(lines[lineIndex]);

        if (!item || item.indent < indent || item.indent > indent || item.type !== type) {
            break;
        }

        const itemStart = renderMarkdownListItemStart(item, options, taskListIndex, renderInline);
        let nestedHtml = "";
        lineIndex += 1;

        while (lineIndex < lines.length) {
            const nestedItem = getMarkdownListItem(lines[lineIndex]);

            if (!nestedItem || nestedItem.indent <= indent) {
                break;
            }

            const nestedList = parseMarkdownList(
                lines,
                lineIndex,
                nestedItem.indent,
                nestedItem.type,
                options,
                taskListIndex,
                renderInline,
            );
            nestedHtml += nestedList.html;
            lineIndex = nestedList.nextLineIndex;
        }

        items.push(`${itemStart}${nestedHtml}</li>`);
    }

    return {
        html: `<${tagName}>${items.join("")}</${tagName}>`,
        nextLineIndex: lineIndex,
        nextTaskListIndex: taskListIndex.value,
    };
};

export const getMarkdownListItem = (line: string): MarkdownListItem | null => {
    const match = line.match(/^([ \t]*)(?:(\d+)\.|[-*])\s+(.+)$/u);

    if (!match) {
        return null;
    }

    return {
        content: match[3],
        indent: getMarkdownIndentWidth(match[1]),
        type: match[2] ? "ordered" : "unordered",
    };
};

const getMarkdownIndentWidth = (indent: string) => {
    let width = 0;

    for (const character of indent) {
        width += character === "\t" ? 4 - (width % 4) : 1;
    }

    return width;
};

const renderMarkdownListItemStart = (
    item: MarkdownListItem,
    options: PortableMarkdownOptions,
    taskListIndex: { value: number },
    renderInline: RenderInline,
) => {
    const taskItem = item.type === "unordered" ? item.content.match(/^\[([ xX])\]\s+(.+)$/u) : null;

    if (!taskItem) {
        return `<li>${renderInline(item.content, options)}`;
    }

    const checked = taskItem[1].toLowerCase() === "x";
    const checkboxAttributes = options.interactiveTaskLists
        ? ` data-task-index="${taskListIndex.value}"`
        : " disabled";
    taskListIndex.value += 1;

    return [
        "<li class=\"task-list-item\">",
        `<input type="checkbox"${checkboxAttributes}${checked ? " checked" : ""}>`,
        ` <span>${renderInline(taskItem[2], options)}</span>`,
    ].join("");
};
