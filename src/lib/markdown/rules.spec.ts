import { describe, expect, it } from "vitest";
import { applyMarkdownSourceRules } from "./rules.js";

describe("markdown source rules", () => {
    it("patches markdown-only custom rules before mdsvex parses the source", () => {
        const html = applyMarkdownSourceRules(
            [
                "Inline $E = mc^2$ and ==marked== and _underlined_.",
                "",
                "$$",
                "f(x) = x^2",
                "$$",
                "",
                "```",
                "$code$ ==code== _code_",
                "```",
            ].join("\n"),
            { filename: "Notes/Math.md" },
        );

        expect(html).toContain('class="math-inline"');
        expect(html).toContain('class="math-display"');
        expect(html).toContain("<mark>marked</mark>");
        expect(html).toContain("<u>underlined</u>");
        expect(html).toContain("$code$ ==code== _code_");
        expect(html).toContain("&#92;&#40;&#69;&#32;&#61;&#32;&#109;&#99;&#94;&#50;&#92;&#41;");
    });

    it("lets callers disable source patches", () => {
        const content = "Inline $x$ and ==marked== and _underlined_.";
        const html = applyMarkdownSourceRules(content, {
            filename: "Notes/Literal.md",
            rules: {
                displayMath: false,
                inlineMath: false,
                mark: false,
                underline: false,
            },
        });

        expect(html).toBe(content);
    });

    it("does not patch svx sources unless a caller applies the rules explicitly", () => {
        const content = "Inline $x$ and ==marked== and _underlined_.";

        expect(applyMarkdownSourceRules(content, { filename: "Notes/Raw.svx" })).toBe(content);
    });
});
