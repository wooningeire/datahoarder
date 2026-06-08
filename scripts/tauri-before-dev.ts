import {
  parseBeforeDevArgs,
  prepareFixedTauriDevPort,
  runViteDevServer,
  TauriDevServerError,
} from "./tauri-dev-server.ts";

if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
  console.log(
    "Usage: deno run -A scripts/tauri-before-dev.ts [--host 127.0.0.1] [--port 5191] [-- <vite args>]",
  );
  Deno.exit(0);
}

try {
  const options = parseBeforeDevArgs(Deno.args);
  const result = await prepareFixedTauriDevPort(options);

  if (result.action === "reuse") {
    console.log(
      `[tauri-dev] Reusing the existing Datahoarder dev server at ${result.devUrl} (${result.inspection.probe.reason}).`,
    );
    Deno.exit(0);
  }

  console.log(
    `[tauri-dev] Starting the Datahoarder dev server at ${result.devUrl}.`,
  );
  Deno.exit(await runViteDevServer(options));
} catch (error) {
  if (error instanceof TauriDevServerError) {
    console.error(error.message);
    Deno.exit(1);
  }

  throw error;
}
