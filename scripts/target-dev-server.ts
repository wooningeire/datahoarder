import { dirname, resolve } from "node:path";

export const DEFAULT_TARGET_DEV_HOST = "127.0.0.1";
export const DEFAULT_TARGET_DEV_PORT = 5174;
export const DEFAULT_TARGET_DEV_PORT_SEARCH_LIMIT = 25;
export const DEFAULT_TARGET_DEV_TASK = "dev";
export const DEFAULT_TARGET_DEV_WAIT_TIMEOUT_MS = 60_000;

type Env = Record<string, string | undefined>;

export type TargetDevServerOptions = {
    disabled?: boolean;
    env?: Env;
    host?: number | string;
    projectRoot?: string;
    preferredPort?: number | string;
    root?: string;
    searchLimit?: number | string;
    task?: string;
    waitTimeoutMs?: number;
};

export type StartedTargetDevServer = {
    child: Deno.ChildProcess;
    env: Record<string, string>;
    origin: string;
    port: number;
    projectRoot: string;
    root: string;
    status: Promise<Deno.CommandStatus>;
    stop: () => Promise<void>;
};

export class TargetDevServerError extends Error {
    details: Record<string, unknown>;

    constructor(message: string, details: Record<string, unknown> = {}) {
        super(message);
        this.name = "TargetDevServerError";
        this.details = details;
    }
}

export async function startTargetDevServerForOpenFolder(
    options: TargetDevServerOptions = {},
): Promise<StartedTargetDevServer | null> {
    const env = options.env ?? Deno.env.toObject();

    if (isTargetDevServerDisabled(options.disabled, env)) {
        return null;
    }

    const rawOpenFolderRoot = options.root ?? getOpenFolderRootFromEnv(env);

    if (!rawOpenFolderRoot?.trim()) {
        return null;
    }

    const root = resolve(rawOpenFolderRoot);
    const host = normalizeHost(
        options.host ?? env.DATAHOARDER_TARGET_DEV_HOST ?? DEFAULT_TARGET_DEV_HOST,
    );
    const preferredPort = normalizePort(
        options.preferredPort ?? env.DATAHOARDER_TARGET_DEV_PORT ?? DEFAULT_TARGET_DEV_PORT,
        "preferred target dev port",
    );
    const searchLimit = normalizeSearchLimit(
        options.searchLimit ??
            env.DATAHOARDER_TARGET_DEV_PORT_SEARCH_LIMIT ??
            DEFAULT_TARGET_DEV_PORT_SEARCH_LIMIT,
    );
    const task = normalizeTaskName(
        options.task ?? env.DATAHOARDER_TARGET_DEV_TASK ?? DEFAULT_TARGET_DEV_TASK,
    );

    await assertDirectory(root, "Target folder");

    const projectRoot = await resolveTargetProjectRoot(
        root,
        options.projectRoot ?? env.DATAHOARDER_TARGET_DEV_ROOT ?? "",
    );

    if (!projectRoot) {
        return null;
    }

    const port = findAvailablePort(host, preferredPort, searchLimit);
    const origin = getDevUrl(host, port);
    const commandEnv = toCommandEnv(env);
    const child = new Deno.Command(Deno.execPath(), {
        args: [
            "task",
            task,
            "--host",
            host,
            "--port",
            String(port),
            "--strictPort",
        ],
        cwd: projectRoot,
        env: {
            ...commandEnv,
            DATAHOARDER_TARGET_DEV_ORIGIN: origin,
            DATAHOARDER_TARGET_DEV_ROOT: projectRoot,
            HOST: host,
            PORT: String(port),
            VITE_HOST: host,
            VITE_PORT: String(port),
        },
        stderr: "inherit",
        stdin: "inherit",
        stdout: "inherit",
    }).spawn();
    const status = child.status;

    try {
        await waitForHttpResponse(
            origin,
            status,
            options.waitTimeoutMs ?? DEFAULT_TARGET_DEV_WAIT_TIMEOUT_MS,
        );
    } catch (error) {
        await stopChild(child, status);
        throw error;
    }

    return {
        child,
        env: {
            ...commandEnv,
            DATAHOARDER_OPEN_FOLDER: root,
            DATAHOARDER_TARGET_DEV_ORIGIN: origin,
        },
        origin,
        port,
        projectRoot,
        root,
        status,
        stop: () => stopChild(child, status),
    };
}

export function getDevUrl(host: string, port: number) {
    const normalizedHost = host.includes(":") && !host.startsWith("[")
        ? `[${host}]`
        : host;

    return `http://${normalizedHost}:${port}`;
}

function getOpenFolderRootFromEnv(env: Env) {
    return env.DATAHOARDER_OPEN_FOLDER ??
        env.DATAHOARDER_VAULT_ROOT ??
        env.DATAHOARDER_WORKSPACE_ROOT ??
        "";
}

function isTargetDevServerDisabled(disabled: boolean | undefined, env: Env) {
    const envValue = (env.DATAHOARDER_TARGET_DEV_DISABLED ?? "").trim().toLowerCase();

    return disabled === true || envValue === "1" || envValue === "true";
}

async function assertDirectory(path: string, label: string) {
    try {
        const stats = await Deno.stat(path);

        if (stats.isDirectory) {
            return;
        }
    } catch {
        // The explicit error below is clearer than leaking platform-specific stat text.
    }

    throw new TargetDevServerError(`${label} does not exist: ${path}`, { path });
}

async function hasDenoConfig(root: string) {
    for (const name of ["deno.json", "deno.jsonc"]) {
        try {
            const stats = await Deno.stat(resolve(root, name));

            if (stats.isFile) {
                return true;
            }
        } catch {
            // Try the alternate Deno config file name.
        }
    }

    return false;
}

async function resolveTargetProjectRoot(openFolderRoot: string, configuredRoot: string) {
    if (configuredRoot.trim()) {
        const projectRoot = resolve(configuredRoot);

        await assertDirectory(projectRoot, "Target Deno project root");

        if (await hasDenoConfig(projectRoot)) {
            return projectRoot;
        }

        throw new TargetDevServerError(
            `Target Deno project root must contain deno.json or deno.jsonc: ${projectRoot}`,
            { projectRoot },
        );
    }

    return findNearestDenoProjectRoot(openFolderRoot);
}

async function findNearestDenoProjectRoot(root: string) {
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
}

function findAvailablePort(host: string, preferredPort: number, searchLimit: number) {
    const maxPort = Math.min(65535, preferredPort + searchLimit);

    for (let port = preferredPort; port <= maxPort; port += 1) {
        if (canBindPort(host, port)) {
            return port;
        }
    }

    throw new TargetDevServerError(
        `Could not find an available target dev port from ${preferredPort} through ${maxPort}.`,
        { host, maxPort, preferredPort },
    );
}

function canBindPort(host: string, port: number) {
    try {
        const listener = Deno.listen({ hostname: host, port, transport: "tcp" });

        listener.close();
        return true;
    } catch {
        return false;
    }
}

async function waitForHttpResponse(
    origin: string,
    status: Promise<Deno.CommandStatus>,
    timeoutMs: number,
) {
    const deadline = Date.now() + timeoutMs;
    const exitState: { status: Deno.CommandStatus | null } = { status: null };
    let lastError = "";

    void status.then((nextStatus) => {
        exitState.status = nextStatus;
    });

    while (Date.now() < deadline) {
        if (exitState.status) {
            throw new TargetDevServerError(
                `Target Deno server exited before responding at ${origin}.`,
                {
                    code: exitState.status.code,
                    origin,
                    success: exitState.status.success,
                },
            );
        }

        try {
            const response = await fetch(origin);

            await response.body?.cancel();
            return;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }

        await delay(200);
    }

    throw new TargetDevServerError(
        `Timed out waiting for target Deno server at ${origin}: ${lastError}`,
        { origin, timeoutMs },
    );
}

async function stopChild(
    child: Deno.ChildProcess,
    status: Promise<Deno.CommandStatus>,
) {
    const exited = await Promise.race([
        status.then(() => true),
        delay(0).then(() => false),
    ]);

    if (exited) {
        return;
    }

    try {
        child.kill("SIGTERM");
    } catch {
        return;
    }

    const stopped = await Promise.race([
        status.then(() => true),
        delay(2_000).then(() => false),
    ]);

    if (stopped) {
        return;
    }

    try {
        child.kill("SIGKILL");
    } catch {
        // The child may already have exited between the timeout and kill call.
    }
}

function toCommandEnv(env: Env) {
    const commandEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) {
            commandEnv[key] = value;
        }
    }

    return commandEnv;
}

function delay(ms: number) {
    return new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms));
}

function normalizeHost(value: number | string) {
    const host = String(value ?? "").trim();

    if (!host) {
        throw new TargetDevServerError("A target dev host is required.");
    }

    if (!/^[\w.:-]+$/u.test(host)) {
        throw new TargetDevServerError(`Invalid target dev host: ${host}`);
    }

    return host;
}

function normalizePort(value: number | string, label: string) {
    const port = Number(value);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new TargetDevServerError(`Invalid ${label}: ${value}`);
    }

    return port;
}

function normalizeSearchLimit(value: number | string) {
    const limit = Number(value);

    if (!Number.isInteger(limit) || limit < 0 || limit > 200) {
        throw new TargetDevServerError(`Invalid target dev port search limit: ${value}`);
    }

    return limit;
}

function normalizeTaskName(value: string) {
    const task = value.trim();

    if (!task || /[\s"'`]/u.test(task)) {
        throw new TargetDevServerError(`Invalid target Deno task name: ${value}`);
    }

    return task;
}
