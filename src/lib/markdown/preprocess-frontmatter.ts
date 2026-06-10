export const sanitizeFrontmatterKeysInContent = (content: string) => {
    if (!content.startsWith("---")) {
        return content;
    }

    const closeMarker = content.search(/\r?\n---\r?\n/u);

    if (closeMarker < 0) {
        return content;
    }

    const frontmatter = content.slice(0, closeMarker);
    const body = content.slice(closeMarker);
    const usedKeys = new Set<string>();
    const sanitizedFrontmatter = frontmatter.replace(
        /^([^#\s][^:\n]*):/gmu,
        (_match, key: string) => `${getUniqueSafeIdentifier(key, usedKeys)}:`,
    );

    return `${sanitizedFrontmatter}${body}`;
};

const getUniqueSafeIdentifier = (key: string, usedKeys: Set<string>) => {
    const safeKey = toSafeIdentifier(key.trim());
    let uniqueKey = safeKey;
    let suffix = 2;

    while (usedKeys.has(uniqueKey)) {
        uniqueKey = `${safeKey}_${suffix}`;
        suffix += 1;
    }

    usedKeys.add(uniqueKey);
    return uniqueKey;
};

const toSafeIdentifier = (key: string) => {
    const identifier = key.replace(/[^A-Za-z0-9_$]/gu, "_").replace(/_+/gu, "_");
    const safeIdentifier = /^[A-Za-z_$]/u.test(identifier) ? identifier : `_${identifier}`;

    if (reservedWords.has(safeIdentifier)) {
        return `${safeIdentifier}_`;
    }

    return safeIdentifier;
};

const reservedWords = new Set([
    "arguments",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "eval",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "null",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
]);
