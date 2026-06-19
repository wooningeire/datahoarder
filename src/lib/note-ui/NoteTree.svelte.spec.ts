import type { ComponentProps } from "svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import type { NoteTreeNode } from "../note-model/tree.js";
import NoteTree from "./NoteTree.svelte";

type NoteTreeProps = ComponentProps<typeof NoteTree>;

describe("NoteTree", () => {
    it("keeps ancestor file selections from collapsing descendant columns", async () => {
        const rendered = await render(NoteTree, createNoteTreeProps("Projects/Notes/Drafts/Deep.md"));

        await waitForColumnLabels([
            "Vault",
            "Projects",
            "Notes",
            "Drafts",
        ]);

        await rendered.rerender(createNoteTreeProps("Projects/Index.md"));
        await waitForColumnLabels([
            "Vault",
            "Projects",
            "Notes",
            "Drafts",
        ]);

        await rendered.rerender(createNoteTreeProps("Projects/Archive/Old.md"));
        await waitForColumnLabels([
            "Vault",
            "Projects",
            "Archive",
        ]);

        await page.getByRole("button", { name: "Notes" }).click();
        await waitForColumnLabels([
            "Vault",
            "Projects",
            "Notes",
        ]);
    });
});

const waitForColumnLabels = async (labels: string[]): Promise<void> => {
    await vi.waitFor(() => {
        expect(getColumnLabels()).toEqual(labels);
    });
};

const getColumnLabels = (): string[] => (
    [...document.querySelectorAll("section.note-column > h2")].map((heading) => heading.textContent ?? "")
);

const createNoteTreeProps = (activePath: string): NoteTreeProps => ({
    activePath,
    nodes: createNodes(),
    rootLabel: "Vault",
});

const createNodes = (): NoteTreeNode[] => [
    {
        kind: "directory",
        name: "Projects",
        path: "Projects",
        children: [
            {
                kind: "directory",
                name: "Archive",
                path: "Projects/Archive",
                children: [
                    createFile("Old.md", "Projects/Archive/Old.md"),
                ],
            },
            {
                kind: "directory",
                name: "Notes",
                path: "Projects/Notes",
                children: [
                    {
                        kind: "directory",
                        name: "Drafts",
                        path: "Projects/Notes/Drafts",
                        children: [
                            createFile("Deep.md", "Projects/Notes/Drafts/Deep.md"),
                        ],
                    },
                ],
            },
            createFile("Index.md", "Projects/Index.md"),
        ],
    },
];

const createFile = (name: string, path: string): NoteTreeNode => ({
    kind: "file",
    name,
    path,
    href: `/${path}`,
});
