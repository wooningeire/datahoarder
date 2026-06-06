import { resolve } from "node:path";

export const DEFAULT_TAURI_DEV_HOST = "127.0.0.1";
export const DEFAULT_TAURI_DEV_PORT = 5173;
export const DEFAULT_TAURI_DEV_PORT_SEARCH_LIMIT = 25;

type Env = Record<string, string | undefined>;

type ExpectedVaultMetadata = {
  previewOrigin: string;
  previewRouteBase: string;
  root: string;
};

type PortOwner = {
  name?: string;
  pid: string;
};

type ProbeResult = {
  compatible: boolean;
  reason: string;
};

type PortInspection = {
  available: boolean;
  compatible: boolean;
  owners: PortOwner[];
  probe: ProbeResult;
};

type SkippedPort = {
  inspection: PortInspection;
  port: number;
};

type DevServerOptions = {
  expectedVaultMetadata?: ExpectedVaultMetadata;
  host?: string;
  preferredPort?: number | string;
  searchLimit?: number | string;
};

type BeforeDevOptions = {
  expectedVaultMetadata?: ExpectedVaultMetadata;
  extraViteArgs: string[];
  host: string;
  port: number;
};

type TauriDevResolution = {
  devUrl: string;
  host: string;
  inspection: PortInspection;
  port: number;
  reuseExisting: boolean;
  skippedPorts: SkippedPort[];
};

type SpawnOptions = {
  cwd?: string;
  env?: Record<string, string>;
  stdio?: "inherit" | "piped" | "null";
};

type FetchTextResult =
  | {
    ok: true;
    status: number;
    text: string;
  }
  | {
    error: string;
    ok: false;
    status?: number;
  };

type FetchJsonResult =
  | (FetchTextResult & { ok: false })
  | {
    ok: true;
    status: number;
    text: string;
    value: unknown;
  };

export class TauriDevServerError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TauriDevServerError";
    this.details = details;
  }
}

export function getDevServerOptionsFromEnv(
  env: Env = Deno.env.toObject(),
): DevServerOptions {
  return {
    expectedVaultMetadata: getExpectedVaultMetadataFromEnv(env),
    host: env.DATAHOARDER_TAURI_DEV_HOST || DEFAULT_TAURI_DEV_HOST,
    preferredPort: env.DATAHOARDER_TAURI_DEV_PORT || DEFAULT_TAURI_DEV_PORT,
    searchLimit: env.DATAHOARDER_TAURI_DEV_PORT_SEARCH_LIMIT ||
      DEFAULT_TAURI_DEV_PORT_SEARCH_LIMIT,
  };
}

export function parseBeforeDevArgs(
  args: string[],
  env: Env = Deno.env.toObject(),
): BeforeDevOptions {
  const options: {
    expectedVaultMetadata: ExpectedVaultMetadata;
    extraViteArgs: string[];
    host: number | string;
    port: number | string;
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
}

export async function runTauriCommand(
  args: string[],
  options: SpawnOptions = {},
) {
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
}

export async function resolveTauriDevServer(
  options: DevServerOptions = {},
): Promise<TauriDevResolution> {
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
  const skippedPorts: SkippedPort[] = [];
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
}

export async function inspectDevServerPort({
  expectedVaultMetadata,
  host,
  port,
  timeoutMs = 800,
}: {
  expectedVaultMetadata?: ExpectedVaultMetadata;
  host: string;
  port: number;
  timeoutMs?: number;
}): Promise<PortInspection> {
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
}

export async function prepareFixedTauriDevPort(options: {
  expectedVaultMetadata?: ExpectedVaultMetadata;
  host?: string;
  port?: number | string;
} = {}) {
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
}

export function createTauriDevConfigOverride(resolution: TauriDevResolution) {
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
}

export function logTauriDevResolution(
  resolution: TauriDevResolution,
  log: (message: string) => void = console.log,
  warn: (message: string) => void = console.warn,
) {
  for (const skipped of resolution.skippedPorts) {
    warn(
      `[tauri-dev] Port ${skipped.port} is in use by ${
        formatPortOwners(skipped.inspection.owners)
      } (${skipped.inspection.probe.reason}); trying the next port.`,
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
}

export function runViteDevServer(options: BeforeDevOptions) {
  const host = normalizeHost(options.host ?? DEFAULT_TAURI_DEV_HOST);
  const port = normalizePort(options.port ?? DEFAULT_TAURI_DEV_PORT, "port");

  return spawnAndWait(Deno.execPath(), [
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
}

export function formatPortOwners(owners: PortOwner[]) {
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
}

export function getDevUrl(host: string, port: number) {
  const normalizedHost = host.includes(":") && !host.startsWith("[")
    ? `[${host}]`
    : host;

  return `http://${normalizedHost}:${port}`;
}

async function probeDatahoarderDevServer(
  devUrl: string,
  timeoutMs: number,
  expectedVaultMetadata: ExpectedVaultMetadata,
): Promise<ProbeResult> {
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
}

async function fetchJson(
  url: URL,
  timeoutMs: number,
): Promise<FetchJsonResult> {
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
}

async function fetchText(
  url: URL,
  timeoutMs: number,
): Promise<FetchTextResult> {
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
}

function isDatahoarderVaultMetadata(
  value: unknown,
): value is ExpectedVaultMetadata & {
  enabled: boolean;
  name: string;
} {
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
}

function getExpectedVaultMetadataFromEnv(env: Env): ExpectedVaultMetadata {
  const rawRoot = env.DATAHOARDER_OPEN_FOLDER ??
    env.DATAHOARDER_VAULT_ROOT ??
    env.DATAHOARDER_WORKSPACE_ROOT ??
    "";

  return {
    previewOrigin: env.DATAHOARDER_PREVIEW_ORIGIN ?? "",
    previewRouteBase: normalizeRouteBase(
      env.DATAHOARDER_PREVIEW_ROUTE_BASE ?? "/notes",
    ),
    root: rawRoot.trim() ? resolve(rawRoot) : "",
  };
}

function getVaultMetadataMismatch(
  metadata: ExpectedVaultMetadata,
  expected: ExpectedVaultMetadata,
) {
  const mismatches: string[] = [];

  if (!pathsEqual(metadata.root, expected.root)) {
    mismatches.push(`root ${formatMismatch(metadata.root, expected.root)}`);
  }

  if (metadata.previewOrigin !== expected.previewOrigin) {
    mismatches.push(
      `preview origin ${
        formatMismatch(metadata.previewOrigin, expected.previewOrigin)
      }`,
    );
  }

  if (metadata.previewRouteBase !== expected.previewRouteBase) {
    mismatches.push(
      `preview route base ${
        formatMismatch(metadata.previewRouteBase, expected.previewRouteBase)
      }`,
    );
  }

  return mismatches.join(", ");
}

function pathsEqual(left: string, right: string) {
  if (Deno.build.os === "windows") {
    return left.toLowerCase() === right.toLowerCase();
  }

  return left === right;
}

function formatMismatch(actual: string, expected: string) {
  return `actual ${formatMetadataValue(actual)}, expected ${
    formatMetadataValue(expected)
  }`;
}

function formatMetadataValue(value: string) {
  return value ? JSON.stringify(value) : "empty";
}

function normalizeRouteBase(routeBase: string) {
  if (!routeBase || routeBase === "/") {
    return "";
  }

  return `/${routeBase.replace(/^\/+|\/+$/gu, "")}`;
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

async function getPortOwners(port: number) {
  if (Deno.build.os === "windows") {
    return getWindowsPortOwners(port);
  }

  return getUnixPortOwners(port);
}

async function getWindowsPortOwners(port: number) {
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
}

async function getWindowsProcessName(pid: string) {
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
}

async function getUnixPortOwners(port: number) {
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
}

function getAddressPort(address: string) {
  const match = address.match(/:(\d+)$/u);

  return match ? Number(match[1]) : NaN;
}

async function commandText(command: string, args: string[]) {
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
}

async function spawnAndWait(
  bin: string,
  args: string[],
  options: SpawnOptions = {},
) {
  const child = new Deno.Command(bin, {
    args,
    cwd: options.cwd,
    env: options.env,
    stderr: options.stdio ?? "inherit",
    stdin: options.stdio ?? "inherit",
    stdout: options.stdio ?? "inherit",
  }).spawn();
  const cleanupSignals = forwardSignals(child);

  try {
    const status = await child.status;

    return status.success ? 0 : status.code;
  } finally {
    cleanupSignals();
  }
}

function forwardSignals(child: Deno.ChildProcess) {
  const cleanups = [
    addForwardedSignal(child, "SIGINT"),
    addForwardedSignal(child, "SIGTERM"),
  ].filter((cleanup): cleanup is () => void => Boolean(cleanup));

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

function addForwardedSignal(child: Deno.ChildProcess, signal: Deno.Signal) {
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
}

function formatFixedPortOccupiedMessage({
  devUrl,
  inspection,
  port,
}: {
  devUrl: string;
  inspection: PortInspection;
  port: number;
}) {
  return [
    `[tauri-dev] Port ${port} is already in use by ${
      formatPortOwners(inspection.owners)
    }, and it does not look like the expected Datahoarder Vite server (${inspection.probe.reason}).`,
    `[tauri-dev] Tauri is configured to load ${devUrl}, so this beforeDevCommand cannot safely move to another port by itself.`,
    '[tauri-dev] Free that port, or rerun through "deno task tauri dev" so the wrapper can pass Tauri a temporary devUrl on the next free port.',
  ].join("\n");
}

function formatNoAvailablePortMessage({
  host,
  maxPort,
  preferredPort,
  skippedPorts,
}: {
  host: string;
  maxPort: number;
  preferredPort: number;
  skippedPorts: SkippedPort[];
}) {
  const skippedSummary = skippedPorts
    .map((skipped) =>
      `  - ${getDevUrl(host, skipped.port)}: ${
        formatPortOwners(skipped.inspection.owners)
      }`
    )
    .join("\n");

  return [
    `[tauri-dev] Could not find an available Datahoarder dev port from ${preferredPort} through ${maxPort}.`,
    skippedSummary,
    "[tauri-dev] Stop one of those processes or set DATAHOARDER_TAURI_DEV_PORT to another starting port.",
  ]
    .filter(Boolean)
    .join("\n");
}

function hasHelpFlag(args: string[]) {
  return args.includes("--help") || args.includes("-h");
}

function normalizeHost(value: number | string) {
  const host = String(value ?? "").trim();

  if (!host) {
    throw new TauriDevServerError("A Tauri dev host is required.");
  }

  if (!/^[\w.:-]+$/u.test(host)) {
    throw new TauriDevServerError(`Invalid Tauri dev host: ${host}`);
  }

  return host;
}

function normalizePort(value: number | string, label: string) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TauriDevServerError(`Invalid Tauri dev ${label}: ${value}`);
  }

  return port;
}

function normalizeSearchLimit(value: number | string) {
  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 0 || limit > 200) {
    throw new TauriDevServerError(
      `Invalid Tauri dev port search limit: ${value}`,
    );
  }

  return limit;
}
