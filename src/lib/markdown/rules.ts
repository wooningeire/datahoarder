export type MarkdownRuleConfig = {
    displayMath?: boolean;
    inlineMath?: boolean;
    mark?: boolean;
    underline?: boolean;
};

export type ResolvedMarkdownRuleConfig = Required<MarkdownRuleConfig>;

export type MarkdownSourceRuleOptions = {
    filename?: string;
    rules?: MarkdownRuleConfig;
};

type MarkdownAstNode = {
    children?: MarkdownAstNode[];
    data?: {
        hName?: string;
    };
    type: string;
    value?: string;
};

type DisplayMathBlock = {
    html: string;
    nextLineIndex: number;
};

const defaultMarkdownRules = {
    displayMath: true,
    inlineMath: true,
    mark: true,
    underline: true,
} satisfies ResolvedMarkdownRuleConfig;

export const markdownBlankLineHtml = '<div class="markdown-blank-line" aria-hidden="true"></div>';

export const getDefaultMarkdownRules = () => {
    return { ...defaultMarkdownRules };
};

export const resolveMarkdownRules = (rules: MarkdownRuleConfig = {}) => {
    return {
        ...defaultMarkdownRules,
        ...rules,
    };
};

export const applyMarkdownSourceRules = (
    content: string,
    options: MarkdownSourceRuleOptions = {},
) => {
    if (options.filename && !options.filename.toLowerCase().endsWith(".md")) {
        return content;
    }

    const rules = resolveMarkdownRules(options.rules);
    const displayPatchedContent = rules.displayMath
        ? applyDisplayMathSourceRule(content)
        : content;

    const transformedContent = transformMarkdownTextOutsideFences(displayPatchedContent, (line) => {
        let transformed = line;

        if (rules.inlineMath) {
            transformed = replaceInlineMath(transformed, renderEncodedInlineMath);
        }

        if (rules.mark) {
            transformed = replaceMarkSyntax(transformed, "mark");
        }

        if (rules.underline) {
            transformed = replaceUnderlineSyntax(transformed, "u");
        }

        return transformed;
    });

    return preserveMarkdownParagraphSpacing(transformedContent);
};

export const preserveMarkdownParagraphSpacing = (content: string) => {
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const { body, frontmatter } = splitMarkdownFrontmatter(content);
    const lines = body.split(/\r?\n/u);
    const preservedLines: string[] = [];
    let blankLineCount = 0;
    let hasSeenContent = false;
    let inFence = false;

    const flushBlankLines = (nextHasContent: boolean) => {
        if (!blankLineCount) {
            return;
        }

        if (!hasSeenContent || !nextHasContent) {
            for (let index = 0; index < blankLineCount; index += 1) {
                preservedLines.push("");
            }

            blankLineCount = 0;
            return;
        }

        preservedLines.push("");

        for (let index = 1; index < blankLineCount; index += 1) {
            preservedLines.push(markdownBlankLineHtml, "");
        }

        blankLineCount = 0;
    };

    for (const line of lines) {
        const isFenceLine = /^\s*(`{3,}|~{3,})/u.test(line);

        if (!inFence && !isFenceLine && !line.trim()) {
            blankLineCount += 1;
            continue;
        }

        flushBlankLines(true);
        preservedLines.push(line);

        if (isFenceLine) {
            inFence = !inFence;
        }

        if (!inFence && line.trim()) {
            hasSeenContent = true;
        }
    }

    flushBlankLines(false);

    return `${frontmatter}${preservedLines.join(newline)}`;
};

export const parseMarkdownDisplayMathBlock = (
    lines: string[],
    startIndex: number,
    rules: ResolvedMarkdownRuleConfig,
): DisplayMathBlock | null => {
    if (!rules.displayMath) {
        return null;
    }

    const line = lines[startIndex] ?? "";
    const trimmedLine = line.trim();

    if (!trimmedLine.startsWith("$$")) {
        return null;
    }

    const firstMathLine = trimmedLine.slice(2);
    const sameLineCloseIndex = firstMathLine.indexOf("$$");

    if (sameLineCloseIndex >= 0) {
        const suffix = firstMathLine.slice(sameLineCloseIndex + 2);

        if (suffix.trim()) {
            return null;
        }

        return {
            html: renderDisplayMathHtml(firstMathLine.slice(0, sameLineCloseIndex).trim()),
            nextLineIndex: startIndex,
        };
    }

    const mathLines = [firstMathLine];

    for (let lineIndex = startIndex + 1; lineIndex < lines.length; lineIndex += 1) {
        const mathLine = lines[lineIndex] ?? "";
        const closeIndex = mathLine.indexOf("$$");

        if (closeIndex >= 0) {
            const suffix = mathLine.slice(closeIndex + 2);

            if (suffix.trim()) {
                return null;
            }

            mathLines.push(mathLine.slice(0, closeIndex));

            return {
                html: renderDisplayMathHtml(mathLines.join("\n").trim()),
                nextLineIndex: lineIndex,
            };
        }

        mathLines.push(mathLine);
    }

    return null;
};

export const renderConfiguredInlineMarkdownRules = (
    escapedHtml: string,
    rules: ResolvedMarkdownRuleConfig,
) => {
    let rendered = escapedHtml;

    if (rules.inlineMath) {
        rendered = replaceInlineMath(rendered, renderInlineMathHtml);
    }

    if (rules.mark) {
        rendered = replaceMarkSyntax(rendered, "mark");
    }

    if (rules.underline) {
        rendered = replaceUnderlineSyntax(rendered, "u");
    }

    return rendered;
};

export const remarkMarkSyntax = () => {
    return (tree: MarkdownAstNode) => {
        transformMarkSyntaxChildren(tree);
    };
};

const transformMarkdownTextOutsideFences = (
    content: string,
    transformLine: (line: string) => string,
) => {
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(/\r?\n/u);
    let inFence = false;

    return lines.map((line) => {
        if (/^\s*(`{3,}|~{3,})/u.test(line)) {
            inFence = !inFence;
            return line;
        }

        return inFence ? line : transformLine(line);
    }).join(newline);
};

const transformMarkSyntaxChildren = (node: MarkdownAstNode) => {
    if (!node.children?.length) {
        return;
    }

    const transformedChildren: MarkdownAstNode[] = [];

    for (const child of node.children) {
        if (child.type === "text") {
            transformedChildren.push(...splitMarkSyntaxTextNode(child));
            continue;
        }

        transformMarkSyntaxChildren(child);
        transformedChildren.push(child);
    }

    node.children = transformedChildren;
};

const splitMarkSyntaxTextNode = (node: MarkdownAstNode) => {
    const value = node.value ?? "";
    const parts: MarkdownAstNode[] = [];
    const pattern = /(^|[^=])==([^\s=](?:[\s\S]*?[^\s=])?)==/gu;
    let lastIndex = 0;

    for (const match of value.matchAll(pattern)) {
        const prefix = match[1] ?? "";
        const markValue = match[2] ?? "";
        const matchIndex = match.index ?? 0;
        const markStartIndex = matchIndex + prefix.length;
        const markEndIndex = markStartIndex + markValue.length + 4;

        if (markStartIndex > lastIndex) {
            parts.push(createTextNode(value.slice(lastIndex, markStartIndex)));
        }

        parts.push({
            children: [createTextNode(markValue)],
            data: {
                hName: "mark",
            },
            type: "mark",
        });
        lastIndex = markEndIndex;
    }

    if (!parts.length) {
        return [node];
    }

    if (lastIndex < value.length) {
        parts.push(createTextNode(value.slice(lastIndex)));
    }

    return parts;
};

const createTextNode = (value: string): MarkdownAstNode => {
    return {
        type: "text",
        value,
    };
};

const splitMarkdownFrontmatter = (content: string) => {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u);

    if (!match) {
        return {
            body: content,
            frontmatter: "",
        };
    }

    return {
        body: content.slice(match[0].length),
        frontmatter: match[0],
    };
};

const applyDisplayMathSourceRule = (content: string) => {
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(/\r?\n/u);
    const patchedLines: string[] = [];
    let inFence = false;

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";

        if (/^\s*(`{3,}|~{3,})/u.test(line)) {
            inFence = !inFence;
            patchedLines.push(line);
            continue;
        }

        if (inFence) {
            patchedLines.push(line);
            continue;
        }

        let rest = line;
        let patchedLine = "";

        while (rest.length) {
            const openIndex = rest.indexOf("$$");

            if (openIndex < 0) {
                patchedLine += rest;
                break;
            }

            const closeIndex = rest.indexOf("$$", openIndex + 2);

            if (closeIndex >= 0) {
                patchedLine += rest.slice(0, openIndex);
                patchedLine += renderEncodedDisplayMath(rest.slice(openIndex + 2, closeIndex).trim());
                rest = rest.slice(closeIndex + 2);
                continue;
            }

            const mathLines = [rest.slice(openIndex + 2)];
            let suffix = "";
            let foundClose = false;
            let closeLineIndex = index + 1;

            for (; closeLineIndex < lines.length; closeLineIndex += 1) {
                const mathLine = lines[closeLineIndex] ?? "";
                const mathCloseIndex = mathLine.indexOf("$$");

                if (mathCloseIndex >= 0) {
                    mathLines.push(mathLine.slice(0, mathCloseIndex));
                    suffix = mathLine.slice(mathCloseIndex + 2);
                    foundClose = true;
                    break;
                }

                mathLines.push(mathLine);
            }

            if (!foundClose) {
                patchedLine += rest;
                break;
            }

            patchedLine += rest.slice(0, openIndex);
            patchedLine += renderEncodedDisplayMath(mathLines.join("\n").trim());
            rest = suffix;
            index = closeLineIndex;
        }

        patchedLines.push(patchedLine);
    }

    return patchedLines.join(newline);
};

const replaceInlineMath = (
    text: string,
    renderMath: (math: string) => string,
) => {
    let rendered = "";
    let index = 0;

    while (index < text.length) {
        const openIndex = findNextInlineMathOpen(text, index);

        if (openIndex < 0) {
            rendered += text.slice(index);
            break;
        }

        const closeIndex = findInlineMathClose(text, openIndex + 1);

        if (closeIndex < 0) {
            rendered += text.slice(index);
            break;
        }

        rendered += text.slice(index, openIndex);
        rendered += renderMath(text.slice(openIndex + 1, closeIndex));
        index = closeIndex + 1;
    }

    return rendered;
};

const findNextInlineMathOpen = (text: string, startIndex: number) => {
    for (let index = startIndex; index < text.length; index += 1) {
        if (text[index] !== "$") {
            continue;
        }

        const previous = text[index - 1] ?? "";
        const next = text[index + 1] ?? "";

        if (previous === "\\" || next === "$" || !next || /\s/u.test(next)) {
            continue;
        }

        return index;
    }

    return -1;
};

const findInlineMathClose = (text: string, startIndex: number) => {
    for (let index = startIndex; index < text.length; index += 1) {
        if (text[index] !== "$") {
            continue;
        }

        const previous = text[index - 1] ?? "";
        const next = text[index + 1] ?? "";

        if (previous === "\\" || previous === "$" || /\s/u.test(previous) || next === "$") {
            continue;
        }

        return index;
    }

    return -1;
};

const replaceMarkSyntax = (text: string, tagName: "mark") => {
    return text.replace(
        /(^|[^=])==([^\s=](?:[\s\S]*?[^\s=])?)==/gu,
        (_match, prefix: string, value: string) => `${prefix}<${tagName}>${value}</${tagName}>`,
    );
};

const replaceUnderlineSyntax = (text: string, tagName: "u") => {
    return text.replace(
        /(^|[^\p{L}\p{N}_])_([^\s_](?:[^_]*?[^\s_])?)_(?=$|[^\p{L}\p{N}_])/gu,
        (_match, prefix: string, value: string) => `${prefix}<${tagName}>${value}</${tagName}>`,
    );
};

const renderEncodedInlineMath = (math: string) => {
    return `<span class="math-inline">${encodeMathText(`\\(${math}\\)`)}</span>`;
};

const renderEncodedDisplayMath = (math: string) => {
    return `<span class="math-display">${encodeMathText(`\\[\n${math}\n\\]`)}</span>`;
};

const renderInlineMathHtml = (math: string) => {
    return `<span class="math-inline">\\(${math}\\)</span>`;
};

const renderDisplayMathHtml = (math: string) => {
    return `<span class="math-display">\\[\n${math}\n\\]</span>`;
};

const encodeMathText = (text: string) => {
    return Array.from(text)
        .map((character) => `&#${character.codePointAt(0)};`)
        .join("");
};
