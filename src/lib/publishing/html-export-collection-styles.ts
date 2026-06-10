export const standaloneHtmlCollectionCss = `
.datahoarder-board {
	display: grid;
	gap: 0.55rem;
}

.datahoarder-board figcaption {
	color: #1e293b;
	font-size: 0.9rem;
	font-weight: 700;
}

.datahoarder-board-canvas {
	display: block;
	width: 100%;
	height: auto;
	min-height: 18rem;
	max-height: 42rem;
	background: #f8fafc;
	border: 1px solid #cbd5e1;
	border-radius: 0.35rem;
}

.datahoarder-board-edges {
	pointer-events: none;
}

.datahoarder-board-edges marker path {
	fill: #2563eb;
}

.datahoarder-board-edge path {
	fill: none;
	stroke: #2563eb;
	stroke-width: 2.5;
	stroke-linecap: round;
	stroke-opacity: 0.58;
	marker-end: url(#datahoarder-board-arrow);
}

.datahoarder-board-edge text {
	fill: #334155;
	font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
	font-size: 0.75rem;
	font-weight: 700;
	paint-order: stroke;
	stroke: #f8fafc;
	stroke-width: 4;
}

.datahoarder-board-node-shell {
	overflow: visible;
}

.datahoarder-board-node {
	display: grid;
	align-content: start;
	gap: 0.35rem;
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	min-width: 7rem;
	padding: 0.55rem 0.65rem;
	overflow: hidden;
	background: white;
	border: 1px solid #cbd5e1;
	border-left: 4px solid #64748b;
	border-radius: 0.35rem;
	box-shadow: 0 0.45rem 1rem rgb(15 23 42 / 0.12);
}

.datahoarder-board-node h3,
.datahoarder-board-node p {
	margin: 0;
	min-width: 0;
	overflow-wrap: anywhere;
}

.datahoarder-board-node h3 {
	font-size: 0.92rem;
	line-height: 1.15;
}

.datahoarder-board-node h3 a {
	color: #0f766e;
	text-decoration-thickness: 1px;
	text-underline-offset: 0.16em;
}

.datahoarder-board-node p {
	color: #334155;
	font-size: 0.78rem;
	white-space: pre-wrap;
}

.datahoarder-board-node-blue {
	border-left-color: #0ea5e9;
}

.datahoarder-board-node-green {
	border-left-color: #10b981;
}

.datahoarder-board-node-yellow {
	border-left-color: #f59e0b;
}

.datahoarder-board-node-red {
	border-left-color: #ef4444;
}

.datahoarder-board-node-purple {
	border-left-color: #8b5cf6;
}

.datahoarder-board-empty {
	color: #475569;
	font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
	font-size: 0.78rem;
}

.collection-summary-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
	gap: 0.75rem;
}

.collection-summary {
	display: grid;
	gap: 0.45rem;
	padding: 0.75rem;
	background: white;
	border: 1px solid #cbd5e1;
	border-radius: 0.35rem;
}

.collection-summary > span {
	color: #475569;
	font-size: 0.75rem;
	font-weight: 700;
	text-transform: uppercase;
}

.collection-summary > strong {
	color: #0f172a;
	font-size: 1.35rem;
	line-height: 1.1;
}

.collection-summary ul {
	display: grid;
	gap: 0.25rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.collection-summary li {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
	color: #475569;
	font-size: 0.84rem;
}

table {
	width: 100%;
	border-collapse: collapse;
	background: white;
}

th,
td {
	padding: 0.55rem 0.65rem;
	text-align: left;
	vertical-align: top;
	border: 1px solid #cbd5e1;
}

th {
	background: #e2e8f0;
}

.kanban-board {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
	gap: 1rem;
	align-items: start;
}

.kanban-lane {
	display: grid;
	gap: 0.65rem;
	padding: 0.75rem;
	background: #f1f5f9;
	border: 1px solid #cbd5e1;
	border-radius: 0.35rem;
}

.kanban-lane > h2,
.kanban-lane > p,
.kanban-card h2,
.kanban-card ul {
	margin: 0;
}

.kanban-lane > p {
	color: #475569;
	font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
	font-size: 0.78rem;
}

.kanban-card {
	display: grid;
	gap: 0.55rem;
	padding: 0.75rem;
	background: white;
	border: 1px solid #cbd5e1;
	border-radius: 0.35rem;
}

.kanban-card h2 {
	font-size: 1rem;
	line-height: 1.2;
}

.kanban-card ul {
	display: grid;
	gap: 0.35rem;
	padding: 0;
	list-style: none;
}

.kanban-card li {
	display: grid;
	gap: 0.1rem;
}

.kanban-card li span {
	color: #475569;
	font-size: 0.75rem;
	text-transform: uppercase;
}

.kanban-card li strong {
	font-weight: 600;
}

.timeline-list {
	display: grid;
	gap: 0.8rem;
}

.timeline-item {
	display: grid;
	grid-template-columns: minmax(7rem, 11rem) minmax(0, 1fr);
	gap: 0.8rem;
	align-items: start;
}

.timeline-item time {
	color: #475569;
	font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
	font-size: 0.78rem;
	font-weight: 700;
}

.timeline-card {
	display: grid;
	gap: 0.55rem;
	padding: 0.75rem;
	background: white;
	border: 1px solid #cbd5e1;
	border-radius: 0.35rem;
}

.timeline-card h2,
.timeline-card ul {
	margin: 0;
}

.timeline-card h2 {
	font-size: 1rem;
	line-height: 1.2;
}

.timeline-card ul {
	display: grid;
	gap: 0.35rem;
	padding: 0;
	list-style: none;
}

.timeline-card li {
	display: grid;
	gap: 0.1rem;
}

.timeline-card li span {
	color: #475569;
	font-size: 0.75rem;
	text-transform: uppercase;
}

.timeline-card li strong {
	font-weight: 600;
}

@media (max-width: 42rem) {
	.timeline-item {
		grid-template-columns: 1fr;
		gap: 0.35rem;
	}
}
`.trim();
