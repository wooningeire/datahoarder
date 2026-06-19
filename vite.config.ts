import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { sveltekit } from "@sveltejs/kit/vite";
import { normalize, resolve, sep } from "node:path";

const openFolderWatchRoot = getOpenFolderWatchRoot();
const watchIgnored = [
    // Vault changes are reflected by Datahoarder's API reads; Vite should not reload the shell for them.
    "**/vite.config.*.timestamp-*.mjs",
    "**/vite.config.*.timestamp-*",
    ...(openFolderWatchRoot ? [isOpenFolderWatchPath] : []),
];

export default defineConfig({
    optimizeDeps: {
        include: ["typescript"],
    },

    plugins: [sveltekit()],

    server: {
        watch: {
            ignored: watchIgnored,
        },
    },

    test: {
        expect: { requireAssertions: true },

        projects: [
            {
                extends: "./vite.config.ts",

                test: {
                    name: "client",

                    browser: {
                        enabled: true,
                        provider: playwright(),
                        instances: [{ browser: "chromium", headless: true }],
                    },

                    include: ["src/**/*.svelte.{test,spec}.{js,ts}"],
                    exclude: ["src/lib/server/**"],
                },
            },

            {
                extends: "./vite.config.ts",

                test: {
                    name: "server",
                    environment: "node",
                    include: ["src/**/*.{test,spec}.{js,ts}"],
                    exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
                },
            },
        ],
    },
});

function getOpenFolderWatchRoot() {
    const rawRoot =
        process.env.DATAHOARDER_OPEN_FOLDER ??
        process.env.DATAHOARDER_VAULT_ROOT ??
        process.env.DATAHOARDER_WORKSPACE_ROOT ??
        "";
    const trimmedRoot = rawRoot.trim();

    if (!trimmedRoot) {
        return "";
    }

    const resolvedRoot = normalize(resolve(trimmedRoot));
    const projectRoot = normalize(resolve("."));

    if (resolvedRoot === projectRoot || isPathInsideDirectory(projectRoot, resolvedRoot)) {
        return "";
    }

    return resolvedRoot;
}

function isOpenFolderWatchPath(path: string) {
    const resolvedPath = normalize(resolve(path));

    return resolvedPath === openFolderWatchRoot || isPathInsideDirectory(resolvedPath, openFolderWatchRoot);
}

function isPathInsideDirectory(path: string, directory: string) {
    return path.startsWith(`${directory}${sep}`);
}
