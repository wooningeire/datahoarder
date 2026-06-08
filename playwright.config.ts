import { defineConfig } from "@playwright/test";

const skipWebServer = process.env.DATAHOARDER_SKIP_PLAYWRIGHT_WEB_SERVER === "1";

export default defineConfig({
    testDir: "e2e",
    webServer: skipWebServer
        ? undefined
        : {
            command: "deno task build && deno task preview",
            port: 4173,
        },
});
