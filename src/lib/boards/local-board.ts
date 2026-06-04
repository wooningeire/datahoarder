import { getNoteTitle } from '../vault/paths.js';
import { parseSimpleYaml, type SimpleYamlValue } from '../shared/simple-yaml.js';

export type DatahoarderBoard = {
	edges: DatahoarderBoardEdge[];
	height: number;
	nodes: DatahoarderBoardNode[];
	properties: Record<string, SimpleYamlValue>;
	tags: string[];
	title: string;
	width: number;
};

export type DatahoarderBoardEdge = {
	from: string;
	label: string;
	to: string;
};

export type DatahoarderBoardNode = {
	color: BoardNodeColor;
	height: number;
	id: string;
	note: string;
	text: string;
	title: string;
	width: number;
	x: number;
	y: number;
};

export type RenderDatahoarderBoardOptions = {
	path?: string;
	resolveNoteHref?: (notePath: string, heading: string) => string;
};

const boardFilePattern = /\.dhboard\.(?:json|ya?ml)$/iu;
const boardNodeColors = ['neutral', 'blue', 'green', 'yellow', 'red', 'purple'] as const;
const maxBoardNodes = 80;
const maxBoardEdges = 120;
const maxBoardTextLength = 600;
const maxBoardTitleLength = 120;

export type BoardNodeColor = (typeof boardNodeColors)[number];

export function isDatahoarderBoardFile(path: string) {
	return boardFilePattern.test(path);
}

export function parseDatahoarderBoard(content: string, path = 'Board.dhboard.json'): DatahoarderBoard {
	const data = parseBoardData(content);
	const source = isRecord(data) ? data : {};
	const nodes = parseBoardNodes(source.nodes ?? source.cards ?? source.items);
	const edges = parseBoardEdges(source.edges ?? source.links ?? source.connections);
	const width = getBoardDimension(source.width, nodes, 'x', 'width', 900);
	const height = getBoardDimension(source.height, nodes, 'y', 'height', 560);
	const title = toTrimmedText(source.title ?? source.name, maxBoardTitleLength) || getBoardTitle(path);
	const properties = getBoardProperties(source);
	const tags = getBoardTags(source, properties);

	return {
		edges,
		height,
		nodes,
		properties,
		tags,
		title,
		width
	};
}

export function renderDatahoarderBoard(content: string, options: RenderDatahoarderBoardOptions = {}) {
	const board = parseDatahoarderBoard(content, options.path);

	if (!board.nodes.length) {
		return `<figure class="datahoarder-board datahoarder-board-empty"><figcaption>${escapeHtml(board.title)}</figcaption><p>No board nodes found.</p></figure>`;
	}

	const nodeLookup = new Map(board.nodes.map((node) => [node.id, node]));
	const edgeHtml = board.edges
		.map((edge, index) => renderBoardEdge(edge, nodeLookup, index))
		.filter(Boolean)
		.join('');
	const nodeHtml = board.nodes.map((node) => renderBoardNode(node, board, options)).join('');

	return [
		`<figure class="datahoarder-board" aria-label="${escapeAttribute(board.title)}">`,
		`<figcaption>${escapeHtml(board.title)}</figcaption>`,
		`<svg class="datahoarder-board-canvas" viewBox="0 0 ${board.width} ${board.height}" role="img" aria-label="${escapeAttribute(board.title)} board">`,
		'<defs><marker id="datahoarder-board-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>',
		'<g class="datahoarder-board-edges" aria-hidden="true">',
		edgeHtml,
		'</g>',
		nodeHtml,
		'</svg>',
		'</figure>'
	].join('');
}

export function getDatahoarderBoardPreview(board: DatahoarderBoard) {
	return board.nodes
		.flatMap((node) => [node.title, node.text])
		.map((value) => value.trim())
		.filter(Boolean)
		.join(' ')
		.replace(/\s+/gu, ' ')
		.slice(0, 240) || board.title;
}

export function getDatahoarderBoardLinks(board: DatahoarderBoard) {
	return board.nodes
		.filter((node) => node.note)
		.map((node) => ({
			label: node.title || node.note,
			target: node.note,
			type: 'board' as const
		}));
}

function parseBoardData(content: string): SimpleYamlValue {
	const trimmedContent = content.trim();

	if (!trimmedContent) {
		return {};
	}

	if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
		try {
			return JSON.parse(trimmedContent) as SimpleYamlValue;
		} catch {
			return {};
		}
	}

	return parseSimpleYaml(trimmedContent);
}

function parseBoardNodes(value: SimpleYamlValue | undefined): DatahoarderBoardNode[] {
	return toArray(value).slice(0, maxBoardNodes).map((item, index) => {
		const source = isRecord(item) ? item : {};
		const id = toIdentifier(source.id ?? source.key ?? source.name, `node-${index + 1}`);

		return {
			color: toBoardNodeColor(source.color ?? source.tone),
			height: toBoundedNumber(source.height ?? source.h, 96, 48, 420),
			id,
			note: toTrimmedText(source.note ?? source.path ?? source.href, maxBoardTitleLength),
			text: toTrimmedText(source.text ?? source.body ?? source.description, maxBoardTextLength),
			title: toTrimmedText(source.title ?? source.label ?? source.name ?? id, maxBoardTitleLength),
			width: toBoundedNumber(source.width ?? source.w, 190, 96, 520),
			x: toBoundedNumber(source.x, 40 + index * 36, 0, 4000),
			y: toBoundedNumber(source.y, 40 + index * 36, 0, 4000)
		};
	});
}

function parseBoardEdges(value: SimpleYamlValue | undefined): DatahoarderBoardEdge[] {
	return toArray(value).slice(0, maxBoardEdges).map((item) => {
		const source = isRecord(item) ? item : {};

		return {
			from: toTrimmedText(source.from ?? source.source, maxBoardTitleLength),
			label: toTrimmedText(source.label ?? source.text, maxBoardTitleLength),
			to: toTrimmedText(source.to ?? source.target, maxBoardTitleLength)
		};
	}).filter((edge) => edge.from && edge.to && edge.from !== edge.to);
}

function getBoardDimension(
	value: SimpleYamlValue | undefined,
	nodes: DatahoarderBoardNode[],
	axis: 'x' | 'y',
	size: 'width' | 'height',
	fallback: number
) {
	const extent = nodes.reduce((maximum, node) => Math.max(maximum, node[axis] + node[size] + 40), fallback);

	return toBoundedNumber(value, extent, 320, 4000);
}

function getBoardProperties(source: Record<string, SimpleYamlValue>) {
	const properties = isRecord(source.properties) ? { ...source.properties } : {};

	for (const key of ['public', 'published', 'publish', 'share', 'title']) {
		if (source[key] !== undefined) {
			properties[key] = source[key];
		}
	}

	return properties;
}

function getBoardTags(source: Record<string, SimpleYamlValue>, properties: Record<string, SimpleYamlValue>) {
	const tags = new Set<string>();

	for (const value of [...toStringList(source.tags ?? source.tag), ...toStringList(properties.tags ?? properties.tag)]) {
		const tag = value.trim().replace(/^#/u, '').toLowerCase();

		if (tag) {
			tags.add(tag);
		}
	}

	return [...tags].sort((tagA, tagB) => tagA.localeCompare(tagB));
}

function getBoardTitle(path: string) {
	return getNoteTitle(path).replace(/\.dhboard(?:\.(?:json|ya?ml))?$/iu, '');
}

function renderBoardEdge(edge: DatahoarderBoardEdge, nodeLookup: Map<string, DatahoarderBoardNode>, index: number) {
	const source = nodeLookup.get(edge.from);
	const target = nodeLookup.get(edge.to);

	if (!source || !target) {
		return '';
	}

	const sourceX = source.x + source.width / 2;
	const sourceY = source.y + source.height / 2;
	const targetX = target.x + target.width / 2;
	const targetY = target.y + target.height / 2;
	const labelX = sourceX + (targetX - sourceX) * 0.5;
	const labelY = sourceY + (targetY - sourceY) * 0.5;

	return [
		`<g class="datahoarder-board-edge datahoarder-board-edge-${index % 6}">`,
		`<path d="M ${sourceX.toFixed(1)} ${sourceY.toFixed(1)} L ${targetX.toFixed(1)} ${targetY.toFixed(1)}"></path>`,
		edge.label ? `<text x="${labelX.toFixed(1)}" y="${(labelY - 6).toFixed(1)}">${escapeHtml(edge.label)}</text>` : '',
		'</g>'
	].join('');
}

function renderBoardNode(
	node: DatahoarderBoardNode,
	board: DatahoarderBoard,
	options: RenderDatahoarderBoardOptions
) {
	const note = splitBoardNoteReference(node.note);
	const href = note ? options.resolveNoteHref?.(note.path, note.heading) ?? '' : '';
	const title = href
		? `<a href="${escapeAttribute(href)}" data-note-path="${escapeAttribute(note?.path ?? '')}"${note?.heading ? ` data-note-heading="${escapeAttribute(note.heading)}"` : ''}>${escapeHtml(node.title)}</a>`
		: escapeHtml(node.title);

	return [
		`<foreignObject class="datahoarder-board-node-shell" x="${round(node.x)}" y="${round(node.y)}" width="${round(node.width)}" height="${round(node.height)}">`,
		`<article xmlns="http://www.w3.org/1999/xhtml" class="datahoarder-board-node datahoarder-board-node-${node.color}">`,
		`<h3>${title}</h3>`,
		node.text ? `<p>${escapeHtml(node.text)}</p>` : '',
		'</article>',
		'</foreignObject>'
	].join('');
}

function splitBoardNoteReference(note: string) {
	const trimmedNote = note.trim();

	if (!trimmedNote) {
		return null;
	}

	const headingIndex = trimmedNote.indexOf('#');

	return {
		heading: headingIndex >= 0 ? trimmedNote.slice(headingIndex + 1).trim() : '',
		path: headingIndex >= 0 ? trimmedNote.slice(0, headingIndex).trim() : trimmedNote
	};
}

function toArray(value: SimpleYamlValue | undefined) {
	return Array.isArray(value) ? value : [];
}

function isRecord(value: SimpleYamlValue | undefined): value is Record<string, SimpleYamlValue> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toTrimmedText(value: SimpleYamlValue | undefined, maxLength: number) {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value).trim().replace(/\s+/gu, ' ').slice(0, maxLength);
	}

	return '';
}

function toIdentifier(value: SimpleYamlValue | undefined, fallback: string) {
	const text = toTrimmedText(value, maxBoardTitleLength);

	return text || fallback;
}

function toBoardNodeColor(value: SimpleYamlValue | undefined): BoardNodeColor {
	const text = toTrimmedText(value, 24).toLowerCase();

	return boardNodeColors.includes(text as BoardNodeColor) ? text as BoardNodeColor : 'neutral';
}

function toBoundedNumber(value: SimpleYamlValue | undefined, fallback: number, minimum: number, maximum: number) {
	const numberValue = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(numberValue)) {
		return fallback;
	}

	return Math.max(minimum, Math.min(maximum, numberValue));
}

function round(value: number) {
	return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

function toStringList(value: SimpleYamlValue | undefined): string[] {
	if (Array.isArray(value)) {
		return value.flatMap(toStringList);
	}

	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return [String(value)];
	}

	return [];
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
