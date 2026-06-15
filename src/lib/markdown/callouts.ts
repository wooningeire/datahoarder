type MarkdownAstNode = {
    children?: MarkdownAstNode[],
    data?: {
        hName?: string,
        hProperties?: Record<string, unknown>,
    },
    identifier?: string,
    type: string,
    value?: string,
};

type MarkdownCalloutMarker = {
    firstLineEndIndex: number,
    title: string,
    titleStartIndex: number,
    type: string,
};

type RemarkCalloutOpening = {
    bodyParagraphs: MarkdownAstNode[],
    titleChildren: MarkdownAstNode[],
    type: string,
};

export type MarkdownCallout = {
    bodyLines: string[],
    title: string,
    type: string,
};

const calloutMarkerPattern = /^\[!([^\]\s]+)\]([+-])?[ \t]*(.*)$/u;

export const parseMarkdownCallout = (
    quoteLines: string[],
): MarkdownCallout | null => {
    const marker = parseMarkdownCalloutMarker(quoteLines[0]?.trim() ?? "");

    if (!marker) {
        return null;
    }

    return {
        bodyLines: quoteLines.slice(1),
        title: marker.title || getMarkdownCalloutDefaultTitle(marker.type),
        type: marker.type,
    };
};

export const getMarkdownCalloutClassName = (type: string) => {
    return `markdown-callout markdown-callout-${normalizeMarkdownCalloutType(type)}`;
};

export const remarkObsidianCallouts = () => {
    return (tree: MarkdownAstNode) => {
        transformObsidianCalloutChildren(tree);
    };
};

const transformObsidianCalloutChildren = (node: MarkdownAstNode) => {
    if (!node.children?.length) {
        return;
    }

    for (const child of node.children) {
        if (child.type === "blockquote") {
            transformObsidianCalloutBlock(child);
        }

        transformObsidianCalloutChildren(child);
    }
};

const transformObsidianCalloutBlock = (node: MarkdownAstNode) => {
    const firstParagraph = node.children?.[0];

    if (firstParagraph?.type !== "paragraph") {
        return;
    }

    const opening = getRemarkCalloutOpening(firstParagraph);

    if (!opening) {
        return;
    }

    node.data = {
        ...node.data,
        hName: "aside",
        hProperties: {
            ...(node.data?.hProperties ?? {}),
            "data-callout": opening.type,
            className: ["markdown-callout", `markdown-callout-${opening.type}`],
        },
    };

    node.children = [
        {
            ...firstParagraph,
            data: {
                ...firstParagraph.data,
                hProperties: {
                    ...(firstParagraph.data?.hProperties ?? {}),
                    className: ["markdown-callout-title"],
                },
            },
            children: opening.titleChildren,
        },
        ...opening.bodyParagraphs,
        ...(node.children ?? []).slice(1),
    ];
};

const getRemarkCalloutOpening = (
    firstParagraph: MarkdownAstNode,
): RemarkCalloutOpening | null => {
    const children = firstParagraph.children ?? [];
    const firstInline = children[0];

    if (!firstInline) {
        return null;
    }

    if (firstInline.type === "text") {
        const marker = parseMarkdownCalloutMarker(firstInline.value ?? "");

        if (!marker) {
            return null;
        }

        return getTextMarkerCalloutOpening(firstInline, marker, children.slice(1));
    }

    const referenceType = getCalloutTypeFromLinkReference(firstInline);

    if (!referenceType) {
        return null;
    }

    return getReferenceMarkerCalloutOpening(referenceType, children.slice(1));
};

const getTextMarkerCalloutOpening = (
    firstInline: MarkdownAstNode,
    marker: MarkdownCalloutMarker,
    followingChildren: MarkdownAstNode[],
): RemarkCalloutOpening => {
    const source = firstInline.value ?? "";
    const titleText = source
        .slice(marker.titleStartIndex, marker.firstLineEndIndex)
        .trimStart();
    const bodyText = getTextAfterFirstLine(source, marker.firstLineEndIndex);
    const hasBodyText = Boolean(bodyText.trim());
    const titleChildren = [
        createTextNode(titleText),
        ...(hasBodyText ? [] : followingChildren),
    ].filter(hasVisibleInlineContent);

    return {
        bodyParagraphs: getCalloutBodyParagraphs([
            createTextNode(bodyText),
            ...(hasBodyText ? followingChildren : []),
        ]),
        titleChildren: titleChildren.length
            ? titleChildren
            : [createTextNode(getMarkdownCalloutDefaultTitle(marker.type))],
        type: marker.type,
    };
};

const getReferenceMarkerCalloutOpening = (
    type: string,
    followingChildren: MarkdownAstNode[],
): RemarkCalloutOpening => {
    const firstTitleChild = followingChildren[0];

    if (firstTitleChild?.type !== "text") {
        return {
            bodyParagraphs: [],
            titleChildren: followingChildren.length
                ? followingChildren
                : [createTextNode(getMarkdownCalloutDefaultTitle(type))],
            type,
        };
    }

    const source = firstTitleChild.value ?? "";
    const firstLineEndIndex = getFirstLineEndIndex(source);
    const titleText = source
        .slice(0, firstLineEndIndex)
        .replace(/^[ \t]*[+-]?[ \t]*/u, "");
    const bodyText = getTextAfterFirstLine(source, firstLineEndIndex);
    const hasBodyText = Boolean(bodyText.trim());
    const remainingChildren = followingChildren.slice(1);
    const titleChildren = [
        createTextNode(titleText),
        ...(hasBodyText ? [] : remainingChildren),
    ].filter(hasVisibleInlineContent);

    return {
        bodyParagraphs: getCalloutBodyParagraphs([
            createTextNode(bodyText),
            ...(hasBodyText ? remainingChildren : []),
        ]),
        titleChildren: titleChildren.length
            ? titleChildren
            : [createTextNode(getMarkdownCalloutDefaultTitle(type))],
        type,
    };
};

const getCalloutBodyParagraphs = (children: MarkdownAstNode[]) => {
    const bodyChildren = children.filter(hasVisibleInlineContent);

    if (!bodyChildren.length) {
        return [];
    }

    return [{
        type: "paragraph",
        children: bodyChildren,
    }];
};

const getCalloutTypeFromLinkReference = (node: MarkdownAstNode) => {
    if (node.type !== "linkReference" || !node.identifier?.startsWith("!")) {
        return "";
    }

    return normalizeMarkdownCalloutType(node.identifier.slice(1));
};

const parseMarkdownCalloutMarker = (
    text: string,
): MarkdownCalloutMarker | null => {
    const firstLineEndIndex = getFirstLineEndIndex(text);
    const firstLine = text.slice(0, firstLineEndIndex);
    const match = firstLine.match(calloutMarkerPattern);

    if (!match) {
        return null;
    }

    const title = match[3] ?? "";

    return {
        firstLineEndIndex,
        title: title.trim(),
        titleStartIndex: firstLine.length - title.length,
        type: normalizeMarkdownCalloutType(match[1] ?? ""),
    };
};

const getFirstLineEndIndex = (text: string) => {
    const newlineIndex = text.search(/\r?\n/u);

    return newlineIndex >= 0 ? newlineIndex : text.length;
};

const getTextAfterFirstLine = (text: string, firstLineEndIndex: number) => {
    return text.slice(firstLineEndIndex).replace(/^\r?\n/u, "");
};

const normalizeMarkdownCalloutType = (type: string) => {
    return type.toLowerCase()
        .replace(/[^a-z0-9-]+/gu, "-")
        .replace(/^-+|-+$/gu, "") || "note";
};

const getMarkdownCalloutDefaultTitle = (type: string) => {
    const title = type
        .split("-")
        .filter(Boolean)
        .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
        .join(" ");

    return title || "Note";
};

const hasVisibleInlineContent = (node: MarkdownAstNode) => {
    return node.type !== "text" || Boolean(node.value?.trim());
};

const createTextNode = (value: string): MarkdownAstNode => {
    return {
        type: "text",
        value,
    };
};
