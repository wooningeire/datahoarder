import {
	formatCollectionRecordValue,
	getCollectionTimelineItems,
	getCollectionViewDateField,
	getCollectionViewGroupBy,
	groupCollectionRecordsForKanban,
	type CollectionSummaryResult,
	type CollectionView
} from '../collections/index.js';
import type { VaultRecord } from '../vault/index.js';

export type StandaloneHtmlDocumentOptions = {
	bodyHtml: string;
	sourcePath?: string;
	subtitle?: string;
	title: string;
};

export function createStandaloneHtmlDocument({
	bodyHtml,
	sourcePath = '',
	subtitle = 'Datahoarder export',
	title
}: StandaloneHtmlDocumentOptions) {
	return [
		'<!doctype html>',
		'<html lang="en">',
		'<head>',
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<title>${escapeHtml(title)}</title>`,
		`<style lang="scss">${standaloneHtmlCss}</style>`,
		'</head>',
		'<body>',
		'<main>',
		'<header>',
		`<p>${escapeHtml(subtitle)}</p>`,
		`<h1>${escapeHtml(title)}</h1>`,
		sourcePath ? `<span>${escapeHtml(sourcePath)}</span>` : '',
		'</header>',
		`<article>${bodyHtml}</article>`,
		'</main>',
		'</body>',
		'</html>'
	].filter(Boolean).join('\n');
}

export function renderCollectionTableHtml(records: VaultRecord[], columns: string[]) {
	const headerHtml = columns.map((column) => `<th>${escapeHtml(getColumnLabel(column))}</th>`).join('');
	const bodyHtml = records.map((record) => {
		const cells = columns
			.map((column) => `<td>${escapeHtml(formatCollectionRecordValue(record, column))}</td>`)
			.join('');

		return `<tr>${cells}</tr>`;
	}).join('\n');

	return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

export function renderCollectionSummariesHtml(summaries: CollectionSummaryResult[]) {
	if (!summaries.length) {
		return '';
	}

	const summaryHtml = summaries.map((summary) => {
		const items = summary.items.map((item) => {
			return `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></li>`;
		}).join('');

		return [
			'<section class="collection-summary">',
			`<span>${escapeHtml(summary.label)}</span>`,
			`<strong>${escapeHtml(summary.value)}</strong>`,
			items ? `<ul>${items}</ul>` : '',
			'</section>'
		].filter(Boolean).join('');
	}).join('');

	return `<div class="collection-summary-grid">${summaryHtml}</div>`;
}

export function renderCollectionKanbanHtml(records: VaultRecord[], columns: string[], view: CollectionView) {
	const groupBy = getCollectionViewGroupBy(view);
	const displayColumns = columns.filter((column) => !['title', groupBy].includes(column.toLowerCase()));
	const lanes = groupCollectionRecordsForKanban(records, groupBy).map((group) => {
		const cards = group.records.map((record) => {
			const fields = displayColumns.map((column) => {
				const value = formatCollectionRecordValue(record, column);

				return value
					? `<li><span>${escapeHtml(getColumnLabel(column))}</span><strong>${escapeHtml(value)}</strong></li>`
					: '';
			}).filter(Boolean).join('');

			return [
				'<article class="kanban-card">',
				`<h2>${escapeHtml(formatCollectionRecordValue(record, 'title'))}</h2>`,
				fields ? `<ul>${fields}</ul>` : '',
				'</article>'
			].filter(Boolean).join('');
		}).join('\n');

		return [
			'<section class="kanban-lane">',
			`<h2>${escapeHtml(group.label)}</h2>`,
			`<p>${group.records.length} records</p>`,
			cards || '<p>No records.</p>',
			'</section>'
		].join('');
	}).join('\n');

	return `<div class="kanban-board">${lanes || '<p>No records.</p>'}</div>`;
}

export function renderCollectionTimelineHtml(records: VaultRecord[], columns: string[], view: CollectionView) {
	const dateField = getCollectionViewDateField(view);
	const skippedColumns = new Set(['title', dateField.toLowerCase()]);
	const displayColumns = columns.filter((column) => !skippedColumns.has(column.toLowerCase()));
	const items = getCollectionTimelineItems(records, dateField).map((item) => {
		const fields = displayColumns.map((column) => {
			const value = formatCollectionRecordValue(item.record, column);

			return value
				? `<li><span>${escapeHtml(getColumnLabel(column))}</span><strong>${escapeHtml(value)}</strong></li>`
				: '';
		}).filter(Boolean).join('');

		return [
			'<article class="timeline-item">',
			`<time>${escapeHtml(item.dateLabel)}</time>`,
			'<div class="timeline-card">',
			`<h2>${escapeHtml(formatCollectionRecordValue(item.record, 'title'))}</h2>`,
			fields ? `<ul>${fields}</ul>` : '',
			'</div>',
			'</article>'
		].filter(Boolean).join('');
	}).join('\n');

	return `<div class="timeline-list">${items || '<p>No records.</p>'}</div>`;
}

export function renderSourceHtml(content: string) {
	return `<pre>${escapeHtml(content)}</pre>`;
}

export function escapeHtml(text: string) {
	return text.replace(/[&<>"']/gu, (character) => {
		switch (character) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			case "'":
				return '&#39;';
			default:
				return character;
		}
	});
}

function getColumnLabel(column: string) {
	return column.replace(/[-_]+/gu, ' ').replace(/\b\w/gu, (character) => character.toUpperCase());
}

const standaloneHtmlCss = `
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
