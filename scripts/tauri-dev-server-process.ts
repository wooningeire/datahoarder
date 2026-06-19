import type { SpawnOptions } from "./tauri-dev-server-types.ts";

export const spawnAndWait = async (
    bin: string,
    args: string[],
    options: SpawnOptions = {},
) => {
    const child = spawnChild(bin, args, options);
    const cleanupSignals = forwardSignals(child);

    try {
        const status = await child.status;

        return status.success ? 0 : status.code;
    } finally {
        cleanupSignals();
    }
};

export const spawnChild = (
    bin: string,
    args: string[],
    options: SpawnOptions = {},
) => {
    return new Deno.Command(bin, {
        args,
        cwd: options.cwd,
        env: options.env,
        stderr: options.stdio ?? "inherit",
        stdin: options.stdio ?? "inherit",
        stdout: options.stdio ?? "inherit",
    }).spawn();
};

export const stopChild = async (
    child: Deno.ChildProcess,
    signal: Deno.Signal = "SIGTERM",
) => {
    try {
        child.kill(signal);
    } catch {
        return;
    }

    await child.status.catch(() => null);
};

const forwardSignals = (child: Deno.ChildProcess) => {
    const cleanups = [
        addForwardedSignal(child, "SIGINT"),
        addForwardedSignal(child, "SIGTERM"),
    ].filter((cleanup): cleanup is () => void => Boolean(cleanup));

    return () => {
        for (const cleanup of cleanups) {
            cleanup();
        }
    };
};

const addForwardedSignal = (child: Deno.ChildProcess, signal: Deno.Signal) => {
    const forward = () => {
        try {
            child.kill(signal);
        } catch {
            // The child may already have exited by the time the signal arrives.
        }
    };

    try {
        Deno.addSignalListener(signal, forward);

        return () => Deno.removeSignalListener(signal, forward);
    } catch {
        return null;
    }
};
