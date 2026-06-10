import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { getSvelteKitRoutePath } from "../shared/sveltekit-routes.js";
import {
    defaultTargetDevHost,
    defaultTargetDevPort,
    defaultTargetDevPortSearchLimit,
    defaultTargetDevTask,
    delay,
    getCommandEnv,
    getDenoExecutable,
    getDevUrl,
    getEnv,
    isTargetDevServerDisabled,
    normalizeHost,
    normalizePort,
    normalizeSearchLimit,
    normalizeTaskName,
    normalizeWaitTimeoutMs,
} from "./open-folder-env.js";
import { escapeHtml } from "./open-folder-html.js";
import { getOpenFolderRoot } from "./open-folder-root.js";

type TargetPreviewServer = {
    child: ReturnType<typeof spawn>,
    origin: string,
    projectRoot: string,
    root: string,
};

type TargetPreviewOriginResolver = (root: string) => Promise<string>;

const previewOriginHealthTimeoutMs = 500;
let targetPreviewServer: TargetPreviewServer | null = null;
let targetPreviewServerPromise: Promise<TargetPreviewServer | null> | null = null;
let targetPreviewOriginResolver: TargetPreviewOriginResolver = (root) => startOpenFolderTargetPreviewServer(root);
let targetPreviewCleanupRegistered = false;

export const setOpenFolderTargetPreviewOriginResolverForTest = (
    resolver: TargetPreviewOriginResolver,
) => {
    const previousResolver = targetPreviewOriginResolver;

    targetPreviewOriginResolver = resolver;

    return () => {
        targetPreviewOriginResolver = previousResolver;
    };
};

export const renderPreviewFrame = (routePath: string, href: string) => {
    return `<iframe class="server-vite-preview-frame" src="${escapeHtml(href)}" title="${escapeHtml(routePath)} preview"></iframe>`;
};

export const renderPreviewServerRequired = (routePath: string) => {
    return [
        "<section class=\"server-preview-required\">",
        "<h1>Preview Server Required</h1>",
        `<p>${escapeHtml(routePath)} is a SvelteKit route file, but Datahoarder could not start or find that app's target Deno server.</p>`,
        "</section>",
    ].join("");
};

export const getSvelteKitRoutePreviewHref = async (routePath: string) => {
    const svelteKitRoutePath = getSvelteKitRoutePath(routePath);

    if (svelteKitRoutePath === null) {
        return "";
    }

    const previewOrigin = await getWorkspacePreviewOrigin({
        startIfMissing: true,
        verify: true,
    });

    return previewOrigin ? new URL(svelteKitRoutePath || "/", previewOrigin).href : "";
};

export const getWorkspacePreviewOrigin = async (options: { startIfMissing: boolean, verify: boolean }) => {
    if (targetPreviewServer) {
        if (!options.verify || await isPreviewOriginResponsive(targetPreviewServer.origin)) {
            return targetPreviewServer.origin;
        }

        stopTargetPreviewServer();
    }

    const launchedOrigin = getEnv("DATAHOARDER_TARGET_DEV_ORIGIN") ?? "";

    if (launchedOrigin && (!options.verify || await isPreviewOriginResponsive(launchedOrigin))) {
        return launchedOrigin;
    }

    if (!options.startIfMissing) {
        return "";
    }

    const root = await getOpenFolderRoot();

    if (!root) {
        return "";
    }

    return targetPreviewOriginResolver(root);
};

const startOpenFolderTargetPreviewServer = async (root: string) => {
    if (isTargetDevServerDisabled()) {
        return "";
    }

    if (targetPreviewServer?.root === root) {
        if (await isPreviewOriginResponsive(targetPreviewServer.origin)) {
            return targetPreviewServer.origin;
        }

        stopTargetPreviewServer();
    }

    if (targetPreviewServerPromise) {
        return (await targetPreviewServerPromise)?.origin ?? "";
    }

    targetPreviewServerPromise = startTargetPreviewServer(root);

    try {
        return (await targetPreviewServerPromise)?.origin ?? "";
    } finally {
        targetPreviewServerPromise = null;
    }
};

const startTargetPreviewServer = async (root: string) => {
    stopTargetPreviewServer();

    const projectRoot = await resolveTargetProjectRoot(root);

    if (!projectRoot) {
        return null;
    }

    const host = normalizeHost(getEnv("DATAHOARDER_TARGET_DEV_HOST") ?? defaultTargetDevHost);
    const preferredPort = normalizePort(
        getEnv("DATAHOARDER_TARGET_DEV_PORT") ?? String(defaultTargetDevPort),
        "preferred target dev port",
    );
    const searchLimit = normalizeSearchLimit(
        getEnv("DATAHOARDER_TARGET_DEV_PORT_SEARCH_LIMIT") ?? String(defaultTargetDevPortSearchLimit),
    );
    const task = normalizeTaskName(getEnv("DATAHOARDER_TARGET_DEV_TASK") ?? defaultTargetDevTask);
    const port = await findAvailablePort(host, preferredPort, searchLimit);
    const origin = getDevUrl(host, port);
    const child = spawn(getDenoExecutable(), [
        "task",
        task,
        "--host",
        host,
        "--port",
        String(port),
        "--strictPort",
    ], {
        cwd: projectRoot,
        env: {
            ...getCommandEnv(),
            DATAHOARDER_TARGET_DEV_ORIGIN: origin,
            DATAHOARDER_TARGET_DEV_ROOT: projectRoot,
            HOST: host,
            PORT: String(port),
            VITE_HOST: host,
            VITE_PORT: String(port),
        },
        stdio: "inherit",
    });

    try {
        await waitForHttpResponse(origin, child);
    } catch (error) {
        stopChild(child);
        throw error;
    }

    targetPreviewServer = {
        child,
        origin,
        projectRoot,
        root,
    };
    registerTargetPreviewCleanup();

    return targetPreviewServer;
};

const isPreviewOriginResponsive = async (origin: string) => {
    try {
        await connectPreviewOrigin(origin);
        return true;
    } catch {
        return false;
    }
};

const connectPreviewOrigin = (origin: string) => {
    const url = new URL(origin);
    const host = url.hostname;
    const port = normalizeOriginPort(url);

    return new Promise<void>((resolveConnection, rejectConnection) => {
        const socket = connect({ host, port });
        const timeout = setTimeout(() => {
            socket.destroy();
            rejectConnection(new Error(`Timed out connecting to ${origin}.`));
        }, previewOriginHealthTimeoutMs);

        socket.once("connect", () => {
            clearTimeout(timeout);
            socket.end();
            resolveConnection();
        });
        socket.once("error", (error) => {
            clearTimeout(timeout);
            rejectConnection(error);
        });
    });
};

const normalizeOriginPort = (url: URL) => {
    if (url.port) {
        return normalizePort(url.port, "preview origin port");
    }

    return url.protocol === "https:" ? 443 : 80;
};

const resolveTargetProjectRoot = async (root: string) => {
    const configuredRoot = getEnv("DATAHOARDER_TARGET_DEV_ROOT")?.trim();

    if (configuredRoot) {
        const projectRoot = resolve(configuredRoot);
        const metadata = await stat(projectRoot);

        if (!metadata.isDirectory()) {
            throw new Error(`Target Deno project root is not a directory: ${projectRoot}`);
        }

        if (await hasDenoConfig(projectRoot)) {
            return projectRoot;
        }

        throw new Error(`Target Deno project root must contain deno.json or deno.jsonc: ${projectRoot}`);
    }

    let current = root;

    while (true) {
        if (await hasDenoConfig(current)) {
            return current;
        }

        const parent = dirname(current);

        if (parent === current) {
            return null;
        }

        current = parent;
    }
};

const hasDenoConfig = async (root: string) => {
    for (const name of ["deno.json", "deno.jsonc"]) {
        try {
            const metadata = await stat(resolve(root, name));

            if (metadata.isFile()) {
                return true;
            }
        } catch {
            // Try the alternate Deno config file name.
        }
    }

    return false;
};

const findAvailablePort = async (host: string, preferredPort: number, searchLimit: number) => {
    const maxPort = Math.min(65535, preferredPort + searchLimit);

    for (let port = preferredPort; port <= maxPort; port += 1) {
        if (await canBindPort(host, port)) {
            return port;
        }
    }

    throw new Error(`Could not find an available target dev port from ${preferredPort} through ${maxPort}.`);
};

const canBindPort = (host: string, port: number) => {
    return new Promise<boolean>((resolvePort) => {
        const server = createServer();

        server.once("error", () => resolvePort(false));
        server.listen(port, host, () => {
            server.close(() => resolvePort(true));
        });
    });
};

const waitForHttpResponse = async (
    origin: string,
    child: ReturnType<typeof spawn>,
) => {
    const deadline = Date.now() + normalizeWaitTimeoutMs();
    const childExit: { value: { code: number | null, signal: NodeJS.Signals | null } | null } = {
        value: null,
    };
    let lastError = "";

    child.once("exit", (code, signal) => {
        childExit.value = { code, signal };
    });

    while (Date.now() < deadline) {
        if (childExit.value) {
            throw new Error(
                `Target Deno server exited before responding at ${origin}: code ${childExit.value.code}, signal ${childExit.value.signal}.`,
            );
        }

        try {
            await connectPreviewOrigin(origin);
            return;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }

        await delay(200);
    }

    throw new Error(`Timed out waiting for target Deno server at ${origin}: ${lastError}`);
};

const stopTargetPreviewServer = () => {
    if (!targetPreviewServer) {
        return;
    }

    const server = targetPreviewServer;

    targetPreviewServer = null;

    stopChild(server.child);
};

const stopChild = (child: ReturnType<typeof spawn>) => {
    if (child.exitCode !== null || child.killed) {
        return;
    }

    child.kill();
};

const registerTargetPreviewCleanup = () => {
    if (targetPreviewCleanupRegistered) {
        return;
    }

    targetPreviewCleanupRegistered = true;
    process.once("exit", stopTargetPreviewServer);
    process.once("SIGINT", () => {
        stopTargetPreviewServer();
        process.exit(130);
    });
    process.once("SIGTERM", () => {
        stopTargetPreviewServer();
        process.exit(143);
    });
};
