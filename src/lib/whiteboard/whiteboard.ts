import type { Component } from 'svelte';

export type WhiteboardPoint = {
	x: number;
	y: number;
};

export type WhiteboardViewport = {
	x: number;
	y: number;
	scale: number;
};

export type WhiteboardTool =
	| 'select'
	| 'pan'
	| 'text'
	| 'rectangle'
	| 'ellipse'
	| 'diamond'
	| 'pen';

export type WhiteboardBaseItem = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation?: number;
	zIndex?: number;
	locked?: boolean;
	title?: string;
};

export type WhiteboardTextItem = WhiteboardBaseItem & {
	kind: 'text';
	text: string;
	color?: string;
	background?: string;
};

export type WhiteboardShapeKind = 'rectangle' | 'ellipse' | 'diamond';

export type WhiteboardShapeItem = WhiteboardBaseItem & {
	kind: 'shape';
	shape: WhiteboardShapeKind;
	label?: string;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
};

export type WhiteboardDrawingItem = WhiteboardBaseItem & {
	kind: 'drawing';
	points: WhiteboardPoint[];
	stroke?: string;
	strokeWidth?: number;
};

export type WhiteboardComponentItem = WhiteboardBaseItem & {
	kind: 'component';
	component: Component<Record<string, unknown>>;
	props?: Record<string, unknown>;
	overflow?: 'hidden' | 'visible' | 'auto';
};

export type WhiteboardItem =
	| WhiteboardTextItem
	| WhiteboardShapeItem
	| WhiteboardDrawingItem
	| WhiteboardComponentItem;

export function createWhiteboardItemId(prefix = 'whiteboard-item') {
	if (globalThis.crypto?.randomUUID) {
		return `${prefix}-${globalThis.crypto.randomUUID()}`;
	}

	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
