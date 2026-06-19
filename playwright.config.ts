import { defineConfig } from "@playwright/test";

const skipWebServer = process.env.DATAHOARDER_SKIP_PLAYWRIGHT_WEB_SERVER === "1";
const appOrigin = "http://127.0.0.1:4173";

export default defineConfig({
    testDir: "e2e",
    use: {
        baseURL: appOrigin,
    },
    webServer: skipWebServer
        ? undefined
        : {
            command: "deno task build:app && deno task preview",
            url: appOrigin,
        },
});
