type MarkdownAstNode = {
    children?: MarkdownAstNode[],
    data?: {
        hName?: string,
    },
    type: string,
    value?: string,
};

export const remarkMarkSyntax = () => {
    return (tree: MarkdownAstNode) => {
        transformMarkSyntaxChildren(tree);
    };
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
