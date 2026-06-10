import { resolve } from "node:path";

export const DEFAULT_TAURI_DEV_HOST = "127.0.0.1";
export const DEFAULT_TAURI_DEV_PORT = 5191;
export const DEFAULT_TAURI_DEV_PORT_SEARCH_LIMIT = 25;

export type Env = Record<string, string | undefined>;

export type ExpectedVaultMetadata = {
    previewRouteBase: string,
    root: string,
};

export type PortOwner = {
    name?: string,
    pid: string,
};

export type ProbeResult = {
    compatible: boolean,
    reason: string,
};

export type PortInspection = {
    available: boolean,
    compatible: boolean,
    owners: PortOwner[],
    probe: ProbeResult,
};

export type SkippedPort = {
    inspection: PortInspection,
    port: number,
};

export type DevServerOptions = {
    expectedVaultMetadata?: ExpectedVaultMetadata,
    host?: string,
    preferredPort?: number | string,
    searchLimit?: number | string,
};

export type BeforeDevOptions = {
    expectedVaultMetadata?: ExpectedVaultMetadata,
    extraViteArgs: string[],
    host: string,
    port: number,
};

export type TauriDevResolution = {
    devUrl: string,
    host: string,
    inspection: PortInspection,
    port: number,
    reuseExisting: boolean,
    skippedPorts: SkippedPort[],
};

export type SpawnOptions = {
    cwd?: string,
    env?: Record<string, string>,
    stdio?: "inherit" | "piped" | "null",
};

export class TauriDevServerError extends Error {
    details: Record<string, unknown>;

    constructor(message: string, details: Record<string, unknown> = {}) {
        super(message);
        this.name = "TauriDevServerError";
        this.details = details;
    }
}

export const getDevUrl = (host: string, port: number) => {
    const normalizedHost = host.includes(":") && !host.startsWith("[")
        ? `[${host}]`
        : host;

    return `http://${normalizedHost}:${port}`;
};

export const getExpectedVaultMetadataFromEnv = (env: Env): ExpectedVaultMetadata => {
    const rawRoot = env.DATAHOARDER_OPEN_FOLDER ??
        env.DATAHOARDER_VAULT_ROOT ??
        env.DATAHOARDER_WORKSPACE_ROOT ??
        "";

    return {
        previewRouteBase: normalizeRouteBase(
            env.DATAHOARDER_PREVIEW_ROUTE_BASE ?? "/notes",
        ),
        root: rawRoot.trim() ? resolve(rawRoot) : "",
    };
};

export const hasHelpFlag = (args: string[]) => {
    return args.includes("--help") || args.includes("-h");
};

export const normalizeHost = (value: number | string) => {
    const host = String(value ?? "").trim();

    if (!host) {
        throw new TauriDevServerError("A Tauri dev host is required.");
    }

    if (!/^[\w.:-]+$/u.test(host)) {
        throw new TauriDevServerError(`Invalid Tauri dev host: ${host}`);
    }

    return host;
};

export const normalizePort = (value: number | string, label: string) => {
    const port = Number(value);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new TauriDevServerError(`Invalid Tauri dev ${label}: ${value}`);
    }

    return port;
};

export const normalizeSearchLimit = (value: number | string) => {
    const limit = Number(value);

    if (!Number.isInteger(limit) || limit < 0 || limit > 200) {
        throw new TauriDevServerError(
            `Invalid Tauri dev port search limit: ${value}`,
        );
    }

    return limit;
};

const normalizeRouteBase = (routeBase: string) => {
    if (!routeBase || routeBase === "/") {
        return "";
    }

    return `/${routeBase.replace(/^\/+|\/+$/gu, "")}`;
};
