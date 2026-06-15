import { describe, expect, it } from "vitest";
import {
    isSvelteMarkupNotePreviewFile,
    isSvelteNotePreviewFile,
    renderSvelteNotePreview,
    resetSvelteNotePreviewCacheForTest,
} from "./svelte-note.js";

const svelteNotePreviewTimeoutMs = 60_000;

describe("Svelte note preview rendering", () => {
    it("recognizes ordinary Svelte notes but not SvelteKit route files", () => {
        expect(isSvelteNotePreviewFile("Notes/Dashboard.svelte")).toBe(true);
        expect(isSvelteNotePreviewFile("src/routes/+page.svelte")).toBe(false);
        expect(isSvelteNotePreviewFile("+page.svelte")).toBe(false);
        expect(isSvelteNotePreviewFile("Notes/Dashboard.md")).toBe(false);
        expect(isSvelteMarkupNotePreviewFile("Notes/Dashboard.md")).toBe(true);
        expect(isSvelteMarkupNotePreviewFile("Notes/Dashboard.svx")).toBe(true);
        expect(isSvelteMarkupNotePreviewFile("Notes/Dashboard.svelte")).toBe(true);
        expect(isSvelteMarkupNotePreviewFile("src/routes/+page.svelte")).toBe(false);
    });

    it("server-renders a single-file Svelte note with scoped styles", async () => {
        resetSvelteNotePreviewCacheForTest();

        const html = await renderSvelteNotePreview(
            [
                '<script>const title = "Datahoarder Svelte Note";</script>',
                "<style>h1 { color: oklch(0.4 0.2 240); }</style>",
                "<h1>{title}</h1>",
            ].join("\n"),
            createFile("Notes/Dashboard.svelte"),
        );

        expect(html).toContain("Datahoarder Svelte Note");
        expect(html).toContain("<style");
        expect(html).toContain("oklch(0.4 0.2 240)");
        expect(html).toContain("datahoarder-svelte-note");
    }, svelteNotePreviewTimeoutMs);

    it("server-renders a single-file Svelte note with SCSS styles", async () => {
        resetSvelteNotePreviewCacheForTest();

        const html = await renderSvelteNotePreview(
            [
                '<style lang="scss">',
                ".kanban-board {",
                "    display: flex;",
                "    align-items: flex-start; // Keeps columns from stretching",
                "",
                "    .kanban-column {",
                "        color: oklch(0.42 0.12 160);",
                "    }",
                "}",
                "</style>",
                '<section class="kanban-board">',
                '    <article class="kanban-column">Kanban SCSS</article>',
                "</section>",
            ].join("\n"),
            createFile("Notes/Kanban.svelte"),
        );

        expect(html).toContain("Kanban SCSS");
        expect(html).toContain("oklch(42% 0.12 160deg)");
        expect(html).not.toContain("Svelte Note Preview Failed");
        expect(html).not.toContain("css_expected_identifier");
    }, svelteNotePreviewTimeoutMs);

    it("server-renders an mdsvex markdown note with Svelte expressions", async () => {
        resetSvelteNotePreviewCacheForTest();

        const html = await renderSvelteNotePreview(
            [
                '<script lang="ts">',
                "let x = $state(1);",
                "</script>",
                "",
                "# Markdown {x}",
            ].join("\n"),
            createFile("Notes/Counter.md"),
        );

        expect(html).toContain("<h1>Markdown 1</h1>");
        expect(html).not.toContain("{x}");
        expect(html).not.toContain("&lt;script");
    }, svelteNotePreviewTimeoutMs);

    it("server-renders markdown notes with soft newlines and extra blank-line markers", async () => {
        resetSvelteNotePreviewCacheForTest();

        const html = await renderSvelteNotePreview(
            [
                "First line",
                "second line",
                "",
                "Next paragraph",
                "",
                "",
                "Final paragraph",
            ].join("\n"),
            createFile("Notes/Line Spacing.md"),
        );

        expect(html).toContain('class="datahoarder-svelte-note datahoarder-markdown-note"');
        expect(html).toContain("<p>First line\nsecond line</p>");
        expect(html).toContain('class="markdown-blank-line"');
        expect(html.match(/markdown-blank-line/gu)).toHaveLength(1);
    }, svelteNotePreviewTimeoutMs);

    it("server-renders markdown display math before Svelte parses TeX escapes", async () => {
        resetSvelteNotePreviewCacheForTest();

        const html = await renderSvelteNotePreview(
            [
                "Inline $E = mc^2$ and ==marked== and _underlined_.",
                "",
                "$$",
                "f(x) = e^{-\\frac12\\left(\\frac{x - \\bar x}\\sigma\\right)^2}",
                "$$",
            ].join("\n"),
            createFile("Notes/Gaussian.md"),
        );

        expect(html).toContain('class="math-display"');
        expect(html).toContain('class="math-inline"');
        expect(html).toContain("<mark>marked</mark>");
        expect(html).toContain("<u>underlined</u>");
        expect(html).toContain("\\frac");
        expect(html).not.toContain("Svelte Note Preview Failed");
    }, svelteNotePreviewTimeoutMs);

    it("server-renders Obsidian callouts in mdsvex markdown notes", async () => {
        resetSvelteNotePreviewCacheForTest();

        const html = await renderSvelteNotePreview(
            [
                "> [!important] Symbols",
                "> ▮ = n",
                ">",
                "> [Reference](https://example.test/reference)",
            ].join("\n"),
            createFile("Notes/Callouts.md"),
        );

        expect(html).toContain('class="markdown-callout markdown-callout-important"');
        expect(html).toContain('data-callout="important"');
        expect(html).toContain('<p class="markdown-callout-title">Symbols</p>');
        expect(html).toContain("▮ = n");
        expect(html).toContain('<a href="https://example.test/reference" rel="nofollow">Reference</a>');
        expect(html).not.toContain("[!important]");
        expect(html).not.toContain("Svelte Note Preview Failed");
    }, svelteNotePreviewTimeoutMs);

    it("keeps line-leading markdown marks inside paragraphs", async () => {
        resetSvelteNotePreviewCacheForTest();

        const html = await renderSvelteNotePreview(
            [
                "A moment later, ==trees exploded behind Hakon.== As wooden shrapnel embedded in his back.",
                "",
                "==As the dragon lost momentum, it toppled trees behind him,== and Hakon did not dare risk a glance back.",
            ].join("\n"),
            createFile("Notes/Good passages.md"),
        );

        expect(html).toContain(
            "<p>A moment later, <mark>trees exploded behind Hakon.</mark> As wooden shrapnel embedded in his back.</p>",
        );
        expect(html).toContain(
            "<p><mark>As the dragon lost momentum, it toppled trees behind him,</mark> and Hakon did not dare risk a glance back.</p>",
        );
        expect(html).not.toContain("</mark> and Hakon did not dare risk a glance back.\n");
        expect(html).not.toContain("Svelte Note Preview Failed");
    }, svelteNotePreviewTimeoutMs);

    it("server-renders an mdsvex svx note with Svelte expressions", async () => {
        resetSvelteNotePreviewCacheForTest();

        const html = await renderSvelteNotePreview(
            [
                '<script lang="ts">',
                "let x = $state(1);",
                "</script>",
                "",
                "hello {x}",
            ].join("\n"),
            createFile("Notes/Counter.svx"),
        );

        expect(html).toContain("<p>hello 1</p>");
        expect(html).not.toContain("{x}");
        expect(html).not.toContain("&lt;script");
    }, svelteNotePreviewTimeoutMs);

    it("shows a preview failure panel for unsupported imports", async () => {
        const html = await renderSvelteNotePreview(
            [
                '<script>import Widget from "./Widget.svelte";</script>',
                "<Widget />",
            ].join("\n"),
            createFile("Notes/Imports.svelte"),
        );

        expect(html).toContain("Svelte Note Preview Failed");
        expect(html).toContain("Svelte note imports are not supported yet");
        expect(html).toContain("./Widget.svelte");
    }, svelteNotePreviewTimeoutMs);

    it("shows a preview failure panel for invalid Svelte source", async () => {
        const html = await renderSvelteNotePreview(
            "<script>const broken = ;</script>",
            createFile("Notes/Broken.svelte"),
        );

        expect(html).toContain("Svelte Note Preview Failed");
        expect(html).toContain("Datahoarder could not render this Svelte note");
    }, svelteNotePreviewTimeoutMs);
});

const createFile = (path: string) => {
    return {
        path,
        size: path.length,
        updatedAt: 123,
    };
};
