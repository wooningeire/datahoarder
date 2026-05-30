# Datahoarder

Reusable note-viewing and local-vault tooling for the notes app, plus a hosted/local SvelteKit shell.

## Run the local shell

```powershell
cd C:\Users\V\_\dev\datahoarder
deno task dev
```

You can also run `npm run dev` from the same folder. Open the URL Vite prints, then choose your notes folder, usually `C:\Users\V\_\obsidian\obsidian\src\lib\notes`.

The shell intentionally previews portable markdown and `.base` files only. Custom Svelte execution stays in the private notes SvelteKit project.

## Package Boundary

The private notes project supplies a vault config and literal `import.meta.glob` calls, while this package owns note tree construction, route helpers, markdown preprocessing, `.base` parsing, shared note UI, and the browser-local File System Access shell.