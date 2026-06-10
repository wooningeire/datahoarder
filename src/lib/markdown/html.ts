export const escapeHtml = (text: string) => {
    return text.replace(/[&<>"']/gu, (character) => {
        switch (character) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case "\"":
                return "&quot;";
            case "'":
                return "&#39;";
            default:
                return character;
        }
    });
};

export const escapeAttribute = (text: string) => {
    return escapeHtml(text).replace(/`/gu, "&#96;");
};

export const sanitizeMarkdownUrl = (url: string, allowMailto: boolean) => {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
        return "";
    }

    const schemeMatch = trimmedUrl.match(/^([a-z][a-z0-9+.-]*):/iu);

    if (!schemeMatch) {
        return trimmedUrl;
    }

    const scheme = schemeMatch[1].toLowerCase();

    if (scheme === "http" || scheme === "https" || (allowMailto && scheme === "mailto")) {
        return trimmedUrl;
    }

    return "";
};
