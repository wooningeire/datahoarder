import { getRawPreview } from './raw-notes.js';

export type ExcalidrawScene = {
	elements: ExcalidrawElement[];
};

export type ExcalidrawNoteDraft = {
	content: string;
	title: string;
};

export type ExcalidrawElement = {
	angle?: number;
	backgroundColor?: string;
	fillStyle?: string;
	fontSize?: number;
	height?: number;
	id?: string;
	isDeleted?: boolean;
	opacity?: number;
	points?: [number, number][];
	roughness?: number;
	strokeColor?: string;
	strokeWidth?: number;
	text?: string;
	type?: string;
	width?: number;
	x?: number;
	y?: number;
};

type Bounds = {
	maxX: number;
	maxY: number;
	minX: number;
	minY: number;
};

const drawingHeadingPattern = /^#{1,2} Drawing\s*$/gmu;
const defaultStrokeColor = '#1f2937';
const defaultBackgroundColor = 'transparent';

export function createExcalidrawNoteDraft(title: string): ExcalidrawNoteDraft {
	const normalizedTitle = title.trim() || 'Untitled Drawing';
	const slug = slugifyTitle(normalizedTitle);
	const scene = {
		type: 'excalidraw',
		version: 2,
		source: 'datahoarder',
		elements: [
			{
				id: `${slug}-frame`,
				type: 'rectangle',
				x: 20,
				y: 40,
				width: 340,
				height: 180,
				angle: 0,
				strokeColor: '#1f2937',
				backgroundColor: '#dbeafe',
				fillStyle: 'solid',
				strokeWidth: 2,
				roughness: 1,
				opacity: 100,
				isDeleted: false
			},
			{
				id: `${slug}-title`,
				type: 'text',
				x: 48,
				y: 82,
				width: 280,
				height: 40,
				angle: 0,
				strokeColor: '#111827',
				backgroundColor: 'transparent',
				fontSize: 28,
				opacity: 100,
				text: normalizedTitle,
				isDeleted: false
			},
			{
				id: `${slug}-arrow`,
				type: 'arrow',
				x: 360,
				y: 130,
				width: 110,
				height: 24,
				angle: 0,
				strokeColor: '#0369a1',
				backgroundColor: 'transparent',
				strokeWidth: 2,
				roughness: 1,
				opacity: 100,
				points: [
					[0, 0],
					[110, 24]
				],
				isDeleted: false
			}
		],
		appState: {
			viewBackgroundColor: '#ffffff'
		},
		files: {}
	};
	const content = [
		'---',
		'excalidraw-plugin: parsed',
		'tags: [drawing]',
		'---',
		`# ${normalizedTitle}`,
		'',
		'## Drawing',
		'```json',
		JSON.stringify(scene, null, 2),
		'```',
		''
	].join('\n');

	return {
		content,
		title: normalizedTitle
	};
}

export function renderExcalidrawNotePreview(content: string) {
	const scene = parseExcalidrawScene(content);
	const notePreview = getRawPreview(content);
	const previewHtml = notePreview && notePreview !== 'Excalidraw drawing'
		? `<pre>${escapeHtml(notePreview)}</pre>`
		: '';

	if (!scene) {
		return `${previewHtml}<p>Excalidraw drawing data was not readable.</p>`;
	}

	return `${previewHtml}${renderExcalidrawSvg(scene)}`;
}

export function parseExcalidrawScene(content: string): ExcalidrawScene | null {
	const drawingSection = getDrawingSection(content);

	if (!drawingSection) {
		return null;
	}

	const jsonText = getJsonFenceContent(drawingSection) ?? getJsonObjectText(drawingSection);

	if (!jsonText) {
		return null;
	}

	try {
		const parsed = JSON.parse(jsonText) as Partial<ExcalidrawScene>;

		if (!Array.isArray(parsed.elements)) {
			return null;
		}

		return {
			elements: parsed.elements.filter(isRenderableElement)
		};
	} catch {
		return null;
	}
}

export function renderExcalidrawSvg(scene: ExcalidrawScene) {
	const elements = scene.elements.filter((element) => !isDeletedElement(element) && isSupportedElement(element));

	if (!elements.length) {
		return '<p>Excalidraw drawing has no supported visible elements.</p>';
	}

	const bounds = getSceneBounds(elements);
	const padding = 24;
	const viewBox = [
		round(bounds.minX - padding),
		round(bounds.minY - padding),
		round(bounds.maxX - bounds.minX + padding * 2),
		round(bounds.maxY - bounds.minY + padding * 2)
	].join(' ');
	const markerId = 'datahoarder-excalidraw-arrowhead';
	const body = elements.map((element) => renderElement(element, markerId)).filter(Boolean).join('\n');

	return [
		`<svg class="excalidraw-preview-svg" viewBox="${viewBox}" role="img" aria-label="Excalidraw drawing preview" xmlns="http://www.w3.org/2000/svg">`,
		'<defs>',
		`<marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`,
		'<path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"></path>',
		'</marker>',
		'</defs>',
		body,
		'</svg>'
	].join('\n');
}

function getDrawingSection(content: string) {
	const match = drawingHeadingPattern.exec(content);
	drawingHeadingPattern.lastIndex = 0;

	return match ? content.slice(match.index + match[0].length) : '';
}

function getJsonFenceContent(content: string) {
	for (const match of content.matchAll(/```[^\r\n]*\r?\n([\s\S]*?)\r?\n```/gu)) {
		const candidate = match[1].trim();

		if (candidate.startsWith('{') && candidate.endsWith('}')) {
			return candidate;
		}
	}

	return null;
}

function getJsonObjectText(content: string) {
	const startIndex = content.indexOf('{');
	const endIndex = content.lastIndexOf('}');

	return startIndex >= 0 && endIndex > startIndex ? content.slice(startIndex, endIndex + 1) : null;
}

function renderElement(element: ExcalidrawElement, markerId: string) {
	const type = element.type ?? '';
	const x = element.x ?? 0;
	const y = element.y ?? 0;
	const width = element.width ?? 0;
	const height = element.height ?? 0;
	const stroke = sanitizeColor(element.strokeColor, defaultStrokeColor);
	const fill = sanitizeColor(element.backgroundColor, defaultBackgroundColor);
	const strokeWidth = Math.max(1, element.strokeWidth ?? 1.5);
	const opacity = clamp((element.opacity ?? 100) / 100, 0, 1);
	const commonAttributes = [
		`stroke="${escapeAttribute(stroke)}"`,
		`stroke-width="${round(strokeWidth)}"`,
		`fill="${escapeAttribute(fill)}"`,
		`opacity="${round(opacity)}"`,
		getTransform(element)
	].filter(Boolean).join(' ');

	switch (type) {
		case 'rectangle':
			return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="8" ${commonAttributes}></rect>`;
		case 'diamond':
			return `<polygon points="${getDiamondPoints(x, y, width, height)}" ${commonAttributes}></polygon>`;
		case 'ellipse':
			return `<ellipse cx="${round(x + width / 2)}" cy="${round(y + height / 2)}" rx="${round(Math.abs(width / 2))}" ry="${round(Math.abs(height / 2))}" ${commonAttributes}></ellipse>`;
		case 'arrow':
		case 'line':
			return renderLineElement(element, markerId, commonAttributes, type === 'arrow');
		case 'freedraw':
			return renderLineElement(element, markerId, commonAttributes, false);
		case 'text':
			return renderTextElement(element, stroke, opacity);
		default:
			return '';
	}
}

function renderLineElement(
	element: ExcalidrawElement,
	markerId: string,
	commonAttributes: string,
	withArrow: boolean
) {
	const points = getAbsolutePoints(element);

	if (points.length < 2) {
		return '';
	}

	const marker = withArrow ? ` marker-end="url(#${markerId})"` : '';

	return `<polyline points="${points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')}" ${commonAttributes} fill="none"${marker}></polyline>`;
}

function renderTextElement(element: ExcalidrawElement, color: string, opacity: number) {
	const x = element.x ?? 0;
	const y = element.y ?? 0;
	const fontSize = element.fontSize ?? 20;
	const lines = (element.text ?? '').split(/\r?\n/u);
	const transform = getTransform(element);
	const textAttributes = [
		`x="${round(x)}"`,
		`y="${round(y + fontSize)}"`,
		`fill="${escapeAttribute(color)}"`,
		`font-size="${round(fontSize)}"`,
		'font-family="Virgil, Segoe Print, Comic Sans MS, cursive"',
		`opacity="${round(opacity)}"`,
		transform
	].filter(Boolean).join(' ');
	const tspans = lines.map((line, index) => {
		const dy = index === 0 ? 0 : fontSize * 1.2;

		return `<tspan x="${round(x)}" dy="${round(dy)}">${escapeHtml(line)}</tspan>`;
	}).join('');

	return `<text ${textAttributes}>${tspans}</text>`;
}

function getSceneBounds(elements: ExcalidrawElement[]): Bounds {
	const bounds = elements.map(getElementBounds).reduce(
		(current, next) => ({
			maxX: Math.max(current.maxX, next.maxX),
			maxY: Math.max(current.maxY, next.maxY),
			minX: Math.min(current.minX, next.minX),
			minY: Math.min(current.minY, next.minY)
		}),
		{ maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity }
	);

	if (!Number.isFinite(bounds.minX)) {
		return { maxX: 100, maxY: 100, minX: 0, minY: 0 };
	}

	return bounds;
}

function getElementBounds(element: ExcalidrawElement): Bounds {
	const points = getAbsolutePoints(element);

	if (points.length) {
		return points.reduce(
			(bounds, [x, y]) => ({
				maxX: Math.max(bounds.maxX, x),
				maxY: Math.max(bounds.maxY, y),
				minX: Math.min(bounds.minX, x),
				minY: Math.min(bounds.minY, y)
			}),
			{ maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity }
		);
	}

	const x = element.x ?? 0;
	const y = element.y ?? 0;
	const width = Math.max(1, Math.abs(element.width ?? 0));
	const height = Math.max(1, Math.abs(element.height ?? 0));

	return {
		maxX: x + width,
		maxY: y + height,
		minX: x,
		minY: y
	};
}

function getAbsolutePoints(element: ExcalidrawElement) {
	const originX = element.x ?? 0;
	const originY = element.y ?? 0;
	const points = element.points ?? [];

	return points.map(([x, y]) => [originX + x, originY + y] satisfies [number, number]);
}

function getDiamondPoints(x: number, y: number, width: number, height: number) {
	return [
		[x + width / 2, y],
		[x + width, y + height / 2],
		[x + width / 2, y + height],
		[x, y + height / 2]
	].map(([pointX, pointY]) => `${round(pointX)},${round(pointY)}`).join(' ');
}

function getTransform(element: ExcalidrawElement) {
	const angle = element.angle ?? 0;

	if (!angle) {
		return '';
	}

	const centerX = (element.x ?? 0) + (element.width ?? 0) / 2;
	const centerY = (element.y ?? 0) + (element.height ?? 0) / 2;

	return `transform="rotate(${round((angle * 180) / Math.PI)} ${round(centerX)} ${round(centerY)})"`;
}

function isRenderableElement(element: unknown): element is ExcalidrawElement {
	return Boolean(element) && typeof element === 'object';
}

function isSupportedElement(element: ExcalidrawElement) {
	return ['arrow', 'diamond', 'ellipse', 'freedraw', 'line', 'rectangle', 'text'].includes(element.type ?? '');
}

function isDeletedElement(element: ExcalidrawElement) {
	return 'isDeleted' in element && Boolean((element as ExcalidrawElement & { isDeleted?: boolean }).isDeleted);
}

function sanitizeColor(color: string | undefined, fallback: string) {
	if (!color || color === 'transparent') {
		return color === 'transparent' ? 'none' : fallback;
	}

	if (/^#[0-9a-f]{3,8}$/iu.test(color) || /^[a-z]+$/iu.test(color)) {
		return color;
	}

	return fallback;
}

function slugifyTitle(title: string) {
	const slug = title
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');

	return slug || 'drawing';
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function round(value: number) {
	return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
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
