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

export function renderFenceBlock(info: string, content: string) {
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

		const match = trimmedLine.match(/^(.+?)\s*(?:->|=>|â†’)\s*(.+?)(?:\s*:\s*|\s*,\s*)(\d+(?:\.\d+)?)$/u);

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
