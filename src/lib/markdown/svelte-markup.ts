export const isSvelteEnhancedMarkdownContent = (content: string) => {
    return hasSvelteRawElement(content, "script") || hasSvelteRawElement(content, "style");
};

const hasSvelteRawElement = (content: string, tagName: "script" | "style") => {
    return new RegExp(`(^|\\r?\\n)\\s*<${tagName}(?:\\s|>|$)`, "iu").test(content);
};
