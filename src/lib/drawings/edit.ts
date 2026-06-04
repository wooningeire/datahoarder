import type { ExcalidrawElement } from './preview.js';

export type ExcalidrawElementKind = 'arrow' | 'diamond' | 'ellipse' | 'rectangle' | 'text';

export type AddExcalidrawElementOptions = {
	kind?: string;
	text?: string;
};

export type AddExcalidrawElementResult = {
	content: string;
	elements: ExcalidrawElement[];
	kind: ExcalidrawElementKind;
};

type RawExcalidrawScene = {
	elements: ExcalidrawElement[];
	[key: string]: unknown;
};

type JsonRange = {
	end: number;
	start: number;
	text: string;
};

type Bounds = {
	maxX: number;
	minY: number;
};

const drawingHeadingPattern = /^#{1,2} Drawing\s*$/gmu;
const elementKinds = ['arrow', 'diamond', 'ellipse', 'rectangle', 'text'] as const;

export function addExcalidrawElement(
	content: string,
	options: AddExcalidrawElementOptions = {}
): AddExcalidrawElementResult {
	const kind = normalizeExcalidrawElementKind(options.kind);
	const sceneRange = getExcalidrawSceneJsonRange(content);

	if (!sceneRange) {
		throw new Error('Drawing JSON was not readable.');
	}

	const scene = parseRawExcalidrawScene(sceneRange.text);
	const elements = createExcalidrawElements(kind, options.text ?? '', scene.elements);
	const nextScene = {
		...scene,
		elements: [...scene.elements, ...elements]
	};
	const nextJson = JSON.stringify(nextScene, null, 2);

	return {
		content: `${content.slice(0, sceneRange.start)}${nextJson}${content.slice(sceneRange.end)}`,
		elements,
		kind
	};
}

export function normalizeExcalidrawElementKind(kind: string | undefined): ExcalidrawElementKind {
	const normalizedKind = kind?.trim().toLowerCase() ?? '';

	if (elementKinds.includes(normalizedKind as ExcalidrawElementKind)) {
		return normalizedKind as ExcalidrawElementKind;
	}

	if (!normalizedKind) {
		return 'text';
	}

	throw new Error('Element type must be text, rectangle, ellipse, diamond, or arrow.');
}

function getExcalidrawSceneJsonRange(content: string): JsonRange | null {
	const drawingMatch = drawingHeadingPattern.exec(content);
	drawingHeadingPattern.lastIndex = 0;

	if (!drawingMatch) {
		return null;
	}

	const drawingStart = drawingMatch.index + drawingMatch[0].length;
	const drawingSection = content.slice(drawingStart);
	const fencePattern = /```[^\r\n]*\r?\n([\s\S]*?)\r?\n```/gu;

	for (const match of drawingSection.matchAll(fencePattern)) {
		const jsonText = match[1].trim();

		if (!jsonText.startsWith('{') || !jsonText.endsWith('}')) {
			continue;
		}

		const rawFenceContent = match[1];
		const leadingWhitespaceLength = rawFenceContent.length - rawFenceContent.trimStart().length;
		const trailingWhitespaceLength = rawFenceContent.length - rawFenceContent.trimEnd().length;
		const localContentStart = (match.index ?? 0) + match[0].indexOf(rawFenceContent) + leadingWhitespaceLength;
		const localContentEnd = localContentStart + rawFenceContent.length - leadingWhitespaceLength - trailingWhitespaceLength;

		return {
			start: drawingStart + localContentStart,
			end: drawingStart + localContentEnd,
			text: jsonText
		};
	}

	const objectStart = drawingSection.indexOf('{');
	const objectEnd = drawingSection.lastIndexOf('}');

	if (objectStart < 0 || objectEnd <= objectStart) {
		return null;
	}

	return {
		start: drawingStart + objectStart,
		end: drawingStart + objectEnd + 1,
		text: drawingSection.slice(objectStart, objectEnd + 1)
	};
}

function parseRawExcalidrawScene(jsonText: string): RawExcalidrawScene {
	const parsed = JSON.parse(jsonText) as Partial<RawExcalidrawScene>;

	if (!Array.isArray(parsed.elements)) {
		throw new Error('Drawing JSON does not contain an elements array.');
	}

	return {
		...parsed,
		elements: parsed.elements.filter(isObjectElement)
	};
}

function createExcalidrawElements(
	kind: ExcalidrawElementKind,
	text: string,
	existingElements: ExcalidrawElement[]
) {
	const label = text.trim();
	const bounds = getInsertionBounds(existingElements);
	const x = round(bounds.maxX + 48);
	const y = round(bounds.minY);

	if (kind === 'text') {
		return [createTextElement(existingElements, label || 'New text', x, y)];
	}

	if (kind === 'arrow') {
		const arrow = createBaseElement(existingElements, 'arrow', label || 'arrow', {
			x,
			y: y + 48,
			width: 180,
			height: 0,
			strokeColor: '#0369a1',
			backgroundColor: 'transparent',
			points: [
				[0, 0],
				[180, 0]
			]
		});

		return label ? [arrow, createTextElement(existingElements, label, x + 40, y + 6, 'arrow-label')] : [arrow];
	}

	const shape = createBaseElement(existingElements, kind, label || kind, {
		x,
		y,
		width: 210,
		height: 110,
		strokeColor: '#374151',
		backgroundColor: getShapeFillColor(kind),
		fillStyle: 'solid'
	});

	return label ? [shape, createTextElement(existingElements, label, x + 24, y + 36, `${kind}-label`)] : [shape];
}

function createBaseElement(
	existingElements: ExcalidrawElement[],
	type: ExcalidrawElementKind,
	label: string,
	overrides: ExcalidrawElement
): ExcalidrawElement {
	return {
		id: createElementId(existingElements, type, label),
		type,
		angle: 0,
		strokeWidth: 2,
		roughness: 1,
		opacity: 100,
		isDeleted: false,
		...overrides
	};
}

function createTextElement(
	existingElements: ExcalidrawElement[],
	text: string,
	x: number,
	y: number,
	idLabel = 'text'
): ExcalidrawElement {
	const lines = text.split(/\r?\n/u);
	const width = clamp(Math.max(...lines.map((line) => line.length), 4) * 13, 90, 420);

	return createBaseElement(existingElements, 'text', `${idLabel}-${text}`, {
		x,
		y,
		width,
		height: lines.length * 34,
		strokeColor: '#111827',
		backgroundColor: 'transparent',
		fontSize: 24,
		text
	});
}

function createElementId(existingElements: ExcalidrawElement[], kind: string, label: string) {
	const existingIds = new Set(existingElements.map((element) => element.id).filter(Boolean));
	const slug = slugifyLabel(label);
	let candidate = `datahoarder-${kind}-${existingElements.length + 1}-${slug}`;
	let suffix = 2;

	while (existingIds.has(candidate)) {
		candidate = `datahoarder-${kind}-${existingElements.length + suffix}-${slug}`;
		suffix += 1;
	}

	return candidate;
}

function getInsertionBounds(elements: ExcalidrawElement[]): Bounds {
	const visibleElements = elements.filter((element) => !element.isDeleted);

	if (!visibleElements.length) {
		return { maxX: 20, minY: 40 };
	}

	return visibleElements.reduce(
		(bounds, element) => {
			const x = element.x ?? 0;
			const y = element.y ?? 40;
			const pointMaxX = (element.points ?? []).reduce(
				(maxX, [pointX]) => Math.max(maxX, x + pointX),
				x + Math.abs(element.width ?? 0)
			);

			return {
				maxX: Math.max(bounds.maxX, pointMaxX),
				minY: Math.min(bounds.minY, y)
			};
		},
		{ maxX: -Infinity, minY: Infinity }
	);
}

function getShapeFillColor(kind: ExcalidrawElementKind) {
	switch (kind) {
		case 'diamond':
			return '#ede9fe';
		case 'ellipse':
			return '#dcfce7';
		case 'rectangle':
			return '#fef3c7';
		default:
			return 'transparent';
	}
}

function isObjectElement(element: unknown): element is ExcalidrawElement {
	return Boolean(element) && typeof element === 'object';
}

function slugifyLabel(label: string) {
	const slug = label
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');

	return slug || 'element';
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function round(value: number) {
	return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}
