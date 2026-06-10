import {
    formatFixedPortOccupiedMessage,
    formatNoAvailablePortMessage,
    formatPortOwners,
    inspectDevServerPort,
} from "./tauri-dev-server-probe.ts";
import { spawnAndWait } from "./tauri-dev-server-process.ts";
import {
    DEFAULT_TAURI_DEV_HOST,
    DEFAULT_TAURI_DEV_PORT,
    DEFAULT_TAURI_DEV_PORT_SEARCH_LIMIT,
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

    const resolution = await resolveTauriDevServer(
        getDevServerOptionsFromEnv(options.env ?? Deno.env.toObject()),
    );

    logTauriDevResolution(resolution);

    const override = createTauriDevConfigOverride(resolution);
    const devArgs = [
        "dev",
        "--config",
        JSON.stringify(override),
        ...args.slice(1),
    ];

    return spawnAndWait(Deno.execPath(), [
        "run",
        "-A",
        "npm:@tauri-apps/cli",
        ...devArgs,
    ], options);
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
            beforeDevCommand: resolution.reuseExisting ? null : {
                script:
                    `deno run -A ./scripts/tauri-before-dev.ts --host ${resolution.host} --port ${resolution.port}`,
                wait: false,
            },
            devUrl: resolution.devUrl,
        },
    };
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
