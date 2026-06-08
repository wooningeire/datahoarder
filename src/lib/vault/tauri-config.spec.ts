import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type TauriConfig = {
    app?: {
        withGlobalTauri?: boolean;
    };
};

describe("Tauri config", () => {
    it("exposes the global Tauri API for native file access detection", async () => {
        const config = JSON.parse(
            await readFile(resolve("src-tauri/tauri.conf.json"), "utf8"),
        ) as TauriConfig;

        expect(config.app?.withGlobalTauri).toBe(true);
    });
});
