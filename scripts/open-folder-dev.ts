import { resolve } from "node:path";
import { TargetDevServerError } from "./target-dev-server.ts";

type ParsedArgs = {
    disableTargetServer: boolean;
    folder: string;
    previewRouteBase: string;
    targetHost: string;
    targetPort: string;
    targetPortSearchLimit: string;
    targetRoot: string;
    targetTask: string;
    viteArgs: string[];
};

type SpawnOptions = {
    env: Record<string, string>;
};

try {
    const parsed = parseArgs(Deno.args);
    let env = Deno.env.toObject();

    if (parsed.folder) {
        env.DATAHOARDER_OPEN_FOLDER = await resolveFolder(parsed.folder);
    }

    if (parsed.previewRouteBase) {
        env.DATAHOARDER_PREVIEW_ROUTE_BASE = parsed.previewRouteBase;
    }

    applyTargetPreviewEnv(parsed, env);

    Deno.exit(await runDatahoarderDevServer(parsed.viteArgs, env));
} catch (error) {
    if (error instanceof TargetDevServerError) {
        console.error(error.message);
        Deno.exit(1);
    }

    throw error;
}

async function runDatahoarderDevServer(
    viteArgs: string[],
    env: Record<string, string>,
) {
    return await spawnAndWait(Deno.execPath(), [
        "run",
        "-A",
        "npm:vite",
        "dev",
        ...viteArgs,
    ], {
        env,
    });
}

async function spawnAndWait(
    bin: string,
    args: string[],
    options: SpawnOptions,
) {
    const child = new Deno.Command(bin, {
        args,
        env: options.env,
        stderr: "inherit",
        stdin: "inherit",
        stdout: "inherit",
    }).spawn();
    const cleanupSignals = forwardSignals([child]);

    try {
        const status = await child.status;

        return status.success ? 0 : status.code;
    } finally {
        cleanupSignals();
    }
}

function applyTargetPreviewEnv(parsed: ParsedArgs, env: Record<string, string>) {
    if (parsed.disableTargetServer) {
        env.DATAHOARDER_TARGET_DEV_DISABLED = "true";
    }

    if (parsed.targetHost) {
        env.DATAHOARDER_TARGET_DEV_HOST = parsed.targetHost;
    }

    if (parsed.targetPort) {
        env.DATAHOARDER_TARGET_DEV_PORT = parsed.targetPort;
    }

    if (parsed.targetPortSearchLimit) {
        env.DATAHOARDER_TARGET_DEV_PORT_SEARCH_LIMIT = parsed.targetPortSearchLimit;
    }

    if (parsed.targetRoot) {
        env.DATAHOARDER_TARGET_DEV_ROOT = parsed.targetRoot;
    }

    if (parsed.targetTask) {
        env.DATAHOARDER_TARGET_DEV_TASK = parsed.targetTask;
    }
}

function forwardSignals(children: Deno.ChildProcess[]) {
    const cleanups = [
        addForwardedSignal(children, "SIGINT"),
        addForwardedSignal(children, "SIGTERM"),
    ].filter((cleanup): cleanup is () => void => Boolean(cleanup));

    return () => {
        for (const cleanup of cleanups) {
            cleanup();
        }
    };
}

function addForwardedSignal(children: Deno.ChildProcess[], signal: Deno.Signal) {
    const forward = () => {
        for (const child of children) {
            try {
                child.kill(signal);
            } catch {
                // A child can exit between signal registration and forwarding.
            }
        }
    };

    try {
        Deno.addSignalListener(signal, forward);

        return () => Deno.removeSignalListener(signal, forward);
    } catch {
        return null;
    }
}

async function resolveFolder(folder: string) {
    const resolved = resolve(folder);

    try {
        const stats = await Deno.stat(resolved);

        if (stats.isDirectory) {
            return resolved;
        }
    } catch {
        // The explicit error below is clearer than leaking platform-specific stat text.
    }

    throw new TargetDevServerError(`Open folder does not exist: ${resolved}`, { folder: resolved });
}

function parseArgs(args: string[]): ParsedArgs {
    const parsed: ParsedArgs = {
        disableTargetServer: false,
        folder: "",
        previewRouteBase: "",
        targetHost: "",
        targetPort: "",
        targetPortSearchLimit: "",
        targetRoot: "",
        targetTask: "",
        viteArgs: [],
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--") {
            parsed.viteArgs.push(...args.slice(index + 1));
            break;
        }

        if (arg === "--folder" || arg === "--open-folder" || arg === "--root") {
            parsed.folder = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg === "--preview-route-base") {
            parsed.previewRouteBase = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg === "--target-host") {
            parsed.targetHost = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg === "--target-port") {
            parsed.targetPort = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg === "--target-port-search-limit") {
            parsed.targetPortSearchLimit = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg === "--target-root") {
            parsed.targetRoot = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg === "--target-task") {
            parsed.targetTask = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg === "--no-target-server") {
            parsed.disableTargetServer = true;
            continue;
        }

        if (arg === "--runtime") {
            index += 1;
            continue;
        }

        if (!parsed.folder && !arg.startsWith("-")) {
            parsed.folder = arg;
            continue;
        }

        parsed.viteArgs.push(arg);
    }

    return parsed;
}
