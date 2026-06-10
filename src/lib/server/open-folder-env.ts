import process from "node:process";

export const defaultTargetDevHost = "127.0.0.1";
export const defaultTargetDevPort = 5174;
export const defaultTargetDevPortSearchLimit = 25;
export const defaultTargetDevTask = "dev";
export const defaultTargetDevWaitTimeoutMs = 60_000;

type EnvGlobal = typeof globalThis & {
    Deno?: {
        execPath?: () => string,
        env?: {
            get: (name: string) => string | undefined,
            toObject?: () => Record<string, string>,
        },
    },
    process?: {
        env?: Record<string, string | undefined>,
    },
};

export const getEnv = (name: string) => {
    const host = globalThis as EnvGlobal;

    return host.Deno?.env?.get(name) ?? host.process?.env?.[name];
};

export const getCommandEnv = () => {
    const host = globalThis as EnvGlobal;

    return host.Deno?.env?.toObject?.() ?? process.env;
};

export const getDenoExecutable = () => {
    const host = globalThis as EnvGlobal;

    return getEnv("DENO") ?? host.Deno?.execPath?.() ?? "deno";
};

export const isTargetDevServerDisabled = () => {
    const value = (getEnv("DATAHOARDER_TARGET_DEV_DISABLED") ?? "").trim().toLowerCase();

    return value === "1" || value === "true";
};

export const getDevUrl = (host: string, port: number) => {
    const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;

    return `http://${normalizedHost}:${port}`;
};

export const normalizeHost = (value: string) => {
    const host = value.trim();

    if (!host) {
        throw new Error("A target dev host is required.");
    }

    if (!/^[\w.:-]+$/u.test(host)) {
        throw new Error(`Invalid target dev host: ${host}`);
    }

    return host;
};

export const normalizePort = (value: string, label: string) => {
    const port = Number(value);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid ${label}: ${value}`);
    }

    return port;
};

export const normalizeSearchLimit = (value: string) => {
    const limit = Number(value);

    if (!Number.isInteger(limit) || limit < 0 || limit > 200) {
        throw new Error(`Invalid target dev port search limit: ${value}`);
    }

    return limit;
};

export const normalizeTaskName = (value: string) => {
    const task = value.trim();

    if (!task || /[\s"'`]/u.test(task)) {
        throw new Error(`Invalid target Deno task name: ${value}`);
    }

    return task;
};

export const normalizeWaitTimeoutMs = () => {
    const value = getEnv("DATAHOARDER_TARGET_DEV_WAIT_TIMEOUT_MS");

    if (!value) {
        return defaultTargetDevWaitTimeoutMs;
    }

    const timeoutMs = Number(value);

    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
        throw new Error(`Invalid target dev wait timeout: ${value}`);
    }

    return timeoutMs;
};

export const delay = (ms: number) => {
    return new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms));
};

export const normalizeRouteBase = (routeBase: string) => {
    if (!routeBase || routeBase === "/") {
        return "";
    }

    return `/${routeBase.replace(/^\/+|\/+$/gu, "")}`;
};
