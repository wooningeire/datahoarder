# Datahoarder

Reusable note-viewing and local-vault tooling for SvelteKit notes apps, plus the hosted/local Datahoarder shell.

## Run the Shell

Deno is the command surface:

```powershell
cd C:\Users\V\_\dev\datahoarder
deno task dev
```

To pass Vite flags through Deno, append them directly, for example `deno task dev --port 5191`.

Open the URL Vite prints, then choose your notes folder, usually `C:\Users\V\_\obsidian\obsidian\src\lib\notes`.

The shell intentionally previews portable markdown, `.base` files, and Datahoarder board files only. Custom Svelte execution stays in the private notes SvelteKit project.

Available project commands live in `deno.json`; `package.json` is package metadata, not the command surface.

The local shell can search the full opened vault, use a `Ctrl`/`Cmd` + `K` command palette to jump to notes or run common actions, save reusable global searches as vault files, create notes, create notes from local templates, create starter Excalidraw drawing notes, append simple Excalidraw canvas elements, update inline note fields, add collection fields, edit inline-backed collection cells, rename or move files, delete files, preview common Excalidraw scenes as static SVG, export notes/views as standalone HTML, publish a static public subset, export collection views as CSV/JSON, and keep browser-local pinned/recent note lists for quick retrieval.

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

Search boxes, saved searches, collection view filters, and publish profile queries share the same compact query syntax. Plain words are ANDed, quoted values keep spaces together, `#tag` or `tag:value` matches tags, `field:value` checks a note field, `field=value` checks an exact value, `field:*` requires a value, and `-term` excludes matches:

```text
#portfolio status:ready company:"Acme Labs" -draft
```

`Publish Public` regenerates standalone HTML files under `public/` for notes marked with `public:: true`, `published:: true`, `publish:: true`, `share:: public`, or a `#public`/`#published` tag. Public wiki links are rewritten to relative HTML links when the target note is also public.

Named publish profiles live in `*.dhpublish.json`, `*.dhpublish.yaml`, or `*.dhpublish.yml` files and appear in the publish profile menu. A profile selector is an explicit publish decision and can target files, folders, tags, fields, or a shared `query`; add `requirePublic: true` when a profile should also require the legacy public marker.

```yaml
name: Portfolio
outputDirectory: public/portfolio
query: "#portfolio status:ready"
source:
  match:
    publish:
      includes: portfolio
```

Profile output directories are written independently, so `public/portfolio` and `public/roadmap` can be regenerated from the same vault without sharing index pages.

Markdown previews can toggle task-list checkboxes back into the local Markdown source, while HTML exports and public pages render task lists as disabled static checkboxes. Pipe-style Markdown tables render with header alignment in previews, exports, and public pages. Previews and exports also support reusable note embeds with Obsidian-style syntax such as `![[Reusable Note]]`, `![[Reusable Note#Section]]`, and `![[Reusable Note|Alias]]`. Embeds strip frontmatter, stop recursive loops, and public publishing only embeds targets that are part of the public subset.

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

Datahoarder board files provide code-operable local canvases in `*.dhboard.json`, `*.dhboard.yaml`, or `*.dhboard.yml` files. Nodes can link back to notes, edges connect node ids, and public board files export as standalone HTML with links only to other published notes:

```json
{
  "title": "Launch Board",
  "public": true,
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
