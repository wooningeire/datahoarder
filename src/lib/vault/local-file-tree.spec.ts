import { describe, expect, it } from "vitest";
import type { LocalVaultFile } from "./local-files.js";
import { buildLocalVaultTree } from "./local-file-tree.js";

describe("buildLocalVaultTree", () => {
    it("includes empty directory snapshots", () => {
        const tree = buildLocalVaultTree(
            [
                createLocalVaultFile("Projects/Seed.md"),
            ],
            [
                { path: "Archive" },
                { path: "Archive/Empty" },
                { path: "Projects" },
            ],
        );

        expect(tree).toEqual([
            {
                kind: "directory",
                name: "Archive",
                path: "Archive",
                children: [
                    {
                        kind: "directory",
                        name: "Empty",
                        path: "Archive/Empty",
                        children: [],
                    },
                ],
            },
            {
                kind: "directory",
                name: "Projects",
                path: "Projects",
                children: [
                    {
                        kind: "file",
                        name: "Seed.md",
                        path: "Projects/Seed.md",
                        href: "Projects/Seed",
                    },
                ],
            },
        ]);
    });
});

const createLocalVaultFile = (path: string): LocalVaultFile => {
    return {
        extension: ".md",
        handle: {
            kind: "file",
            name: path.split("/").at(-1) ?? path,
            getFile: async () => new File(["# Seed"], path),
        },
        path,
        routePath: path.replace(/\.md$/u, ""),
        size: 6,
        updatedAt: 0,
    };
};
