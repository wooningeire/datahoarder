export type Bounds = {
    maxX: number,
    maxY: number,
    minX: number,
    minY: number,
};

export const defaultStrokeColor = "#1f2937";
export const defaultBackgroundColor = "transparent";

export const getDiamondPoints = (x: number, y: number, width: number, height: number) => {
    return [
        [x + width / 2, y],
        [x + width, y + height / 2],
        [x + width / 2, y + height],
        [x, y + height / 2],
    ].map(([pointX, pointY]) => `${round(pointX)},${round(pointY)}`).join(" ");
};

export const sanitizeColor = (color: string | undefined, fallback: string) => {
    if (!color || color === "transparent") {
        return color === "transparent" ? "none" : fallback;
    }

    if (
        /^#[0-9a-f]{3,8}$/iu.test(color) ||
        /^[a-z]+$/iu.test(color) ||
        /^(?:oklch|oklab|rgb|rgba|hsl|hsla)\([0-9a-z.%\s,/-]+\)$/iu.test(color)
    ) {
        return color;
    }

    return fallback;
};

export const formatJson = (value: unknown) => {
    return JSON.stringify(value, null, "\t");
};

export const slugifyTitle = (title: string) => {
    const slug = title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "");

    return slug || "drawing";
};

export const clamp = (value: number, min: number, max: number) => {
    return Math.min(max, Math.max(min, value));
};

export const round = (value: number) => {
    return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
};

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
