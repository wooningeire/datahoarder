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

## Native Collections

Datahoarder collection files use explicit sources instead of querying every vault file by default.
Create a `*.dhbase.yaml` or `*.collection.yaml` file in the opened vault:

```yaml
source:
  folders: [applications/]
  match:
    status:
      exists: true

schema:
  company: text
  role: text
  status: enum
  applied: date

views:
  - name: Applications
    type: table
```

Source paths are resolved relative to the collection file first, with vault-root paths still accepted as a fallback. Selecting the collection file in the local shell renders matching Markdown notes as a sortable, filterable table. The Markdown files remain the source of truth; Datahoarder rebuilds the in-memory vault index from local files.

## Package Boundary

This repo follows the Svelte library template shape:

- `src/lib` is the public package surface for `@vaie/datahoarder`.
- `src/routes` is the hosted shell/demo app.
- `deno task prepack` runs `svelte-package` and `publint`, generating the publishable `dist` package.
- `deno task pack` should include `dist` only, not app routes or raw source.

The private notes project supplies a vault config and literal `import.meta.glob` calls, while this package owns note tree construction, route helpers, markdown preprocessing, `.base` parsing, shared note UI, and the browser-local File System Access shell.
