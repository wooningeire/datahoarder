import { describe, expect, it } from "vitest";
import {
    isEditableTextFile,
    normalizeLocalTextPath,
} from "./local-files.js";
import { isIgnoredLocalDirectoryName } from "./local-directory-helpers.js";

describe("local vault file paths", () => {
    it("accepts extensionless text files without appending a suffix", () => {
        expect(isEditableTextFile("Notes/Capture")).toBe(true);
        expect(normalizeLocalTextPath("Notes/Capture", "")).toBe("Notes/Capture");
    });

    it("keeps default extensions scoped to creation helpers", () => {
        expect(normalizeLocalTextPath("Notes/Capture", ".md")).toBe("Notes/Capture.md");
    });

    it("does not treat hidden dotfiles as editable text files", () => {
        expect(isEditableTextFile(".env")).toBe(false);
        expect(() => normalizeLocalTextPath(".env", "")).toThrow("Only editable text files");
    });

    it("does not manage text files inside ignored metadata folders", () => {
        expect(isIgnoredLocalDirectoryName(".obsidian")).toBe(true);
        expect(() => normalizeLocalTextPath(".obsidian/app.json", "")).toThrow("reserved by the vault index");
    });
});
