# Datahoarder

Reusable note-viewing and local-vault tooling for SvelteKit notes apps, plus the hosted/local Datahoarder shell.

## Run the Shell

Deno is the preferred command surface:

```powershell
cd C:\Users\V\_\dev\datahoarder
deno task dev
```

To pass Vite flags through Deno, append them directly, for example `deno task dev --port 5191`.

Open the URL Vite prints, then choose your notes folder, usually `C:\Users\V\_\obsidian\obsidian\src\lib\notes`.

The shell intentionally previews portable markdown and `.base` files only. Custom Svelte execution stays in the private notes SvelteKit project.

## Package Boundary

This repo follows the Svelte library template shape:

- `src/lib` is the public package surface for `@vaie/datahoarder`.
- `src/routes` is the hosted shell/demo app.
- `deno task prepack` runs `svelte-package` and `publint`, generating the publishable `dist` package.
- `deno task pack` should include `dist` only, not app routes or raw source.

The private notes project supplies a vault config and literal `import.meta.glob` calls, while this package owns note tree construction, route helpers, markdown preprocessing, `.base` parsing, shared note UI, and the browser-local File System Access shell.