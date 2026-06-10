export const standaloneHtmlBaseCss = `
:root {
	color-scheme: light;
	font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	line-height: 1.5;
	color: #1f2937;
	background: #f8fafc;
}

body {
	margin: 0;
}

main {
	box-sizing: border-box;
	width: min(100%, 70rem);
	margin: 0 auto;
	padding: 2rem clamp(1rem, 4vw, 3rem);
}

header {
	display: grid;
	gap: 0.35rem;
	margin-bottom: 1.5rem;
	padding-bottom: 1rem;
	border-bottom: 1px solid #cbd5e1;
}

header p,
header h1 {
	margin: 0;
}

header p,
header span {
	color: #475569;
	font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
	font-size: 0.8rem;
}

h1 {
	font-size: clamp(1.75rem, 5vw, 2.75rem);
	line-height: 1.08;
}

article {
	display: grid;
	gap: 0.9rem;
}

article :is(h1, h2, h3, p, ul, ol, blockquote, pre, .note-embed, .markdown-table-wrapper, .whiteboard-preview-svg, .datahoarder-board, .datahoarder-metrics) {
	margin: 0;
}

article p {
	white-space: pre-wrap;
}

.markdown-blank-line {
	min-height: 0;
}

pre {
	max-width: 100%;
	overflow: auto;
	padding: 0.75rem;
	background: #e2e8f0;
	border-radius: 0.35rem;
	white-space: pre-wrap;
}

blockquote {
	padding-left: 0.75rem;
	color: #475569;
	border-left: 3px solid #38bdf8;
}

.markdown-table-wrapper {
	max-width: 100%;
	overflow: auto;
	border: 1px solid #cbd5e1;
	border-radius: 0.35rem;
}

.markdown-table {
	border: 0;
}

.markdown-table [data-align="center"] {
	text-align: center;
}

.markdown-table [data-align="right"] {
	text-align: right;
}

.math-display,
.math-inline {
	max-width: 100%;
	overflow-x: auto;
	overflow-y: hidden;
}

.math-display {
	display: block;
	margin: 1rem 0;
	text-align: center;
}

.math-inline {
	display: inline-block;
	vertical-align: middle;
}

.task-list-item {
	display: flex;
	gap: 0.45rem;
	align-items: flex-start;
	list-style: none;
}

.task-list-item input {
	flex: 0 0 auto;
	width: 1rem;
	height: 1rem;
	margin: 0.22rem 0 0;
	accent-color: #0ea5e9;
}

.task-list-item span {
	min-width: 0;
}

.note-embed {
	display: grid;
	gap: 0.65rem;
	padding: 0.75rem;
	background: #fefce8;
	border: 1px solid #fde68a;
	border-left: 4px solid #10b981;
	border-radius: 0.35rem;
}

.note-embed header {
	margin: 0;
	padding: 0;
	border: 0;
}

.note-embed header a {
	color: #047857;
	font-size: 0.82rem;
	font-weight: 700;
	text-decoration: none;
}

.note-embed-body {
	display: grid;
	gap: 0.65rem;
}

.note-embed-missing {
	color: #7f1d1d;
	background: #fff7ed;
	border-left-color: #fb923c;
}

.excalidraw-preview-svg,
.whiteboard-preview-svg {
	width: 100%;
	max-height: 42rem;
	background: white;
	border: 1px solid #cbd5e1;
	border-radius: 0.35rem;
}

.datahoarder-sankey {
	display: grid;
	gap: 0.45rem;
	margin: 0;
	padding: 0.75rem;
	background: white;
	border: 1px solid #cbd5e1;
	border-radius: 0.35rem;
}

.datahoarder-sankey-svg {
	width: 100%;
	height: auto;
	min-height: 14rem;
}

.datahoarder-sankey-link {
	stroke: #0ea5e9;
	stroke-linecap: round;
	stroke-opacity: 0.34;
}

.datahoarder-sankey-link-1 {
	stroke: #10b981;
}

.datahoarder-sankey-link-2 {
	stroke: #f59e0b;
}

.datahoarder-sankey-link-3 {
	stroke: #ef4444;
}

.datahoarder-sankey-link-4 {
	stroke: #8b5cf6;
}

.datahoarder-sankey-link-5 {
	stroke: #14b8a6;
}

.datahoarder-sankey-link-6 {
	stroke: #ec4899;
}

.datahoarder-sankey-link-7 {
	stroke: #64748b;
}

.datahoarder-sankey-node rect {
	fill: #334155;
}

.datahoarder-sankey-label {
	fill: #0f172a;
	font-size: 0.82rem;
	font-weight: 700;
}

.datahoarder-sankey-value {
	fill: #475569;
	font-size: 0.72rem;
}

.datahoarder-sankey figcaption,
.datahoarder-sankey-empty {
	color: #475569;
	font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
	font-size: 0.78rem;
}

.datahoarder-metrics {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
	gap: 0.6rem;
}

.datahoarder-metric {
	display: grid;
	gap: 0.35rem;
	min-width: 0;
	padding: 0.75rem;
	background: white;
	border: 1px solid #cbd5e1;
	border-left: 4px solid #64748b;
	border-radius: 0.35rem;
}

.datahoarder-metric-label {
	color: #475569;
	font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	overflow-wrap: anywhere;
}

.datahoarder-metric-value {
	color: #0f172a;
	font-size: 1.35rem;
	line-height: 1.1;
	overflow-wrap: anywhere;
}

.datahoarder-metric-detail {
	color: #334155;
	font-size: 0.82rem;
	overflow-wrap: anywhere;
}

.datahoarder-metric-good {
	border-left-color: #10b981;
}

.datahoarder-metric-warning {
	border-left-color: #f59e0b;
}

.datahoarder-metric-bad {
	border-left-color: #ef4444;
}

.datahoarder-metric-info {
	border-left-color: #0ea5e9;
}

.datahoarder-metrics-empty {
	color: #475569;
	font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
	font-size: 0.78rem;
}
`.trim();
