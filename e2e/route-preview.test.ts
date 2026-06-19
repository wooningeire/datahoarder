import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { expectSelectedFilePath } from "./local-vault-ui.js";

type StartedProcess = {
    child: ChildProcessWithoutNullStreams;
    logs: string[];
    name: string;
};

test.setTimeout(60_000);

test("SvelteKit route files preview through the launched target Deno server", async ({ page }) => {
    const workspaceRoot = await createRouteWorkspace();
    const targetPort = await getAvailablePort();
    const appPort = await getAvailablePort();
    const targetOrigin = `http://127.0.0.1:${targetPort}`;
    const appOrigin = `http://127.0.0.1:${appPort}`;
    const processes: StartedProcess[] = [];

    try {
        processes.push(startDatahoarderFolderDev(appPort, workspaceRoot, targetPort));
        await waitForHttp(`${appOrigin}/api/vault`, workspaceRoot.replace(/\\/gu, "\\\\"), processes);

        await page.goto(appOrigin);
        const noteColumns = page.locator(".note-columns");

        await expect(noteColumns.getByRole("button", { name: "src" })).toBeVisible();
        await noteColumns.getByRole("button", { name: "src" }).click();
        await noteColumns.getByRole("button", { name: "routes" }).click();
        await noteColumns.getByRole("button", { name: "+page.svelte" }).first().click();

        await expect(page.getByText("Source Only")).toHaveCount(0);
        await expectSelectedFilePath(page, "src/routes/+page.svelte");
        await expectServerPreviewHeading(page, "Root route from Deno preview target");

        await noteColumns.getByRole("region", { name: "routes" })
            .getByRole("button", { name: "notes", exact: true })
            .click();
        await noteColumns.getByRole("button", { name: "+page.svelte" }).last().click();

        await expect(page.getByText("Source Only")).toHaveCount(0);
        await expectSelectedFilePath(page, "src/routes/notes/+page.svelte");
        await expect(page.getByLabel("Preview").locator(".server-preview-frame")).toHaveAttribute(
            "src",
            /\/preview\/src\/routes\/notes\/%2Bpage\.svelte\?v=/u,
        );
        await expectServerPreviewHeading(page, "Nested notes route from Deno preview target");
    } finally {
        await Promise.all(processes.reverse().map(stopProcess));
        await rm(workspaceRoot, { force: true, recursive: true });
    }
});

test("opened subfolders preview through their ancestor target Deno server", async ({ page }) => {
    const workspaceRoot = await createRouteWorkspace();
    const openFolderRoot = resolve(workspaceRoot, "src", "routes");
    const targetPort = await getAvailablePort();
    const appPort = await getAvailablePort();
    const targetOrigin = `http://127.0.0.1:${targetPort}`;
    const appOrigin = `http://127.0.0.1:${appPort}`;
    const processes: StartedProcess[] = [];

    try {
        processes.push(startDatahoarderFolderDev(appPort, openFolderRoot, targetPort));
        await waitForHttp(`${appOrigin}/api/vault`, openFolderRoot.replace(/\\/gu, "\\\\"), processes);

        await page.goto(appOrigin);
        const noteColumns = page.locator(".note-columns");

        const rootPageButton = noteColumns.getByRole("button", { name: "+page.svelte" }).first();

        await expect(rootPageButton).toBeVisible();
        await rootPageButton.click();

        await expectSelectedFilePath(page, "+page.svelte");
        await expectServerPreviewHeading(page, "Root route from Deno preview target");
    } finally {
        await Promise.all(processes.reverse().map(stopProcess));
        await rm(workspaceRoot, { force: true, recursive: true });
    }
});

test("server-backed route files lazily launch a target Deno server when origin is missing", async ({ page }) => {
    const workspaceRoot = await createRouteWorkspace();
    const targetPort = await getAvailablePort();
    const appPort = await getAvailablePort();
    const targetOrigin = `http://127.0.0.1:${targetPort}`;
    const appOrigin = `http://127.0.0.1:${appPort}`;
    const processes: StartedProcess[] = [];

    try {
        processes.push(startDatahoarderDev(appPort, workspaceRoot, {
            DATAHOARDER_TARGET_DEV_PORT: String(targetPort),
            DATAHOARDER_TARGET_DEV_PORT_SEARCH_LIMIT: "0",
        }));
        await waitForHttp(`${appOrigin}/api/vault`, workspaceRoot.replace(/\\/gu, "\\\\"), processes);

        await page.goto(appOrigin);
        const noteColumns = page.locator(".note-columns");

        await expect(noteColumns.getByRole("button", { name: "src" })).toBeVisible();
        await noteColumns.getByRole("button", { name: "src" }).click();
        await noteColumns.getByRole("button", { name: "routes" }).click();
        await noteColumns.getByRole("button", { name: "+page.svelte" }).first().click();

        await expectSelectedFilePath(page, "src/routes/+page.svelte");
        await waitForHttp(`${targetOrigin}/`, "Root route from Deno preview target", processes);
        await expectServerPreviewHeading(page, "Root route from Deno preview target");
    } finally {
        await Promise.all(processes.reverse().map(stopProcess));
        await rm(workspaceRoot, { force: true, recursive: true });
    }
});

test("creating server-backed folders does not trigger a Vite page reload", async ({ page }) => {
    const workspaceRoot = await createReloadWorkspace();
    const appPort = await getAvailablePort();
    const appOrigin = `http://127.0.0.1:${appPort}`;
    const processes: StartedProcess[] = [];
    let mainFrameNavigations = 0;
    const mainFrameUrls: string[] = [];
    const vaultSnapshotReads: string[] = [];

    page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) {
            mainFrameNavigations += 1;
            mainFrameUrls.push(frame.url());
        }
    });
    page.on("request", (request) => {
        const path = new URL(request.url()).pathname;

        if (path === "/api/vault/files" || path === "/api/vault/directories") {
            vaultSnapshotReads.push(path);
        }
    });

    try {
        processes.push(startDatahoarderDev(appPort, workspaceRoot, {
            DATAHOARDER_TARGET_DEV_DISABLED: "true",
        }));
        await waitForHttp(`${appOrigin}/api/vault`, workspaceRoot.replace(/\\/gu, "\\\\"), processes);

        await page.goto(appOrigin);
        await expect(page.locator(".note-columns").getByRole("button", { name: "Seed.md" })).toBeVisible();
        await waitForStableMainFrameNavigations(() => mainFrameNavigations);

        const initialNavigations = mainFrameNavigations;
        const initialVaultSnapshotReads = vaultSnapshotReads.length;
        const sentinel = await page.evaluate(() => {
            const value = `folder-create-${Date.now()}`;

            (window as Window & { __datahoarderReloadSentinel?: string }).__datahoarderReloadSentinel = value;

            return value;
        });
        const rootColumn = page
            .locator(".note-column")
            .filter({ has: page.getByRole("heading", { name: "Files", exact: true }) });

        await rootColumn.getByRole("button", { name: "New", exact: true }).click();
        await page.getByRole("menu", { name: "New options" }).getByRole("menuitem", { name: "New Folder" }).click();
        await page.getByRole("textbox", { name: "New folder name" }).fill("Projects");
        await page.getByRole("textbox", { name: "New folder name" }).press("Enter");

        await expect(page.getByText("Created folder Projects")).toBeVisible();
        await expect(page.locator(".note-columns").getByRole("button", { name: "Projects" })).toBeVisible();
        await page.waitForTimeout(750);

        expect(mainFrameNavigations, `${mainFrameUrls.join("\n")}\n${formatProcessLogs(processes)}`).toBe(
            initialNavigations,
        );
        expect(vaultSnapshotReads.slice(initialVaultSnapshotReads)).toEqual([]);
        await expect(page.evaluate(() =>
            (window as Window & { __datahoarderReloadSentinel?: string }).__datahoarderReloadSentinel ?? "",
        )).resolves.toBe(sentinel);
    } finally {
        await Promise.all(processes.reverse().map(stopProcess));
        await rm(workspaceRoot, { force: true, recursive: true });
    }
});

test("ordinary Svelte notes render through Datahoarder without a target server", async ({ page }) => {
    const workspaceRoot = await createRouteWorkspace();
    const appPort = await getAvailablePort();
    const appOrigin = `http://127.0.0.1:${appPort}`;
    const processes: StartedProcess[] = [];

    try {
        processes.push(startDatahoarderDev(appPort, workspaceRoot));
        await waitForHttp(`${appOrigin}/api/vault`, workspaceRoot.replace(/\\/gu, "\\\\"), processes);

        await page.goto(appOrigin);
        const noteColumns = page.locator(".note-columns");

        await expect(noteColumns.getByRole("button", { name: "Notes" })).toBeVisible();
        await noteColumns.getByRole("button", { name: "Notes" }).click();
        await noteColumns.getByRole("button", { name: "Dashboard.svelte" }).click();

        const previewDocument = page.frameLocator(".server-preview-frame");

        await expectSelectedFilePath(page, "Notes/Dashboard.svelte");
        await expect(previewDocument.getByRole("heading", { name: "Local Svelte Dashboard" })).toBeVisible();
        await expect(previewDocument.locator(".server-vite-preview-frame")).toHaveCount(0);
        await expect(page.getByText("Preview Server Required")).toHaveCount(0);
    } finally {
        await Promise.all(processes.reverse().map(stopProcess));
        await rm(workspaceRoot, { force: true, recursive: true });
    }
});

test("ordinary mdsvex notes render through Datahoarder without a target server", async ({ page }) => {
    const workspaceRoot = await createRouteWorkspace();
    const appPort = await getAvailablePort();
    const appOrigin = `http://127.0.0.1:${appPort}`;
    const processes: StartedProcess[] = [];

    try {
        processes.push(startDatahoarderDev(appPort, workspaceRoot, {
            DATAHOARDER_TARGET_DEV_DISABLED: "true",
        }));
        await waitForHttp(`${appOrigin}/api/vault`, workspaceRoot.replace(/\\/gu, "\\\\"), processes);

        await page.goto(appOrigin);
        const noteColumns = page.locator(".note-columns");

        await expect(noteColumns.getByRole("button", { name: "Notes" })).toBeVisible();
        await noteColumns.getByRole("button", { name: "Notes" }).click();
        await noteColumns.getByRole("button", { name: "Counter.svx" }).click();

        const previewDocument = page.frameLocator(".server-preview-frame");

        await expectSelectedFilePath(page, "Notes/Counter.svx");
        await expect(page.getByText("Source Only")).toHaveCount(0);
        await expect(previewDocument.getByText("hello 1")).toBeVisible();
        await expect(previewDocument.getByText("hello {x}")).toHaveCount(0);
        await expect(previewDocument.getByText("<script")).toHaveCount(0);
        await expect(page.getByText("Preview Server Required")).toHaveCount(0);
    } finally {
        await Promise.all(processes.reverse().map(stopProcess));
        await rm(workspaceRoot, { force: true, recursive: true });
    }
});

test("ordinary markdown notes render through Datahoarder instead of source-only", async ({ page }) => {
    const workspaceRoot = await createRouteWorkspace();
    const appPort = await getAvailablePort();
    const appOrigin = `http://127.0.0.1:${appPort}`;
    const processes: StartedProcess[] = [];

    try {
        processes.push(startDatahoarderDev(appPort, workspaceRoot, {
            DATAHOARDER_TARGET_DEV_DISABLED: "true",
        }));
        await waitForHttp(`${appOrigin}/api/vault`, workspaceRoot.replace(/\\/gu, "\\\\"), processes);

        await page.goto(appOrigin);
        const noteColumns = page.locator(".note-columns");

        await expect(noteColumns.getByRole("button", { name: "Notes" })).toBeVisible();
        await noteColumns.getByRole("button", { name: "Notes" }).click();
        await noteColumns.getByRole("button", { name: "Index.md" }).click();

        const previewDocument = page.frameLocator(".server-preview-frame");

        await expectSelectedFilePath(page, "Notes/Index.md");
        await expect(page.getByText("Source Only")).toHaveCount(0);
        await expect(previewDocument.getByRole("heading", { name: "Markdown note preview" })).toBeVisible();
        await expect(previewDocument.getByText("markdown value 2")).toBeVisible();
        await expect(previewDocument.locator(".math-inline")).toContainText("E = mc^2");
        await expect(previewDocument.locator(".math-display")).toContainText("\\frac");
        await expect(previewDocument.locator("mark")).toHaveText("marked");
        await expect(previewDocument.locator("u")).toHaveText("underlined");
        await expect(previewDocument.getByText("markdown value {x}")).toHaveCount(0);
        await expect(previewDocument.getByText("Svelte Note Preview Failed")).toHaveCount(0);
        await expect(previewDocument.getByText("<script")).toHaveCount(0);
        await expect(page.getByText("Preview Server Required")).toHaveCount(0);
    } finally {
        await Promise.all(processes.reverse().map(stopProcess));
        await rm(workspaceRoot, { force: true, recursive: true });
    }
});

async function createRouteWorkspace() {
    await mkdir("test-results", { recursive: true });

    const workspaceRoot = await mkdtemp(resolve("test-results", "route-preview-"));
    const routesRoot = resolve(workspaceRoot, "src", "routes");
    const notesRoute = resolve(routesRoot, "notes");
    const notesRoot = resolve(workspaceRoot, "Notes");
    const previewTargetServer = resolve("e2e", "preview-target-server.ts").replace(/\\/gu, "/");

    await mkdir(notesRoute, { recursive: true });
    await mkdir(notesRoot, { recursive: true });
    await writeFile(
        resolve(workspaceRoot, "deno.json"),
        JSON.stringify({
            tasks: {
                dev: `deno run --allow-net=127.0.0.1 ${previewTargetServer}`,
            },
        }, null, 4),
        "utf8",
    );
    await writeFile(resolve(routesRoot, "+page.svelte"), "<h1>Local root source</h1>", "utf8");
    await writeFile(resolve(notesRoute, "+page.svelte"), "<h1>Local notes source</h1>", "utf8");
    await writeFile(
        resolve(workspaceRoot, "Notes", "Dashboard.svelte"),
        [
            '<script>const title = "Local Svelte Dashboard";</script>',
            '<style>h1 { color: oklch(0.42 0.18 245); }</style>',
            "<h1>{title}</h1>",
        ].join("\n"),
        "utf8",
    );
    await writeFile(
        resolve(workspaceRoot, "Notes", "Index.md"),
        [
            '<script lang="ts">',
            "let x = $state(2);",
            "</script>",
            "",
            "# Markdown note preview",
            "",
            "markdown value {x}",
            "",
            "Inline $E = mc^2$ and ==marked== and _underlined_.",
            "",
            "$$",
            "f(x) = e^{-\\frac12\\left(\\frac{x - \\bar x}\\sigma\\right)^2}",
            "$$",
        ].join("\n"),
        "utf8",
    );
    await writeFile(
        resolve(workspaceRoot, "Notes", "Counter.svx"),
        [
            '<script lang="ts">',
            "let x = $state(1);",
            "</script>",
            "",
            "hello {x}",
        ].join("\n"),
        "utf8",
    );

    return workspaceRoot;
}

async function createReloadWorkspace() {
    await mkdir("e2e-vaults", { recursive: true });
    const workspaceRoot = await mkdtemp(resolve("e2e-vaults", "folder-reload-"));

    await writeFile(resolve(workspaceRoot, "Seed.md"), "# Seed\n\nKeep the shell alive.", "utf8");
    return workspaceRoot;
}

function startDatahoarderFolderDev(
    port: number,
    workspaceRoot: string,
    targetPort: number,
) {
    return startProcess("datahoarder folder dev", [
        "run",
        "-A",
        "scripts/open-folder-dev.ts",
        workspaceRoot,
        "--target-port",
        String(targetPort),
        "--target-port-search-limit",
        "0",
        "--preview-route-base",
        "/notes",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
    ]);
}

function startDatahoarderDev(
    port: number,
    workspaceRoot: string,
    env: Record<string, string> = {},
) {
    return startProcess("datahoarder dev", [
        "run",
        "-A",
        "npm:vite",
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
    ], {
        DATAHOARDER_OPEN_FOLDER: workspaceRoot,
        ...env,
    });
}

function startProcess(
    name: string,
    args: string[],
    env: Record<string, string> = {},
): StartedProcess {
    const child = spawn("deno", args, {
        cwd: process.cwd(),
        env: {
            ...process.env,
            ...env,
        },
    });
    const logs: string[] = [];
    const record = (chunk: Buffer) => logs.push(chunk.toString());

    child.stdout.on("data", record);
    child.stderr.on("data", record);

    return { child, logs, name };
}

async function expectServerPreviewHeading(page: Page, heading: string) {
    const previewDocument = page.frameLocator(".server-preview-frame");
    const targetFrame = getPreviewTargetFrame(previewDocument);

    await expect(page.getByLabel("Preview").locator(".server-preview-frame")).toBeVisible();
    await expect(previewDocument.locator(".server-vite-preview-frame")).toBeVisible();
    await expect(targetFrame.getByRole("heading", { name: heading })).toBeVisible();
}

function getPreviewTargetFrame(previewDocument: FrameLocator) {
    return previewDocument.frameLocator(".server-vite-preview-frame");
}

async function waitForHttp(url: string, expectedText: string, processes: StartedProcess[]) {
    const deadline = Date.now() + 20_000;
    let lastError = "";

    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            const text = await response.text();

            if (response.ok && text.includes(expectedText)) {
                return;
            }

            lastError = `${response.status} ${response.statusText}: ${text.slice(0, 400)}`;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }

        await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    }

    throw new Error(`Timed out waiting for ${url}: ${lastError}\n${formatProcessLogs(processes)}`);
}

async function waitForStableMainFrameNavigations(readNavigationCount: () => number) {
    const deadline = Date.now() + 10_000;
    let previousCount = readNavigationCount();
    let stableSince = Date.now();

    while (Date.now() < deadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));

        const nextCount = readNavigationCount();

        if (nextCount !== previousCount) {
            previousCount = nextCount;
            stableSince = Date.now();
            continue;
        }

        if (Date.now() - stableSince >= 800) {
            return;
        }
    }

    throw new Error("Timed out waiting for main frame navigations to settle.");
}

function getAvailablePort() {
    return new Promise<number>((resolvePort, reject) => {
        const server = createServer();

        server.listen(0, "127.0.0.1", () => {
            const address = server.address();

            if (!address || typeof address === "string") {
                server.close();
                reject(new Error("Could not reserve a TCP port."));
                return;
            }

            server.close(() => resolvePort(address.port));
        });
        server.on("error", reject);
    });
}

async function stopProcess(processInfo: StartedProcess) {
    const child = processInfo.child;

    if (child.exitCode !== null) {
        return;
    }

    const exited = new Promise<void>((resolveExit) => {
        child.once("exit", () => resolveExit());
    });

    child.kill();

    await Promise.race([
        exited,
        new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
    ]);

    if (child.exitCode === null) {
        child.kill("SIGKILL");
    }
}

function formatProcessLogs(processes: StartedProcess[]) {
    return processes
        .map((processInfo) => [
            `--- ${processInfo.name} logs ---`,
            processInfo.logs.join("").slice(-2_000),
        ].join("\n"))
        .join("\n");
}
