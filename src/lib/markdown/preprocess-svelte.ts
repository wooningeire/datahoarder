const markdownHtmlTags = new Set([
    "a",
    "abbr",
    "aside",
    "b",
    "blockquote",
    "br",
    "button",
    "caption",
    "cite",
    "code",
    "col",
    "colgroup",
    "dd",
    "del",
    "details",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "iframe",
    "img",
    "input",
    "ins",
    "kbd",
    "label",
    "li",
    "main",
    "mark",
    "ol",
    "option",
    "p",
    "pre",
    "s",
    "section",
    "select",
    "small",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "textarea",
    "tfoot",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
    "var",
]);

export const escapeSvelteTextBraces = (content: string) => {
    let escaped = "";
    let index = 0;
    let inTag = false;

    while (index < content.length) {
        const rawElement = getRawElementAt(content, index);

        if (rawElement) {
            escaped += rawElement.content;
            index = rawElement.end;
            continue;
        }

        const character = content[index];

        if (character === "<") {
            if (!isTagStartAt(content, index)) {
                escaped += "&lt;";
                index += 1;
                continue;
            }

            inTag = true;
            escaped += character;
            index += 1;
            continue;
        }

        if (character === ">" && inTag) {
            inTag = false;
            escaped += character;
            index += 1;
            continue;
        }

        if (!inTag && (character === "{" || character === "}")) {
            escaped += character === "{" ? "&#123;" : "&#125;";
            index += 1;
            continue;
        }

        escaped += character;
        index += 1;
    }

    return escaped;
};

const getRawElementAt = (content: string, index: number) => {
    const remaining = content.slice(index).toLowerCase();
    const tagName = /^<script(?:[\s>/]|$)/u.test(remaining)
        ? "script"
        : /^<style(?:[\s>/]|$)/u.test(remaining)
            ? "style"
            : null;

    if (!tagName) {
        return null;
    }

    const closeTag = `</${tagName}>`;
    const closeIndex = content.toLowerCase().indexOf(closeTag, index);

    if (closeIndex < 0) {
        return null;
    }

    const end = closeIndex + closeTag.length;

    return {
        content: content.slice(index, end),
        end,
    };
};

const isTagStartAt = (content: string, index: number) => {
    const remaining = content.slice(index);
    const closeTag = remaining.match(/^<\/([A-Za-z][A-Za-z0-9:.-]*)\s*>/u);

    if (remaining.startsWith("<!--") || /^<[!?]/u.test(remaining)) {
        return true;
    }

    if (closeTag) {
        return markdownHtmlTags.has(closeTag[1].toLowerCase());
    }

    const openTag = remaining.match(/^<([A-Za-z][A-Za-z0-9:.-]*)([\s>/]?)/u);

    if (!openTag || !markdownHtmlTags.has(openTag[1].toLowerCase())) {
        return false;
    }

    const afterTagName = remaining.slice(openTag[0].length);

    if (openTag[2] === ">" || openTag[2] === "/") {
        return true;
    }

    if (!openTag[2]) {
        return false;
    }

    const nextAttributeCharacter = afterTagName.trimStart()[0];

    return (
        !nextAttributeCharacter ||
        nextAttributeCharacter === ">" ||
        nextAttributeCharacter === "/" ||
        /[A-Za-z_:@]/u.test(nextAttributeCharacter)
    );
};
