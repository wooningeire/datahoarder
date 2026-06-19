import { describe, expect, it } from "vitest";
import { reconcileSelectedDirectoryPaths } from "./note-tree-model.js";

describe("reconcileSelectedDirectoryPaths", () => {
    it("keeps descendant directory columns when a parent file is active", () => {
        const selectedPaths = [
            "Projects",
            "Projects/Notes",
            "Projects/Notes/Drafts",
        ];

        expect(reconcileSelectedDirectoryPaths(selectedPaths, ["Projects"])).toBe(selectedPaths);
    });

    it("keeps open directory columns when a root file is active", () => {
        const selectedPaths = [
            "Projects",
            "Projects/Notes",
        ];

        expect(reconcileSelectedDirectoryPaths(selectedPaths, [])).toBe(selectedPaths);
    });

    it("opens deeper active file branches", () => {
        const activePaths = [
            "Projects",
            "Projects/Notes",
        ];

        expect(reconcileSelectedDirectoryPaths(["Projects"], activePaths)).toBe(activePaths);
    });

    it("replaces the selected branch when the active file diverges", () => {
        const selectedPaths = [
            "Projects",
            "Projects/Notes",
            "Projects/Notes/Drafts",
        ];
        const activePaths = [
            "Projects",
            "Projects/Archive",
        ];

        expect(reconcileSelectedDirectoryPaths(selectedPaths, activePaths)).toBe(activePaths);
    });
});
