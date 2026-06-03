import { getDirectoryPath, joinRouteBase, stripCompiledNoteExtension } from './paths.js';
import { stripFrontmatter } from './raw-notes.js';

export type PortableMarkdownOptions = {
	currentPath?: string;
	interactiveTaskLists?: boolean;
	maxEmbedDepth?: number;
	notePaths?: string[];
	resolveEmbedContent?: (notePath: string) => string | null | undefined;
	resolveNoteHref?: (notePath: string, heading: string) => string;
	routeBase?: string;
	_embedDepth?: number;
	_embedStack?: string[];
};

type LinkLookup = {
	byName: Map<string, string[]>;
	byPath: Map<string, string>;
};

type RenderedLink = {
	embedParameters: Record<string, string>;
	heading?: string;
	href: string;
	notePath?: string;
};

type MarkdownTableAlignment = 'center' | 'left' | 'right' | '';

type RenderedMarkdownTable = {
	html: string;
	nextLineIndex: number;
};

export function renderPortableMarkdown(content: string, options: PortableMarkdownOptions = {}) {
	const body = stripFrontmatter(content).trim();
	const lines = body.split(/\r?\n/u);
	const html: string[] = [];
	let inFence = false;
	let fenceInfo = '';
	let fenceLines: string[] = [];
	let paragraphLines: string[] = [];
	let listItems: string[] = [];
	let orderedListItems: string[] = [];
	let taskListIndex = 0;

	function flushParagraph() {
		if (!paragraphLines.length) {
			return;
		}

		html.push(`<p>${renderInline(paragraphLines.join(' '), options)}</p>`);
		paragraphLines = [];
	}

	function flushList() {
		if (listItems.length) {
			html.push(`<ul>${listItems.join('')}</ul>`);
			listItems = [];
		}

		if (orderedListItems.length) {
			html.push(`<ol>${orderedListItems.map((item) => `<li>${item}</li>`).join('')}</ol>`);
			orderedListItems = [];
		}
	}

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		const fenceMatch = line.match(/^\s*```([^\r\n]*)$/u);

		if (fenceMatch) {
			if (inFence) {
				html.push(renderFenceBlock(fenceInfo, fenceLines.join('\n')));
				fenceInfo = '';
				fenceLines = [];
				inFence = false;
			} else {
				flushParagraph();
				flushList();
				fenceInfo = fenceMatch[1].trim();
				inFence = true;
			}

			continue;
		}

		if (inFence) {
			fenceLines.push(line);
			continue;
		}

		if (!line.trim()) {
			flushParagraph();
			flushList();
			continue;
		}

		const table = parseMarkdownTable(lines, lineIndex, options);

		if (table) {
			flushParagraph();
			flushList();
			html.push(table.html);
			lineIndex = table.nextLineIndex;
			continue;
		}

		const heading = line.match(/^(#{1,6})\s+(.+)$/u);

		if (heading) {
			flushParagraph();
			flushList();
			const level = heading[1].length;
			html.push(`<h${level}>${renderInline(heading[2], options)}</h${level}>`);
			continue;
		}

		if (/^\s*[-*_]{3,}\s*$/u.test(line)) {
			flushParagraph();
			flushList();
			html.push('<hr>');
			continue;
		}

		const unorderedItem = line.match(/^\s*[-*]\s+(.+)$/u);

		if (unorderedItem) {
			flushParagraph();
			orderedListItems = [];
			const renderedItem = renderUnorderedListItem(unorderedItem[1], options, taskListIndex);
			listItems.push(renderedItem.html);
			taskListIndex += renderedItem.task ? 1 : 0;
			continue;
		}

		const orderedItem = line.match(/^\s*\d+\.\s+(.+)$/u);

		if (orderedItem) {
			flushParagraph();
			listItems = [];
			orderedListItems.push(renderInline(orderedItem[1], options));
			continue;
		}

		const quote = line.match(/^\s*>\s?(.+)$/u);

		if (quote) {
			flushParagraph();
			flushList();
			html.push(`<blockquote>${renderInline(quote[1], options)}</blockquote>`);
			continue;
		}

		const embed = line.match(/^\s*!\[\[([^\]]+)\]\]\s*$/u);

		if (embed) {
			flushParagraph();
			flushList();
			html.push(renderEmbedBlock(embed[1], options));
			continue;
		}

		paragraphLines.push(line.trim());
	}

	if (inFence) {
		html.push(renderFenceBlock(fenceInfo, fenceLines.join('\n')));
	}

	flushParagraph();
	flushList();

	return html.join('\n');
}

function parseMarkdownTable(
	lines: string[],
	startIndex: number,
	options: PortableMarkdownOptions
): RenderedMarkdownTable | null {
	const headerCells = parseMarkdownTableRow(lines[startIndex]);
	const separatorCells = parseMarkdownTableRow(lines[startIndex + 1] ?? '');

	if (!headerCells || !separatorCells || headerCells.length < 2 || !isMarkdownTableSeparator(separatorCells)) {
		return null;
	}

	const columnCount = headerCells.length;
	const alignments = separatorCells.slice(0, columnCount).map(getMarkdownTableAlignment);
	const bodyRows: string[][] = [];
	let lineIndex = startIndex + 2;

	while (lineIndex < lines.length) {
		const rowCells = parseMarkdownTableRow(lines[lineIndex]);

		if (!rowCells) {
			break;
		}

		bodyRows.push(normalizeMarkdownTableCells(rowCells, columnCount));
		lineIndex += 1;
	}

	const headerHtml = normalizeMarkdownTableCells(headerCells, columnCount)
		.map((cell, index) => renderMarkdownTableCell('th', cell, alignments[index] ?? '', options))
		.join('');
	const bodyHtml = bodyRows.map((row) => {
		const cells = row
			.map((cell, index) => renderMarkdownTableCell('td', cell, alignments[index] ?? '', options))
			.join('');

		return `<tr>${cells}</tr>`;
	}).join('');

	return {
		html: [
			'<div class="markdown-table-wrapper">',
			'<table class="markdown-table">',
			`<thead><tr>${headerHtml}</tr></thead>`,
			`<tbody>${bodyHtml}</tbody>`,
			'</table>',
			'</div>'
		].join(''),
		nextLineIndex: lineIndex - 1
	};
}

function parseMarkdownTableRow(line: string) {
	if (!line.includes('|')) {
		return null;
	}

	const trimmedLine = line.trim();
	const content = trimmedLine.startsWith('|') && trimmedLine.endsWith('|')
		? trimmedLine.slice(1, -1)
		: trimmedLine;
	const cells: string[] = [];
	let currentCell = '';
	let inCode = false;
	let escaping = false;

	for (const character of content) {
		if (escaping) {
			currentCell += character;
			escaping = false;
			continue;
		}

		if (character === '\\') {
			escaping = true;
			continue;
		}

		if (character === '`') {
			inCode = !inCode;
			currentCell += character;
			continue;
		}

		if (character === '|' && !inCode) {
			cells.push(currentCell.trim());
			currentCell = '';
			continue;
		}

		currentCell += character;
	}

	if (escaping) {
		currentCell += '\\';
	}

	cells.push(currentCell.trim());

	return cells;
}

function isMarkdownTableSeparator(cells: string[]) {
	return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.replace(/\s+/gu, '')));
}

function getMarkdownTableAlignment(cell: string): MarkdownTableAlignment {
	const normalizedCell = cell.replace(/\s+/gu, '');
	const left = normalizedCell.startsWith(':');
	const right = normalizedCell.endsWith(':');

	if (left && right) {
		return 'center';
	}

	if (right) {
		return 'right';
	}

	if (left) {
		return 'left';
	}

	return '';
}

function normalizeMarkdownTableCells(cells: string[], columnCount: number) {
	return Array.from({ length: columnCount }, (_item, index) => cells[index] ?? '');
}

function renderMarkdownTableCell(
	tagName: 'td' | 'th',
	content: string,
	alignment: MarkdownTableAlignment,
	options: PortableMarkdownOptions
) {
	const alignmentAttribute = alignment ? ` data-align="${alignment}"` : '';

	return `<${tagName}${alignmentAttribute}>${renderInline(content, options)}</${tagName}>`;
}

function renderUnorderedListItem(content: string, options: PortableMarkdownOptions, taskIndex: number) {
	const taskItem = content.match(/^\[([ xX])\]\s+(.+)$/u);

	if (taskItem) {
		const checked = taskItem[1].toLowerCase() === 'x';
		const checkboxAttributes = options.interactiveTaskLists
			? ` data-task-index="${taskIndex}"`
			: ' disabled';

		return {
			html: [
				'<li class="task-list-item">',
				`<input type="checkbox"${checkboxAttributes}${checked ? ' checked' : ''}>`,
				` <span>${renderInline(taskItem[2], options)}</span>`,
				'</li>'
			].join(''),
			task: true
		};
	}

	return {
		html: `<li>${renderInline(content, options)}</li>`,
		task: false
	};
}

type SankeyFlow = {
	order: number;
	source: string;
	target: string;
	value: number;
};

type SankeyNode = {
	incoming: number;
	layer: number;
	name: string;
	order: number;
	outgoing: number;
	x: number;
	y: number;
};

const metricTones = ['neutral', 'good', 'warning', 'bad', 'info'] as const;

type MetricTone = (typeof metricTones)[number];

type MetricItem = {
	detail: string;
	label: string;
	tone: MetricTone;
	value: string;
};

const maxSankeyFlows = 80;
const maxSankeyLabelLength = 80;
const maxSankeyNodes = 60;
const maxMetricItems = 24;
const maxMetricLabelLength = 120;
const maxMetricValueLength = 80;
const maxMetricDetailLength = 180;

function renderFenceBlock(info: string, content: string) {
	if (isSankeyFence(info)) {
		return renderSankeyBlock(content);
	}

	if (isMetricFence(info)) {
		return renderMetricGridBlock(content);
	}

	return `<pre><code>${escapeHtml(content)}</code></pre>`;
}

function isSankeyFence(info: string) {
	const language = info.trim().split(/\s+/u)[0]?.toLowerCase() ?? '';

	return ['datahoarder-sankey', 'dh-sankey', 'sankey'].includes(language);
}

function isMetricFence(info: string) {
	const language = info.trim().split(/\s+/u)[0]?.toLowerCase() ?? '';

	return [
		'datahoarder-metrics',
		'dh-metrics',
		'metrics',
		'datahoarder-stat-grid',
		'dh-stats',
		'stats'
	].includes(language);
}

function renderMetricGridBlock(content: string) {
	const metrics = parseMetricItems(content);

	if (!metrics.length) {
		return '<section class="datahoarder-metrics datahoarder-metrics-empty" aria-label="Metric grid"><p>No metrics found.</p></section>';
	}

	return [
		`<section class="datahoarder-metrics" aria-label="${escapeAttribute(`${metrics.length} metrics`)}">`,
		metrics.map(renderMetricItem).join(''),
		'</section>'
	].join('');
}

function parseMetricItems(content: string): MetricItem[] {
	const metrics: MetricItem[] = [];

	for (const line of content.split(/\r?\n/u)) {
		if (metrics.length >= maxMetricItems) {
			break;
		}

		const trimmedLine = line.trim();

		if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
			continue;
		}

		const metric = parseMetricLine(trimmedLine);

		if (metric) {
			metrics.push(metric);
		}
	}

	return metrics;
}

function parseMetricLine(line: string): MetricItem | null {
	const parts = line.split('|');
	const colonIndex = parts[0].indexOf(':');

	if (parts.length >= 3) {
		return parseMetricParts(parts[0], parts.slice(1));
	}

	if (colonIndex > 0) {
		return parseMetricParts(parts[0].slice(0, colonIndex), [
			parts[0].slice(colonIndex + 1),
			...parts.slice(1)
		]);
	}

	if (parts.length < 2) {
		return null;
	}

	return parseMetricParts(parts[0], parts.slice(1));
}

function parseMetricParts(rawLabel: string, rawParts: string[]): MetricItem | null {
	const label = normalizeMetricText(rawLabel, maxMetricLabelLength);
	const value = normalizeMetricText(rawParts[0] ?? '', maxMetricValueLength);

	if (!label || !value) {
		return null;
	}

	const extras = rawParts.slice(1).map((part) => part.trim()).filter(Boolean);
	const possibleTone = normalizeMetricTone(extras.at(-1) ?? '');
	const tone = possibleTone ?? 'neutral';
	const detailParts = possibleTone ? extras.slice(0, -1) : extras;
	const detail = normalizeMetricText(detailParts.join(' | '), maxMetricDetailLength);

	return {
		detail,
		label,
		tone,
		value
	};
}

function normalizeMetricText(value: string, maxLength: number) {
	return value.trim().replace(/\s+/gu, ' ').slice(0, maxLength);
}

function normalizeMetricTone(value: string): MetricTone | null {
	const normalizedValue = value.trim().toLowerCase();

	return metricTones.includes(normalizedValue as MetricTone) ? normalizedValue as MetricTone : null;
}

function renderMetricItem(metric: MetricItem) {
	return [
		`<article class="datahoarder-metric datahoarder-metric-${metric.tone}" aria-label="${escapeAttribute(`${metric.label}: ${metric.value}`)}">`,
		`<span class="datahoarder-metric-label">${escapeHtml(metric.label)}</span>`,
		`<strong class="datahoarder-metric-value">${escapeHtml(metric.value)}</strong>`,
		metric.detail ? `<p class="datahoarder-metric-detail">${escapeHtml(metric.detail)}</p>` : '',
		'</article>'
	].join('');
}

function renderSankeyBlock(content: string) {
	const flows = parseSankeyFlows(content);

	if (!flows.length) {
		return '<figure class="datahoarder-sankey datahoarder-sankey-empty"><p>No Sankey flows found.</p></figure>';
	}

	const nodes = layoutSankeyNodes(flows);
	const maxValue = Math.max(...flows.map((flow) => flow.value));
	const layerCount = Math.max(...nodes.map((node) => node.layer)) + 1;
	const largestLayerSize = Math.max(
		1,
		...Array.from({ length: layerCount }, (_item, layer) => nodes.filter((node) => node.layer === layer).length)
	);
	const width = 760;
	const height = Math.max(240, 100 + largestLayerSize * 74);
	const links = flows.map((flow, index) => renderSankeyLink(flow, nodes, maxValue, index)).join('');
	const nodeHtml = nodes.map(renderSankeyNode).join('');
	const totalValue = flows.reduce((total, flow) => total + flow.value, 0);
	const summary = `${flows.length} flows across ${nodes.length} nodes, total ${formatSankeyValue(totalValue)}.`;

	return [
		'<figure class="datahoarder-sankey">',
		`<svg class="datahoarder-sankey-svg" role="img" aria-label="${escapeAttribute(summary)}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
		`<title>${escapeHtml(summary)}</title>`,
		'<g class="datahoarder-sankey-links">',
		links,
		'</g>',
		'<g class="datahoarder-sankey-nodes">',
		nodeHtml,
		'</g>',
		'</svg>',
		`<figcaption>${escapeHtml(summary)}</figcaption>`,
		'</figure>'
	].join('');
}

function parseSankeyFlows(content: string): SankeyFlow[] {
	const flows: SankeyFlow[] = [];
	const nodeNames = new Set<string>();

	for (const line of content.split(/\r?\n/u)) {
		if (flows.length >= maxSankeyFlows) {
			break;
		}

		const trimmedLine = line.trim();

		if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
			continue;
		}

		const match = trimmedLine.match(/^(.+?)\s*(?:->|=>|→)\s*(.+?)(?:\s*:\s*|\s*,\s*)(\d+(?:\.\d+)?)$/u);

		if (!match) {
			continue;
		}

		const source = normalizeSankeyLabel(match[1]);
		const target = normalizeSankeyLabel(match[2]);
		const value = Number(match[3]);

		if (!source || !target || !Number.isFinite(value) || value <= 0) {
			continue;
		}

		const newNodeCount = Number(!nodeNames.has(source)) + Number(!nodeNames.has(target));

		if (nodeNames.size + newNodeCount > maxSankeyNodes) {
			continue;
		}

		nodeNames.add(source);
		nodeNames.add(target);
		flows.push({
			order: flows.length,
			source,
			target,
			value
		});
	}

	return flows;
}

function normalizeSankeyLabel(label: string) {
	return label.trim().replace(/\s+/gu, ' ').slice(0, maxSankeyLabelLength);
}

function layoutSankeyNodes(flows: SankeyFlow[]) {
	const nodesByName = new Map<string, SankeyNode>();

	function getNode(name: string) {
		const existingNode = nodesByName.get(name);

		if (existingNode) {
			return existingNode;
		}

		const node: SankeyNode = {
			incoming: 0,
			layer: 0,
			name,
			order: nodesByName.size,
			outgoing: 0,
			x: 0,
			y: 0
		};

		nodesByName.set(name, node);

		return node;
	}

	for (const flow of flows) {
		const source = getNode(flow.source);
		const target = getNode(flow.target);

		source.outgoing += flow.value;
		target.incoming += flow.value;
	}

	const nodes = [...nodesByName.values()];
	const maxLayer = Math.max(1, nodes.length - 1);

	for (let pass = 0; pass < nodes.length; pass += 1) {
		let changed = false;

		for (const flow of flows) {
			const source = nodesByName.get(flow.source);
			const target = nodesByName.get(flow.target);

			if (!source || !target) {
				continue;
			}

			const nextLayer = Math.min(maxLayer, source.layer + 1);

			if (target.layer < nextLayer) {
				target.layer = nextLayer;
				changed = true;
			}
		}

		if (!changed) {
			break;
		}
	}

	const layerCount = Math.max(...nodes.map((node) => node.layer)) + 1;
	const width = 760;
	const largestLayerSize = Math.max(
		1,
		...Array.from({ length: layerCount }, (_item, layer) => nodes.filter((node) => node.layer === layer).length)
	);
	const height = Math.max(240, 100 + largestLayerSize * 74);

	for (let layer = 0; layer < layerCount; layer += 1) {
		const layerNodes = nodes
			.filter((node) => node.layer === layer)
			.sort((nodeA, nodeB) => nodeA.order - nodeB.order);
		const gap = height / (layerNodes.length + 1);

		for (let index = 0; index < layerNodes.length; index += 1) {
			layerNodes[index].x = 46 + (layerCount === 1 ? 0 : (layer / (layerCount - 1)) * (width - 92));
			layerNodes[index].y = gap * (index + 1);
		}
	}

	return nodes.sort((nodeA, nodeB) => nodeA.layer - nodeB.layer || nodeA.order - nodeB.order);
}

function renderSankeyLink(flow: SankeyFlow, nodes: SankeyNode[], maxValue: number, index: number) {
	const source = nodes.find((node) => node.name === flow.source);
	const target = nodes.find((node) => node.name === flow.target);

	if (!source || !target) {
		return '';
	}

	const sourceX = source.x + 12;
	const targetX = target.x - 12;
	const midX = sourceX + (targetX - sourceX) * 0.5;
	const strokeWidth = Math.max(3, Math.min(30, (flow.value / maxValue) * 30));
	const paletteIndex = index % 8;

	return [
		`<path class="datahoarder-sankey-link datahoarder-sankey-link-${paletteIndex}" d="M ${sourceX.toFixed(1)} ${source.y.toFixed(1)} C ${midX.toFixed(1)} ${source.y.toFixed(1)}, ${midX.toFixed(1)} ${target.y.toFixed(1)}, ${targetX.toFixed(1)} ${target.y.toFixed(1)}" fill="none" stroke-width="${strokeWidth.toFixed(2)}">`,
		`<title>${escapeHtml(`${flow.source} to ${flow.target}: ${formatSankeyValue(flow.value)}`)}</title>`,
		'</path>'
	].join('');
}

function renderSankeyNode(node: SankeyNode) {
	const total = Math.max(node.incoming, node.outgoing);
	const height = Math.max(28, Math.min(78, total * 8));
	const y = node.y - height / 2;
	const labelAnchor = node.layer === 0 ? 'start' : 'end';
	const labelX = node.layer === 0 ? node.x + 22 : node.x - 22;
	const valueY = node.y + 17;

	return [
		`<g class="datahoarder-sankey-node" transform="translate(${node.x.toFixed(1)} ${y.toFixed(1)})">`,
		`<rect width="16" height="${height.toFixed(1)}" rx="4"></rect>`,
		'</g>',
		`<text class="datahoarder-sankey-label" x="${labelX.toFixed(1)}" y="${(node.y - 3).toFixed(1)}" text-anchor="${labelAnchor}">${escapeHtml(node.name)}</text>`,
		`<text class="datahoarder-sankey-value" x="${labelX.toFixed(1)}" y="${valueY.toFixed(1)}" text-anchor="${labelAnchor}">${escapeHtml(formatSankeyValue(total))}</text>`
	].join('');
}

function formatSankeyValue(value: number) {
	return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, '').replace(/\.$/u, '');
}

function renderInline(text: string, options: PortableMarkdownOptions) {
	let rendered = escapeHtml(text);

	rendered = rendered.replace(/`([^`]+)`/gu, '<code>$1</code>');
	rendered = rendered.replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
	rendered = rendered.replace(/\*([^*]+)\*/gu, '<em>$1</em>');
	rendered = rendered.replace(/!\[([^\]]*)\]\(([^)]+)\)/gu, (_match, alt, src) => {
		const safeSrc = sanitizeMarkdownUrl(src, false);

		return safeSrc ? `<img alt="${escapeAttribute(alt)}" src="${escapeAttribute(safeSrc)}">` : alt;
	});
	rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/gu, (_match, label, href) => {
		const safeHref = sanitizeMarkdownUrl(href, true);

		return safeHref ? `<a href="${escapeAttribute(safeHref)}">${label}</a>` : label;
	});
	rendered = rendered.replace(/!\[\[([^\]]+)\]\]/gu, (_match, linkContent) => {
		const link = toObsidianLink(linkContent, options);

		if (!link) {
			return escapeHtml(linkContent);
		}

		return renderAnchor(escapeHtml(link.label), link);
	});
	rendered = rendered.replace(/\[\[([^\]]+)\]\]/gu, (_match, linkContent) => {
		const link = toObsidianLink(linkContent, options);

		if (!link) {
			return escapeHtml(linkContent);
		}

		return renderAnchor(escapeHtml(link.label), link);
	});

	return rendered;
}

function renderEmbedBlock(linkContent: string, options: PortableMarkdownOptions) {
	const link = toObsidianLink(linkContent, options);

	if (!link?.notePath || !options.resolveEmbedContent) {
		return renderMissingEmbed();
	}

	const maxEmbedDepth = options.maxEmbedDepth ?? 4;
	const embedDepth = options._embedDepth ?? 0;
	const embedKey = `${link.notePath}#${link.heading ?? ''}`.toLowerCase();
	const embedStack = options._embedStack ?? [];

	if (embedDepth >= maxEmbedDepth || embedStack.includes(embedKey)) {
		return renderMissingEmbed('Embed skipped to avoid a recursive loop.');
	}

	const embeddedContent = options.resolveEmbedContent(link.notePath);
	const embeddedBody = embeddedContent
		? getEmbeddedMarkdownBody(embeddedContent, link.heading ?? '')
		: '';

	if (!embeddedBody) {
		return renderMissingEmbed();
	}

	const bodyHtml = renderParameterizedEmbedMarkdown(embeddedBody, link.embedParameters, {
		...options,
		currentPath: link.notePath,
		interactiveTaskLists: false,
		_embedDepth: embedDepth + 1,
		_embedStack: [...embedStack, embedKey]
	});

	return [
		`<aside class="note-embed" data-note-path="${escapeAttribute(link.notePath)}">`,
		`<header>${renderAnchor(escapeHtml(link.label), link)}</header>`,
		`<div class="note-embed-body">${bodyHtml}</div>`,
		'</aside>'
	].join('');
}

function renderMissingEmbed(message = 'Embedded note unavailable.') {
	return `<aside class="note-embed note-embed-missing"><p>${escapeHtml(message)}</p></aside>`;
}

function renderAnchor(label: string, link: RenderedLink) {
	return `<a href="${escapeAttribute(link.href)}"${getNoteDataAttributes(link)}>${label}</a>`;
}

function getNoteDataAttributes(link: RenderedLink) {
	if (!link.notePath) {
		return '';
	}

	const headingAttribute = link.heading
		? ` data-note-heading="${escapeAttribute(link.heading)}"`
		: '';

	return ` data-note-path="${escapeAttribute(link.notePath)}"${headingAttribute}`;
}

function toObsidianLink(linkContent: string, options: PortableMarkdownOptions) {
	const parts = linkContent.split('|').map((part) => part.trim());
	const rawTarget = parts[0] ?? '';
	const { alias, parameters } = parseObsidianLinkParts(parts.slice(1));
	const headingIndex = rawTarget.indexOf('#');
	const targetPath = headingIndex >= 0 ? rawTarget.slice(0, headingIndex).trim() : rawTarget;
	const heading = headingIndex >= 0 ? rawTarget.slice(headingIndex + 1).trim() : '';
	const normalizedTarget = normalizeObsidianTargetPath(targetPath);
	const label = alias || getDefaultObsidianLabel(normalizedTarget, heading);

	if (!label) {
		return null;
	}

	if (/^(?:https?|mailto):/iu.test(targetPath)) {
		return {
			embedParameters: parameters,
			href: `${targetPath}${getObsidianHash(heading)}`,
			label
		};
	}

	const notePath = resolveObsidianNotePath(normalizedTarget, options);
	const routeBase = options.routeBase ?? '';
	const href = notePath
		? (options.resolveNoteHref?.(notePath, heading) ??
			`${joinRouteBase(routeBase, notePath)}${getObsidianHash(heading)}`)
		: '#';

	return {
		embedParameters: parameters,
		heading,
		href,
		label,
		notePath
	};
}

function parseObsidianLinkParts(parts: string[]) {
	const aliasParts: string[] = [];
	const parameters: Record<string, string> = {};

	for (const part of parts) {
		const parameter = parseEmbedParameter(part);

		if (parameter) {
			parameters[parameter.key] = parameter.value;
			continue;
		}

		if (part) {
			aliasParts.push(part);
		}
	}

	return {
		alias: aliasParts.join('|').trim(),
		parameters
	};
}

function parseEmbedParameter(value: string) {
	const separatorIndex = value.indexOf('=');

	if (separatorIndex <= 0) {
		return null;
	}

	const rawKey = value.slice(0, separatorIndex).trim();
	const key = normalizeEmbedParameterKey(rawKey);

	if (!key) {
		return null;
	}

	return {
		key,
		value: value.slice(separatorIndex + 1).trim()
	};
}

function renderParameterizedEmbedMarkdown(
	content: string,
	parameters: Record<string, string>,
	options: PortableMarkdownOptions
) {
	if (!Object.keys(parameters).length) {
		return renderPortableMarkdown(content, options);
	}

	const replacements = new Map<string, string>();
	let index = 0;
	const tokenizedContent = content.replace(/\{\{\s*([\w.-]+)\s*\}\}/gu, (match, key: string) => {
		const value = parameters[normalizeEmbedPlaceholderKey(key)];

		if (value === undefined) {
			return match;
		}

		const token = `datahoarder-embed-param-${index}:`;
		index += 1;
		replacements.set(token, value);

		return token;
	});
	let html = renderPortableMarkdown(tokenizedContent, options);

	return replaceEmbedParameterTokensInText(html, replacements);
}

function normalizeEmbedParameterKey(key: string) {
	return /^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(key) ? key.toLocaleLowerCase() : '';
}

function normalizeEmbedPlaceholderKey(key: string) {
	const normalizedKey = normalizeEmbedParameterKey(key);

	return normalizedKey.startsWith('embed.') ? normalizedKey.slice('embed.'.length) : normalizedKey;
}

function replaceEmbedParameterTokensInText(html: string, replacements: Map<string, string>) {
	let result = '';
	let inTag = false;

	for (let index = 0; index < html.length;) {
		const character = html[index];

		if (character === '<') {
			inTag = true;
			result += character;
			index += 1;
			continue;
		}

		if (character === '>') {
			inTag = false;
			result += character;
			index += 1;
			continue;
		}

		if (!inTag) {
			const replacement = getEmbedParameterTokenReplacement(html, index, replacements);

			if (replacement) {
				result += escapeHtml(replacement.value);
				index += replacement.token.length;
				continue;
			}
		}

		result += character;
		index += 1;
	}

	return result;
}

function getEmbedParameterTokenReplacement(
	html: string,
	index: number,
	replacements: Map<string, string>
) {
	for (const [token, value] of replacements) {
		if (html.startsWith(token, index)) {
			return { token, value };
		}
	}

	return null;
}

function resolveObsidianNotePath(targetPath: string, options: PortableMarkdownOptions) {
	if (!targetPath) {
		return options.currentPath ?? '';
	}

	const lookup = getLookup(options.notePaths ?? []);
	const targetKey = targetPath.toLowerCase();
	const currentDirectory = options.currentPath ? getDirectoryPath(options.currentPath) : '';

	if (!targetPath.includes('/') && currentDirectory) {
		const siblingMatch = lookup.byPath.get(`${currentDirectory}/${targetKey}`.toLowerCase());

		if (siblingMatch) {
			return siblingMatch;
		}
	}

	const directMatch = lookup.byPath.get(targetKey);

	if (directMatch) {
		return directMatch;
	}

	if (!targetPath.includes('/')) {
		const nameMatches = lookup.byName.get(targetKey) ?? [];
		const sameDirectoryMatch = nameMatches.find((notePath) => getDirectoryPath(notePath) === currentDirectory);

		return sameDirectoryMatch ?? nameMatches[0] ?? targetPath;
	}

	return targetPath;
}

function getLookup(notePaths: string[]): LinkLookup {
	const byPath = new Map<string, string>();
	const byName = new Map<string, string[]>();

	for (const notePath of notePaths) {
		const normalizedPath = stripCompiledNoteExtension(notePath).replace(/\\/gu, '/');
		byPath.set(normalizedPath.toLowerCase(), normalizedPath);

		const nameKey = normalizedPath.split('/').at(-1)?.toLowerCase();

		if (!nameKey) {
			continue;
		}

		const matches = byName.get(nameKey) ?? [];
		matches.push(normalizedPath);
		byName.set(nameKey, matches);
	}

	return { byName, byPath };
}

function getEmbeddedMarkdownBody(content: string, heading: string) {
	const body = stripFrontmatter(content).trim();

	if (!heading) {
		return body;
	}

	const lines = body.split(/\r?\n/u);
	const normalizedHeading = normalizeHeadingText(heading);
	let startIndex = -1;
	let headingLevel = 0;

	for (let index = 0; index < lines.length; index += 1) {
		const match = lines[index].match(/^(#{1,6})\s+(.+)$/u);

		if (!match || normalizeHeadingText(match[2]) !== normalizedHeading) {
			continue;
		}

		startIndex = index + 1;
		headingLevel = match[1].length;
		break;
	}

	if (startIndex < 0) {
		return '';
	}

	const endIndex = lines.findIndex((line, index) => {
		if (index < startIndex) {
			return false;
		}

		const match = line.match(/^(#{1,6})\s+/u);

		return Boolean(match && match[1].length <= headingLevel);
	});

	return lines.slice(startIndex, endIndex < 0 ? undefined : endIndex).join('\n').trim();
}

function normalizeHeadingText(text: string) {
	return text
		.replace(/[*_`]/gu, '')
		.replace(/\s+/gu, ' ')
		.trim()
		.toLowerCase();
}

function normalizeObsidianTargetPath(targetPath: string) {
	return targetPath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').replace(/\.(md|svx|svelte)$/u, '');
}

function getDefaultObsidianLabel(targetPath: string, heading: string) {
	if (targetPath) {
		return targetPath.split('/').at(-1) ?? targetPath;
	}

	return heading;
}

function getObsidianHash(heading: string) {
	return heading ? `#${encodeURIComponent(heading)}` : '';
}

function sanitizeMarkdownUrl(url: string, allowMailto: boolean) {
	const trimmedUrl = url.trim();

	if (!trimmedUrl) {
		return '';
	}

	const schemeMatch = trimmedUrl.match(/^([a-z][a-z0-9+.-]*):/iu);

	if (!schemeMatch) {
		return trimmedUrl;
	}

	const scheme = schemeMatch[1].toLowerCase();

	if (scheme === 'http' || scheme === 'https' || (allowMailto && scheme === 'mailto')) {
		return trimmedUrl;
	}

	return '';
}

function escapeHtml(text: string) {
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

function escapeAttribute(text: string) {
	return escapeHtml(text).replace(/`/gu, '&#96;');
}
