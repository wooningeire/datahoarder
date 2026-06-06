import { runTauriCommand, TauriDevServerError } from "./tauri-dev-server.ts";

try {
  Deno.exit(await runTauriCommand(Deno.args));
} catch (error) {
  if (error instanceof TauriDevServerError) {
    console.error(error.message);
    Deno.exit(1);
  }

  throw error;
}
