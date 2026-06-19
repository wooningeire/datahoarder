import {
    formatFixedPortOccupiedMessage,
    formatNoAvailablePortMessage,
    formatPortOwners,
    inspectDevServerPort,
} from "./tauri-dev-server-probe.ts";
import { spawnAndWait, spawnChild, stopChild } from "./tauri-dev-server-process.ts";
import {
    DEFAULT_TAURI_DEV_HOST,
    DEFAULT_TAURI_DEV_PORT,
    DEFAULT_TAURI_DEV_PORT_SEARCH_LIMIT,
    DEFAULT_TAURI_DEV_WAIT_TIMEOUT_MS,
    getDevUrl,
    getExpectedVaultMetadataFromEnv,
    hasHelpFlag,
    normalizeHost,
    normalizePort,
    normalizeSearchLimit,
    TauriDevServerError,
    type BeforeDevOptions,
    type DevServerOptions,
    type Env,
    type ExpectedVaultMetadata,
    type SpawnOptions,
    type TauriDevResolution,
} from "./tauri-dev-server-types.ts";

export {
    formatPortOwners,
    inspectDevServerPort,
} from "./tauri-dev-server-probe.ts";

export {
    DEFAULT_TAURI_DEV_HOST,
    DEFAULT_TAURI_DEV_PORT,
    DEFAULT_TAURI_DEV_PORT_SEARCH_LIMIT,
    DEFAULT_TAURI_DEV_WAIT_TIMEOUT_MS,
    getDevUrl,
    TauriDevServerError,
    type BeforeDevOptions,
    type DevServerOptions,
    type Env,
    type ExpectedVaultMetadata,
    type PortInspection,
    type PortOwner,
    type ProbeResult,
    type SkippedPort,
    type SpawnOptions,
    type TauriDevResolution,
} from "./tauri-dev-server-types.ts";

export const getDevServerOptionsFromEnv = (
    env: Env = Deno.env.toObject(),
): DevServerOptions => {
    return {
        expectedVaultMetadata: getExpectedVaultMetadataFromEnv(env),
        host: env.DATAHOARDER_TAURI_DEV_HOST || DEFAULT_TAURI_DEV_HOST,
        preferredPort: env.DATAHOARDER_TAURI_DEV_PORT || DEFAULT_TAURI_DEV_PORT,
        searchLimit: env.DATAHOARDER_TAURI_DEV_PORT_SEARCH_LIMIT ||
            DEFAULT_TAURI_DEV_PORT_SEARCH_LIMIT,
    };
};

export const parseBeforeDevArgs = (
    args: string[],
    env: Env = Deno.env.toObject(),
): BeforeDevOptions => {
    const options: {
        expectedVaultMetadata: ExpectedVaultMetadata,
        extraViteArgs: string[],
        host: number | string,
        port: number | string,
    } = {
        expectedVaultMetadata: getExpectedVaultMetadataFromEnv(env),
        extraViteArgs: [],
        host: env.DATAHOARDER_TAURI_DEV_HOST || DEFAULT_TAURI_DEV_HOST,
        port: env.DATAHOARDER_TAURI_DEV_PORT || DEFAULT_TAURI_DEV_PORT,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--") {
            options.extraViteArgs.push(...args.slice(index + 1));
            break;
        }

        if (arg === "--host") {
            options.host = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg === "--port") {
            options.port = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        options.extraViteArgs.push(arg);
    }

    return {
        expectedVaultMetadata: options.expectedVaultMetadata,
        extraViteArgs: options.extraViteArgs,
        host: normalizeHost(options.host),
        port: normalizePort(options.port, "port"),
    };
};

export const runTauriCommand = async (
    args: string[],
    options: SpawnOptions = {},
) => {
    if (args[0] !== "dev" || hasHelpFlag(args.slice(1))) {
        return spawnAndWait(Deno.execPath(), [
            "run",
            "-A",
            "npm:@tauri-apps/cli",
            ...args,
        ], options);
    }

    const env = options.env ?? Deno.env.toObject();
    const devServerOptions = getDevServerOptionsFromEnv(env);
    const resolution = await resolveTauriDevServer(devServerOptions);

    logTauriDevResolution(resolution);

    let managedDevServer: Deno.ChildProcess | null = null;

    if (!resolution.reuseExisting) {
        managedDevServer = await startManagedViteDevServer(resolution, {
            ...options,
            env,
            expectedVaultMetadata: devServerOptions.expectedVaultMetadata ??
                getExpectedVaultMetadataFromEnv(env),
        });
    }

    const override = createTauriDevConfigOverride(resolution);
    const devArgs = [
        "dev",
        "--config",
        JSON.stringify(override),
        ...args.slice(1),
    ];

    try {
        return await spawnAndWait(Deno.execPath(), [
            "run",
            "-A",
            "npm:@tauri-apps/cli",
            ...devArgs,
        ], {
            ...options,
            env,
        });
    } finally {
        if (managedDevServer) {
            await stopChild(managedDevServer);
        }
    }
};

export const resolveTauriDevServer = async (
    options: DevServerOptions = {},
): Promise<TauriDevResolution> => {
    const host = normalizeHost(options.host ?? DEFAULT_TAURI_DEV_HOST);
    const preferredPort = normalizePort(
        options.preferredPort ?? DEFAULT_TAURI_DEV_PORT,
        "preferred port",
    );
    const searchLimit = normalizeSearchLimit(
        options.searchLimit ?? DEFAULT_TAURI_DEV_PORT_SEARCH_LIMIT,
    );
    const expectedVaultMetadata = options.expectedVaultMetadata ??
        getExpectedVaultMetadataFromEnv(Deno.env.toObject());
    const skippedPorts = [];
    const maxPort = Math.min(65535, preferredPort + searchLimit);

    for (let port = preferredPort; port <= maxPort; port += 1) {
        const inspection = await inspectDevServerPort({
            expectedVaultMetadata,
            host,
            port,
        });
        const devUrl = getDevUrl(host, port);

        if (inspection.available) {
            return {
                devUrl,
                host,
                inspection,
                port,
                reuseExisting: false,
                skippedPorts,
            };
        }

        if (inspection.compatible) {
            return {
                devUrl,
                host,
                inspection,
                port,
                reuseExisting: true,
                skippedPorts,
            };
        }

        skippedPorts.push({ inspection, port });
    }

    throw new TauriDevServerError(
        formatNoAvailablePortMessage({
            host,
            maxPort,
            preferredPort,
            skippedPorts,
        }),
        {
            host,
            maxPort,
            preferredPort,
            skippedPorts,
        },
    );
};

export const prepareFixedTauriDevPort = async (options: {
    expectedVaultMetadata?: ExpectedVaultMetadata,
    host?: string,
    port?: number | string,
} = {}) => {
    const host = normalizeHost(options.host ?? DEFAULT_TAURI_DEV_HOST);
    const port = normalizePort(options.port ?? DEFAULT_TAURI_DEV_PORT, "port");
    const expectedVaultMetadata = options.expectedVaultMetadata ??
        getExpectedVaultMetadataFromEnv(Deno.env.toObject());
    const inspection = await inspectDevServerPort({
        expectedVaultMetadata,
        host,
        port,
    });
    const devUrl = getDevUrl(host, port);

    if (inspection.available) {
        return {
            action: "start" as const,
            devUrl,
            host,
            inspection,
            port,
        };
    }

    if (inspection.compatible) {
        return {
            action: "reuse" as const,
            devUrl,
            host,
            inspection,
            port,
        };
    }

    throw new TauriDevServerError(
        formatFixedPortOccupiedMessage({ devUrl, inspection, port }),
        {
            devUrl,
            host,
            inspection,
            port,
        },
    );
};

export const createTauriDevConfigOverride = (resolution: TauriDevResolution) => {
    return {
        build: {
            beforeDevCommand: null,
            devUrl: resolution.devUrl,
        },
    };
};

type ManagedViteDevServerOptions = SpawnOptions & {
    expectedVaultMetadata: ExpectedVaultMetadata,
};

const startManagedViteDevServer = async (
    resolution: TauriDevResolution,
    options: ManagedViteDevServerOptions,
) => {
    const child = spawnChild(Deno.execPath(), [
        "run",
        "-A",
        "npm:vite",
        "dev",
        "--host",
        resolution.host,
        "--port",
        String(resolution.port),
        "--strictPort",
    ], options);

    try {
        await waitForManagedViteDevServer(
            child,
            resolution,
            options.expectedVaultMetadata,
        );
        return child;
    } catch (error) {
        await stopChild(child);
        throw error;
    }
};

const waitForManagedViteDevServer = async (
    child: Deno.ChildProcess,
    resolution: TauriDevResolution,
    expectedVaultMetadata: ExpectedVaultMetadata,
) => {
    const status = child.status;
    const deadline = Date.now() + DEFAULT_TAURI_DEV_WAIT_TIMEOUT_MS;
    let lastReason = resolution.inspection.probe.reason;

    while (Date.now() < deadline) {
        const childStatus = await pollChildStatus(status);

        if (childStatus) {
            throw new TauriDevServerError(
                `[tauri-dev] Vite exited before ${resolution.devUrl} became ready (exit code ${childStatus.code}).`,
            );
        }

        const inspection = await inspectDevServerPort({
            expectedVaultMetadata,
            host: resolution.host,
            port: resolution.port,
            timeoutMs: 1_000,
        });

        if (!inspection.available && inspection.compatible) {
            return;
        }

        lastReason = inspection.probe.reason;
        await delay(200);
    }

    throw new TauriDevServerError(
        `[tauri-dev] Timed out waiting for ${resolution.devUrl} to serve Datahoarder (${lastReason}).`,
    );
};

const pollChildStatus = async (status: Promise<Deno.CommandStatus>) => {
    return await Promise.race([
        status,
        delay(0).then(() => null),
    ]);
};

const delay = (timeoutMs: number) => {
    return new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
};

export const logTauriDevResolution = (
    resolution: TauriDevResolution,
    log: (message: string) => void = console.log,
    warn: (message: string) => void = console.warn,
) => {
    for (const skipped of resolution.skippedPorts) {
        warn(
            `[tauri-dev] Port ${skipped.port} is in use by ${formatPortOwners(skipped.inspection.owners)} (${skipped.inspection.probe.reason}); trying the next port.`,
        );
    }

    if (resolution.reuseExisting) {
        log(
            `[tauri-dev] Reusing the existing Datahoarder dev server at ${resolution.devUrl} (${resolution.inspection.probe.reason}).`,
        );
        return;
    }

    log(
        `[tauri-dev] Starting the Datahoarder dev server at ${resolution.devUrl}.`,
    );
};

export const runViteDevServer = async (options: BeforeDevOptions) => {
    const host = normalizeHost(options.host ?? DEFAULT_TAURI_DEV_HOST);
    const port = normalizePort(options.port ?? DEFAULT_TAURI_DEV_PORT, "port");

    return await spawnAndWait(Deno.execPath(), [
        "run",
        "-A",
        "npm:vite",
        "dev",
        "--host",
        host,
        "--port",
        String(port),
        "--strictPort",
        ...options.extraViteArgs,
    ]);
};
