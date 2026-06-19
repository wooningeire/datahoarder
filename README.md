# Datahoarder

Reusable note-viewing and local-vault tooling for SvelteKit notes apps, plus the hosted/local Datahoarder shell.

## Run the Shell

Deno is the command surface:

```powershell
cd C:\Users\V\_\dev\datahoarder
deno task dev
```

To pass Vite flags through Deno, append them directly, for example `deno task dev --port 5191`.

For process-backed folder access, pass the open folder to the dev launcher:

```powershell
deno task dev:folder C:\Users\V\_\obsidian\obsidian\src\lib\notes
```

The launcher sets `DATAHOARDER_OPEN_FOLDER` and starts Datahoarder through Deno. If an explicit SvelteKit route file is previewed and the opened folder or one of its ancestors contains `deno.json` or `deno.jsonc`, Datahoarder starts `deno task dev` in that Deno project root on demand, waits for it to answer on `http://127.0.0.1:5174` or the next free target port, and embeds that route. Vite flags for Datahoarder can be passed after `--`, for example:

```powershell
deno task dev:folder C:\path\to\target-app -- --port 5191
```

Use `--target-root`, `--target-port`, `--target-host`, `--target-task`, or the matching `DATAHOARDER_TARGET_DEV_*` environment variables when the target app needs a different launch surface. Use `--no-target-server` for markdown-only folders or when route previews should stay disabled.

When `DATAHOARDER_OPEN_FOLDER` is set, the shell loads that folder through SvelteKit server routes. The preview pane shows `/preview/<path>` in an iframe. Markdown, SVX, collection, board, and trusted non-route `.svelte` notes render through Datahoarder itself. Explicit SvelteKit route files such as `src/routes/+page.svelte` use the opened folder's target Deno server on demand; if no target origin can be resolved, route files show the preview-server-required message instead of embedding Datahoarder itself. Without a process-backed folder, the browser File System Access picker remains available in Chrome or Edge.

Svelte notes execute local code during server rendering, so they require explicit trust:

```powershell
$env:DATAHOARDER_TRUST_SVELTE_NOTES = "true"
deno task dev:folder C:\path\to\notes
```

This v1 renderer supports single-file `.svelte` notes. Relative imports and full SvelteKit route semantics stay in explicit route previews.

Point markdown-style note previews at another route base by setting `DATAHOARDER_PREVIEW_ROUTE_BASE`:

```powershell
$env:DATAHOARDER_PREVIEW_ROUTE_BASE = "/notes"
deno task dev:folder C:\path\to\notes
```

Primary project commands live in `deno.json`; `package.json` carries npm aliases for the folder-aware dev flow and common checks.

## Run the Native Shell

Tauri v2 is initialized under `src-tauri/` and uses the existing SvelteKit app as its frontend. In development, Tauri starts the local Vite dev server through Deno so WebView2 can load the app with HMR:

```powershell
cd C:\Users\V\_\dev\datahoarder
deno task tauri dev
```

The Deno/TypeScript Tauri dev wrapper prefers `http://127.0.0.1:5191` so normal target Vite/SvelteKit apps can keep using `5173`. If that port already hosts a Datahoarder Vite server, it reuses it. If another process owns the port, the wrapper starts Vite on the next free port and passes Tauri a temporary `devUrl` override. Set `DATAHOARDER_TAURI_DEV_PORT` to choose a different starting port. Direct Tauri CLI invocations use the fixed config URL at `http://127.0.0.1:5191`, and the `beforeDevCommand` reports the process occupying that port instead of surfacing a raw Vite stack. Production builds use the SvelteKit static output in `build/`.

When `DATAHOARDER_OPEN_FOLDER` points at a Deno target app, route previews start the target app with `deno task dev` on demand. If Tauri reuses an existing Datahoarder dev server without an active target origin, the server preview route still starts the target app when an explicit route preview is opened.

Inside Tauri, the shell opens local folders through native Tauri commands instead of the browser File System Access API. The native path reads and writes files directly from Rust, uses `DATAHOARDER_OPEN_FOLDER` as the default vault when it is set, opens a native OS folder picker when choosing a folder manually, and remembers picked folder paths in local storage for later Tauri launches. `~` is expanded against the current user's home directory for environment-provided vault roots. Browser FSA remains the fallback for Chrome or Edge outside Tauri.

The local shell can search the full opened vault, use a `Ctrl`/`Cmd` + `K` command palette to jump to notes or run common actions, save reusable global searches as vault files, create notes, create notes from local templates, create starter SVX whiteboard drawing notes, append simple whiteboard or legacy Excalidraw canvas elements, update inline note fields, add collection fields, edit inline-backed collection cells, rename or move files, delete files, preview common Excalidraw scenes and whiteboards as static SVG, export notes/views as standalone HTML, export collection views as CSV/JSON, and keep browser-local pinned/recent note lists for quick retrieval.

Vault refreshes reuse unchanged indexed note records by path, route path, extension, size, and updated timestamp, while local note edits explicitly invalidate their own record before rebuilding the index.

When a note is selected, the preview pane also lists backlinks from other indexed notes that point to it through Obsidian wiki links or local Markdown links.

Template files live under `Templates/` or use a `.template.md` suffix. `New From Template` replaces `{{title}}`, `{{path}}`, `{{slug}}`, `{{date}}`, and `{{datetime}}` in the created note.

Saved global searches live in `*.dhsearch.json`, `*.dhsearch.yaml`, or `*.dhsearch.yml` files and are loaded from the opened vault. The shell creates JSON presets under `Saved Searches/`:

```json
{
  "name": "Visual Sankey",
  "query": "#visual sankey"
}
```

Search boxes, saved searches, and collection view filters share the same compact query syntax. Plain words are ANDed, quoted values keep spaces together, `#tag` or `tag:value` matches tags, `field:value` checks a note field, `field=value` checks an exact value, `field:*` requires a value, and `-term` excludes matches:

```text
#portfolio status:ready company:"Acme Labs" -draft
```

Markdown previews can toggle task-list checkboxes back into the local Markdown source, while HTML exports render task lists as disabled static checkboxes. Pipe-style Markdown tables render with header alignment in previews and exports. Datahoarder also enables custom Markdown rules for inline math (`$x$`), display math (`$$x$$`), mark (`==text==`), and underline (`_text_`). Package users can pass `markdownRules` to `renderPortableMarkdown` or `applyMarkdownSourceRules` to disable any of those rules for their own render surface. Previews and exports also support reusable note embeds with Obsidian-style syntax such as `![[Reusable Note]]`, `![[Reusable Note#Section]]`, and `![[Reusable Note|Alias]]`. Embeds strip frontmatter and stop recursive loops.

```ts
renderPortableMarkdown(content, {
    markdownRules: {
        inlineMath: true,
        displayMath: true,
        mark: false,
        underline: false,
    },
});
```

Reusable embeds can also accept simple parameters. Put `{{placeholder}}` values in the reusable note or section, then pass `key=value` parts after the alias:

```markdown
![[Components/Application Card#Card|Application Card|company=Acme Labs|status=Interview]]
```

The embedded Markdown is still rendered through the portable Markdown renderer, and placeholder values are inserted as escaped literal text. Parameter values cannot contain `|`, because that character separates embed parts.

Custom visualization fences render as portable local components. For example, a job tracker can include a no-dependency Sankey diagram:

````markdown
```datahoarder-sankey
Applied -> Interview: 12
Interview -> Offer: 3
Applied -> Rejected: 4
```
````

Compact metric grids use the same portable fence approach and accept either pipe rows or `Label: Value` rows:

````markdown
```datahoarder-metrics
Applications | 42 | This week | good
Response rate: 18% | warning
Median reply | 3 days | Waiting on portfolio note | info
```
````

Metric tones are `neutral`, `good`, `warning`, `bad`, and `info`; note text is escaped before rendering.

Datahoarder board files provide code-operable local canvases in `*.dhboard.json`, `*.dhboard.yaml`, or `*.dhboard.yml` files. Nodes can link back to notes, edges connect node ids, and board files export as standalone HTML:

```json
{
  "title": "Launch Board",
  "nodes": [
    {
      "id": "idea",
      "title": "Idea",
      "text": "Sketch the launch flow.",
      "note": "Ideas/Launch.md",
      "x": 40,
      "y": 60,
      "color": "green"
    }
  ],
  "edges": [
    { "from": "idea", "to": "ship", "label": "next" }
  ]
}
```

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
  status:
    type: enum
    options: [Applied, Interview, Offer]
  applied: date
  rating: number
  weight: number
  score:
    formula: rating * weight
  summary:
    formula: "{company} / {status}"

summaries:
  - name: Total
    type: count
  - name: By Status
    type: countBy
    field: status
  - name: Average Rating
    type: average
    field: rating
  - name: Score Sum
    type: sum
    field: score

views:
  - name: Applications
    type: table
  - name: Pipeline
    type: kanban
    groupBy: status
    filter: Interview
    sortBy: rating
    sortDirection: desc
  - name: Work Log
    type: timeline
    dateField: applied
```

Source paths are resolved relative to the collection file first, with vault-root paths still accepted as a fallback. Selecting the collection file in the local shell renders matching Markdown notes as a sortable, filterable table, grouped kanban board, or chronological timeline, with tabs for switching between configured views. Views can carry reusable filter and sort presets with `filter`, `sortBy`, and `sortDirection`; `query`/`search` aliases are also accepted for filters, and compact `sort: field desc` is accepted for sorting. Collection filters use the shared query syntax, so `status:Interview #jobs` works in both a collection view and the global vault search. Sort presets affect table rows and kanban card order, while timeline views stay chronological by `dateField`. Editable collection cells open inline controls based on schema type: `enum` fields with `options` use a menu, `date` fields use date inputs, `number` fields use numeric inputs, and other editable fields use text inputs. `Bulk Set Field` applies an inline field value to the currently visible filtered records. The Markdown files remain the source of truth; Datahoarder rebuilds the in-memory vault index from local files.

Collection summaries recompute from the currently visible records and support `count`, `countBy`, `sum`, and `average`.

Formula fields recompute per record whenever the vault index refreshes. Numeric formulas support simple arithmetic over identifier-style fields, such as `rating * weight`, while string templates can reference fields with braces, such as `{company} / {status}`. Formula columns are read-only in collection cells and exports include their derived values.

Collection columns and match rules can read fields from YAML frontmatter or line-level Markdown fields:

```markdown
company:: Acme Labs
role:: Research Engineer
status:: Applied
```

Repeated inline fields become arrays, frontmatter wins on key collisions, and fenced code blocks are ignored.

## Package Boundary

This repo follows the Svelte library template shape:

- `src/lib` is the public package surface for `@vaie/datahoarder`.
- `src/routes` is the hosted shell/demo app.
- `deno task prepack` runs `svelte-package`, generating the publishable `dist` package.
- `deno task build` builds the hosted shell and then regenerates the publishable package output.

The private notes project supplies a vault config and literal `import.meta.glob` calls, while this package owns note tree construction, route helpers, markdown preprocessing, `.base` parsing, shared note UI, and the browser-local File System Access shell.
