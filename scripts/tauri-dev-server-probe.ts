import {
    getDevUrl,
    getExpectedVaultMetadataFromEnv,
    type ExpectedVaultMetadata,
    type PortInspection,
    type PortOwner,
    type SkippedPort,
} from "./tauri-dev-server-types.ts";

type FetchTextResult =
    | {
        ok: true,
        status: number,
        text: string,
    }
    | {
        error: string,
        ok: false,
        status?: number,
    };

type FetchJsonResult =
    | (FetchTextResult & { ok: false })
    | {
        ok: true,
        status: number,
        text: string,
        value: unknown,
    };

export const inspectDevServerPort = async ({
    expectedVaultMetadata,
    host,
    port,
    timeoutMs = 800,
}: {
    expectedVaultMetadata?: ExpectedVaultMetadata,
    host: string,
    port: number,
    timeoutMs?: number,
}): Promise<PortInspection> => {
    const available = await canBindPort(host, port);
    const expectedMetadata = expectedVaultMetadata ??
        getExpectedVaultMetadataFromEnv(Deno.env.toObject());

    if (available) {
        return {
            available: true,
            compatible: false,
            owners: [],
            probe: { compatible: false, reason: "port is available" },
        };
    }

    const [probe, owners] = await Promise.all([
        probeDatahoarderDevServer(
            getDevUrl(host, port),
            timeoutMs,
            expectedMetadata,
        ),
        getPortOwners(port).catch(() => []),
    ]);

    return {
        available: false,
        compatible: probe.compatible,
        owners,
        probe,
    };
};

export const formatPortOwners = (owners: PortOwner[]) => {
    if (!owners.length) {
        return "an unknown process";
    }

    return owners
        .map((owner) => {
            if (owner.name) {
                return `${owner.name} (PID ${owner.pid})`;
            }

            return `PID ${owner.pid}`;
        })
        .join(", ");
};

export const formatFixedPortOccupiedMessage = ({
    devUrl,
    inspection,
    port,
}: {
    devUrl: string,
    inspection: PortInspection,
    port: number,
}) => {
    return [
        `[tauri-dev] Port ${port} is already in use by ${formatPortOwners(inspection.owners)}, and it does not look like the expected Datahoarder Vite server (${inspection.probe.reason}).`,
        `[tauri-dev] Tauri is configured to load ${devUrl}, so this beforeDevCommand cannot safely move to another port by itself.`,
        "[tauri-dev] Free that port, or rerun through \"deno task tauri dev\" so the wrapper can pass Tauri a temporary devUrl on the next free port.",
    ].join("\n");
};

export const formatNoAvailablePortMessage = ({
    host,
    maxPort,
    preferredPort,
    skippedPorts,
}: {
    host: string,
    maxPort: number,
    preferredPort: number,
    skippedPorts: SkippedPort[],
}) => {
    const skippedSummary = skippedPorts
        .map((skipped) =>
            `  - ${getDevUrl(host, skipped.port)}: ${formatPortOwners(skipped.inspection.owners)}`
        )
        .join("\n");

    return [
        `[tauri-dev] Could not find an available Datahoarder dev port from ${preferredPort} through ${maxPort}.`,
        skippedSummary,
        "[tauri-dev] Stop one of those processes or set DATAHOARDER_TAURI_DEV_PORT to another starting port.",
    ]
        .filter(Boolean)
        .join("\n");
};

const probeDatahoarderDevServer = async (
    devUrl: string,
    timeoutMs: number,
    expectedVaultMetadata: ExpectedVaultMetadata,
) => {
    const vaultApi = await fetchJson(new URL("/api/vault", devUrl), timeoutMs);

    if (vaultApi.ok && isDatahoarderVaultMetadata(vaultApi.value)) {
        const mismatch = getVaultMetadataMismatch(
            vaultApi.value,
            expectedVaultMetadata,
        );

        if (mismatch) {
            return {
                compatible: false,
                reason: `Datahoarder vault API responded with different ${mismatch}`,
            };
        }

        return {
            compatible: true,
            reason: "Datahoarder vault API responded",
        };
    }

    const root = await fetchText(new URL("/", devUrl), timeoutMs);

    if (
        root.ok &&
        root.text.includes("Datahoarder") &&
        (root.text.includes("data-sveltekit-preload-data") ||
            root.text.includes("/@vite/client"))
    ) {
        return {
            compatible: true,
            reason: "Datahoarder app shell responded",
        };
    }

    return {
        compatible: false,
        reason: vaultApi.ok || root.ok
            ? "port responded but did not match Datahoarder"
            : "no HTTP response",
    };
};

const fetchJson = async (
    url: URL,
    timeoutMs: number,
): Promise<FetchJsonResult> => {
    const result = await fetchText(url, timeoutMs);

    if (!result.ok) {
        return result;
    }

    try {
        return {
            ...result,
            value: JSON.parse(result.text),
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            status: result.status,
        };
    }
};

const fetchText = async (
    url: URL,
    timeoutMs: number,
): Promise<FetchTextResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
        });

        return {
            ok: true,
            status: response.status,
            text: await response.text(),
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        clearTimeout(timeout);
    }
};

const isDatahoarderVaultMetadata = (
    value: unknown,
): value is ExpectedVaultMetadata & {
    enabled: boolean,
    name: string,
} => {
    if (!value || typeof value !== "object") {
        return false;
    }

    const metadata = value as Record<string, unknown>;

    return (
        typeof metadata.enabled === "boolean" &&
        typeof metadata.name === "string" &&
        typeof metadata.previewOrigin === "string" &&
        typeof metadata.previewRouteBase === "string" &&
        typeof metadata.root === "string"
    );
};

const getVaultMetadataMismatch = (
    metadata: ExpectedVaultMetadata,
    expected: ExpectedVaultMetadata,
) => {
    const mismatches: string[] = [];

    if (!pathsEqual(metadata.root, expected.root)) {
        mismatches.push(`root ${formatMismatch(metadata.root, expected.root)}`);
    }

    if (metadata.previewRouteBase !== expected.previewRouteBase) {
        mismatches.push(
            `preview route base ${formatMismatch(metadata.previewRouteBase, expected.previewRouteBase)}`,
        );
    }

    return mismatches.join(", ");
};

const pathsEqual = (left: string, right: string) => {
    if (Deno.build.os === "windows") {
        return left.toLowerCase() === right.toLowerCase();
    }

    return left === right;
};

const formatMismatch = (actual: string, expected: string) => {
    return `actual ${formatMetadataValue(actual)}, expected ${formatMetadataValue(expected)}`;
};

const formatMetadataValue = (value: string) => {
    return value ? JSON.stringify(value) : "empty";
};

const canBindPort = (host: string, port: number) => {
    try {
        const listener = Deno.listen({ hostname: host, port, transport: "tcp" });

        listener.close();
        return true;
    } catch {
        return false;
    }
};

const getPortOwners = async (port: number) => {
    if (Deno.build.os === "windows") {
        return getWindowsPortOwners(port);
    }

    return getUnixPortOwners(port);
};

const getWindowsPortOwners = async (port: number) => {
    const netstat = await commandText("netstat", ["-ano", "-p", "tcp"]);
    const pids = new Set<string>();

    for (const line of netstat.split(/\r?\n/u)) {
        const columns = line.trim().split(/\s+/u);

        if (columns[0] !== "TCP" || columns[3] !== "LISTENING") {
            continue;
        }

        const localPort = getAddressPort(columns[1]);

        if (localPort === port) {
            pids.add(columns[4]);
        }
    }

    const owners = await Promise.all(
        [...pids].map(async (pid) => ({
            name: await getWindowsProcessName(pid),
            pid,
        })),
    );

    return owners.filter((owner) => owner.pid);
};

const getWindowsProcessName = async (pid: string) => {
    try {
        const tasklist = await commandText("tasklist", [
            "/FI",
            `PID eq ${pid}`,
            "/FO",
            "CSV",
            "/NH",
        ]);
        const match = tasklist.match(/^"([^"]+)","/u);

        return match?.[1] ?? "";
    } catch {
        return "";
    }
};

const getUnixPortOwners = async (port: number) => {
    try {
        const lsof = await commandText("lsof", [
            "-nP",
            `-iTCP:${port}`,
            "-sTCP:LISTEN",
        ]);
        const owners: PortOwner[] = [];

        for (const line of lsof.split(/\r?\n/u).slice(1)) {
            const columns = line.trim().split(/\s+/u);

            if (columns.length >= 2) {
                owners.push({ name: columns[0], pid: columns[1] });
            }
        }

        return owners;
    } catch {
        return [];
    }
};

const getAddressPort = (address: string) => {
    const match = address.match(/:(\d+)$/u);

    return match ? Number(match[1]) : NaN;
};

const commandText = async (command: string, args: string[]) => {
    const output = await new Deno.Command(command, {
        args,
        stderr: "null",
        stdin: "null",
        stdout: "piped",
    }).output();

    if (!output.success) {
        throw new Error(`${command} exited with status ${output.code}`);
    }

    return new TextDecoder().decode(output.stdout);
};
