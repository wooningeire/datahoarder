<script lang="ts">
import {
	createWhiteboardItemId,
	type WhiteboardDrawingItem,
	type WhiteboardItem,
	type WhiteboardPoint,
	type WhiteboardShapeKind,
	type WhiteboardTool,
	type WhiteboardViewport
} from './whiteboard.js';

const resizeDirections = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

type ResizeDirection = (typeof resizeDirections)[number];

type Interaction =
	| {
			kind: 'pan';
			pointerId: number;
			startX: number;
			startY: number;
			originX: number;
			originY: number;
	  }
	| {
			kind: 'move';
			pointerId: number;
			id: string;
			start: WhiteboardPoint;
			originX: number;
			originY: number;
	  }
	| {
			kind: 'resize';
			pointerId: number;
			id: string;
			direction: ResizeDirection;
			start: WhiteboardPoint;
			originX: number;
			originY: number;
			originWidth: number;
			originHeight: number;
	  }
	| {
			kind: 'draw';
			pointerId: number;
	  };

type DraftDrawing = {
	id: string;
	points: WhiteboardPoint[];
	stroke: string;
	strokeWidth: number;
};

type Props = {
	items?: WhiteboardItem[];
	viewport?: WhiteboardViewport;
	activeTool?: WhiteboardTool;
	ariaLabel?: string;
	minZoom?: number;
	maxZoom?: number;
	readonly?: boolean;
	showToolbar?: boolean;
	onchange?: (items: WhiteboardItem[]) => void;
	onselect?: (item: WhiteboardItem | null) => void;
};

let {
	items = $bindable<WhiteboardItem[]>([]),
	viewport = $bindable<WhiteboardViewport>({ x: 0, y: 0, scale: 1 }),
	activeTool = $bindable<WhiteboardTool>('select'),
	ariaLabel = 'Infinite whiteboard',
	minZoom = 0.15,
	maxZoom = 4,
	readonly = false,
	showToolbar = true,
	onchange,
	onselect
}: Props = $props();

const gridSize = 32;
const majorGridSize = 160;
const minItemSize = 48;
const defaultStroke = 'oklch(0.4 0.16 248)';

let viewportElement = $state<HTMLDivElement | null>(null);
let selectedId = $state<string | null>(null);
let interaction = $state<Interaction | null>(null);
let draftDrawing = $state<DraftDrawing | null>(null);

let selectedItem = $derived(items.find((item) => item.id === selectedId) ?? null);
let viewportStyle = $derived(
	[
		`--grid-size: ${Math.max(4, gridSize * viewport.scale)}px`,
		`--major-grid-size: ${Math.max(12, majorGridSize * viewport.scale)}px`,
		`--grid-x: ${viewport.x}px`,
		`--grid-y: ${viewport.y}px`,
		`--board-cursor: ${getCursor(activeTool)}`
	].join('; ')
);
let worldStyle = $derived(
	`transform: translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
);
let zoomPercent = $derived(`${Math.round(viewport.scale * 100)}%`);

function setItems(nextItems: WhiteboardItem[]) {
	items = nextItems;
	onchange?.(items);

	if (selectedId && !items.some((item) => item.id === selectedId)) {
		setSelected(null);
	}
}

function setSelected(id: string | null) {
	selectedId = id;
	onselect?.(items.find((item) => item.id === id) ?? null);
}

function updateItem(id: string, update: (item: WhiteboardItem) => WhiteboardItem) {
	setItems(items.map((item) => (item.id === id ? update(item) : item)));
}

function deleteSelected() {
	if (!selectedId || readonly) {
		return;
	}

	setItems(items.filter((item) => item.id !== selectedId));
}

function toWorldPoint(event: PointerEvent | WheelEvent): WhiteboardPoint {
	const rect = viewportElement?.getBoundingClientRect();

	if (!rect) {
		return { x: 0, y: 0 };
	}

	return {
		x: (event.clientX - rect.left - viewport.x) / viewport.scale,
		y: (event.clientY - rect.top - viewport.y) / viewport.scale
	};
}

function handleSurfacePointerDown(event: PointerEvent) {
	if (!viewportElement || event.button !== 0) {
		return;
	}

	viewportElement.focus({ preventScroll: true });
	viewportElement.setPointerCapture(event.pointerId);

	const point = toWorldPoint(event);

	if (activeTool === 'pen' && !readonly) {
		draftDrawing = {
			id: createWhiteboardItemId('drawing'),
			points: [point],
			stroke: defaultStroke,
			strokeWidth: 4
		};
		interaction = { kind: 'draw', pointerId: event.pointerId };
		event.preventDefault();
		return;
	}

	if (isShapeTool(activeTool) && !readonly) {
		addShape(activeTool, point);
		event.preventDefault();
		return;
	}

	if (activeTool === 'text' && !readonly) {
		addText(point);
		event.preventDefault();
		return;
	}

	setSelected(null);
	interaction = {
		kind: 'pan',
		pointerId: event.pointerId,
		startX: event.clientX,
		startY: event.clientY,
		originX: viewport.x,
		originY: viewport.y
	};
	event.preventDefault();
}

function handleItemPointerDown(event: PointerEvent, item: WhiteboardItem) {
	if (event.button !== 0 || activeTool !== 'select') {
		return;
	}

	const target = event.target as HTMLElement;

	if (target.closest('[contenteditable="true"]') || target.closest('.component-host')) {
		event.stopPropagation();
		setSelected(item.id);
		return;
	}

	if (target.closest('.item-controls')) {
		setSelected(item.id);
		return;
	}

	startItemMove(event, item);
}

function startItemMove(event: PointerEvent, item: WhiteboardItem) {
	event.stopPropagation();
	event.preventDefault();
	setSelected(item.id);

	if (readonly || item.locked || !viewportElement) {
		return;
	}

	viewportElement.setPointerCapture(event.pointerId);

	interaction = {
		kind: 'move',
		pointerId: event.pointerId,
		id: item.id,
		start: toWorldPoint(event),
		originX: item.x,
		originY: item.y
	};
}

function handleResizePointerDown(event: PointerEvent, item: WhiteboardItem, direction: ResizeDirection) {
	if (readonly || item.locked || !viewportElement || activeTool !== 'select') {
		return;
	}

	event.stopPropagation();
	event.preventDefault();
	setSelected(item.id);
	viewportElement.setPointerCapture(event.pointerId);
	interaction = {
		kind: 'resize',
		pointerId: event.pointerId,
		id: item.id,
		direction,
		start: toWorldPoint(event),
		originX: item.x,
		originY: item.y,
		originWidth: item.width,
		originHeight: item.height
	};
}

function handlePointerMove(event: PointerEvent) {
	const currentInteraction = interaction;

	if (!currentInteraction || currentInteraction.pointerId !== event.pointerId) {
		return;
	}

	if (currentInteraction.kind === 'pan') {
		viewport = {
			...viewport,
			x: currentInteraction.originX + event.clientX - currentInteraction.startX,
			y: currentInteraction.originY + event.clientY - currentInteraction.startY
		};
		return;
	}

	if (currentInteraction.kind === 'draw') {
		appendDraftPoint(toWorldPoint(event));
		return;
	}

	const point = toWorldPoint(event);

	if (currentInteraction.kind === 'move') {
		const dx = point.x - currentInteraction.start.x;
		const dy = point.y - currentInteraction.start.y;

		updateItem(currentInteraction.id, (item) => ({
			...item,
			x: currentInteraction.originX + dx,
			y: currentInteraction.originY + dy
		}));
		return;
	}

	if (currentInteraction.kind === 'resize') {
		const dx = point.x - currentInteraction.start.x;
		const dy = point.y - currentInteraction.start.y;

		updateItem(currentInteraction.id, (item) => ({
			...item,
			...resizeBox(currentInteraction, dx, dy)
		}));
	}
}

function handlePointerUp(event: PointerEvent) {
	if (!interaction || interaction.pointerId !== event.pointerId) {
		return;
	}

	if (interaction.kind === 'draw') {
		commitDraftDrawing();
	}

	viewportElement?.releasePointerCapture(event.pointerId);
	interaction = null;
}

function handleWheel(event: WheelEvent) {
	event.preventDefault();

	if (event.ctrlKey || event.metaKey) {
		const factor = Math.exp(-event.deltaY * 0.0014);
		zoomAt(event.clientX, event.clientY, viewport.scale * factor);
		return;
	}

	viewport = {
		...viewport,
		x: viewport.x - event.deltaX,
		y: viewport.y - event.deltaY
	};
}

function handleKeydown(event: KeyboardEvent) {
	const target = event.target as HTMLElement;

	if (target.closest('[contenteditable="true"]')) {
		return;
	}

	if (event.key === 'Delete' || event.key === 'Backspace') {
		deleteSelected();
		event.preventDefault();
		return;
	}

	if (event.key === 'Escape') {
		draftDrawing = null;
		interaction = null;
		activeTool = 'select';
		setSelected(null);
		event.preventDefault();
		return;
	}

	if (event.key === '0') {
		fitToItems();
		event.preventDefault();
		return;
	}

	const tool = keyToTool(event.key);

	if (tool) {
		activeTool = tool;
		event.preventDefault();
	}
}

function zoomAt(clientX: number, clientY: number, nextScale: number) {
	const rect = viewportElement?.getBoundingClientRect();

	if (!rect) {
		return;
	}

	const scale = clamp(nextScale, minZoom, maxZoom);
	const localX = clientX - rect.left;
	const localY = clientY - rect.top;
	const worldX = (localX - viewport.x) / viewport.scale;
	const worldY = (localY - viewport.y) / viewport.scale;

	viewport = {
		x: localX - worldX * scale,
		y: localY - worldY * scale,
		scale
	};
}

function zoomBy(factor: number) {
	const rect = viewportElement?.getBoundingClientRect();

	if (!rect) {
		viewport = { ...viewport, scale: clamp(viewport.scale * factor, minZoom, maxZoom) };
		return;
	}

	zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, viewport.scale * factor);
}

function fitToItems() {
	const rect = viewportElement?.getBoundingClientRect();

	if (!rect || items.length === 0) {
		viewport = { x: rect ? rect.width / 2 : 0, y: rect ? rect.height / 2 : 0, scale: 1 };
		return;
	}

	const bounds = getItemsBounds(items);
	const padding = 72;
	const scale = clamp(
		Math.min((rect.width - padding * 2) / bounds.width, (rect.height - padding * 2) / bounds.height),
		minZoom,
		maxZoom
	);

	viewport = {
		scale,
		x: rect.width / 2 - (bounds.x + bounds.width / 2) * scale,
		y: rect.height / 2 - (bounds.y + bounds.height / 2) * scale
	};
}

function addText(point: WhiteboardPoint) {
	const item: WhiteboardItem = {
		kind: 'text',
		id: createWhiteboardItemId('text'),
		x: point.x,
		y: point.y,
		width: 240,
		height: 116,
		text: 'New note',
		background: 'oklch(0.98 0.04 95)',
		color: 'oklch(0.24 0.04 260)'
	};

	setItems([...items, item]);
	setSelected(item.id);
	activeTool = 'select';
}

function addShape(shape: WhiteboardShapeKind, point: WhiteboardPoint) {
	const item: WhiteboardItem = {
		kind: 'shape',
		id: createWhiteboardItemId(shape),
		x: point.x,
		y: point.y,
		width: 180,
		height: 112,
		shape,
		label: 'Shape',
		fill: getShapeFill(shape),
		stroke: getShapeStroke(shape),
		strokeWidth: 2
	};

	setItems([...items, item]);
	setSelected(item.id);
	activeTool = 'select';
}

function appendDraftPoint(point: WhiteboardPoint) {
	if (!draftDrawing) {
		return;
	}

	const previous = draftDrawing.points.at(-1);

	if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 1.5) {
		return;
	}

	draftDrawing = {
		...draftDrawing,
		points: [...draftDrawing.points, point]
	};
}

function commitDraftDrawing() {
	if (!draftDrawing || draftDrawing.points.length < 2) {
		draftDrawing = null;
		return;
	}

	const item = normalizeDrawing(draftDrawing);

	if (item.points.length > 1) {
		setItems([...items, item]);
		setSelected(item.id);
	}

	draftDrawing = null;
	activeTool = 'select';
}

function normalizeDrawing(drawing: DraftDrawing): WhiteboardDrawingItem {
	const xs = drawing.points.map((point) => point.x);
	const ys = drawing.points.map((point) => point.y);
	const pad = drawing.strokeWidth / 2 + 4;
	const minX = Math.min(...xs) - pad;
	const minY = Math.min(...ys) - pad;
	const maxX = Math.max(...xs) + pad;
	const maxY = Math.max(...ys) + pad;

	return {
		kind: 'drawing',
		id: drawing.id,
		x: minX,
		y: minY,
		width: Math.max(1, maxX - minX),
		height: Math.max(1, maxY - minY),
		points: drawing.points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
		stroke: drawing.stroke,
		strokeWidth: drawing.strokeWidth
	};
}

function updateText(id: string, text: string) {
	updateItem(id, (item) => (item.kind === 'text' ? { ...item, text } : item));
}

function updateShapeLabel(id: string, label: string) {
	updateItem(id, (item) => (item.kind === 'shape' ? { ...item, label } : item));
}

function editableText(
	node: HTMLElement,
	params: { value: string; onchange: (value: string) => void }
) {
	let currentParams = params;

	function syncText(value: string) {
		if (document.activeElement === node || node.textContent === value) {
			return;
		}

		node.textContent = value;
	}

	function handleInput() {
		currentParams.onchange(node.textContent ?? '');
	}

	syncText(currentParams.value);
	node.addEventListener('input', handleInput);

	return {
		update(nextParams: { value: string; onchange: (value: string) => void }) {
			currentParams = nextParams;
			syncText(currentParams.value);
		},
		destroy() {
			node.removeEventListener('input', handleInput);
		}
	};
}

function itemStyle(item: WhiteboardItem) {
	return [
		`left: ${item.x}px`,
		`top: ${item.y}px`,
		`width: ${item.width}px`,
		`height: ${item.height}px`,
		`z-index: ${item.zIndex ?? 1}`,
		`transform: rotate(${item.rotation ?? 0}deg)`
	].join('; ');
}

function drawingPoints(points: WhiteboardPoint[]) {
	return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function diamondPoints(item: WhiteboardItem) {
	return `${item.width / 2},0 ${item.width},${item.height / 2} ${item.width / 2},${item.height} 0,${item.height / 2}`;
}

function getItemsBounds(nextItems: WhiteboardItem[]) {
	const xs = nextItems.flatMap((item) => [item.x, item.x + item.width]);
	const ys = nextItems.flatMap((item) => [item.y, item.y + item.height]);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	const maxX = Math.max(...xs);
	const maxY = Math.max(...ys);

	return {
		x,
		y,
		width: Math.max(1, maxX - x),
		height: Math.max(1, maxY - y)
	};
}

function resizeBox(
	resize: Extract<Interaction, { kind: 'resize' }>,
	dx: number,
	dy: number
) {
	const next = {
		x: resize.originX,
		y: resize.originY,
		width: resize.originWidth,
		height: resize.originHeight
	};

	if (resize.direction.includes('e')) {
		next.width = Math.max(minItemSize, resize.originWidth + dx);
	}

	if (resize.direction.includes('s')) {
		next.height = Math.max(minItemSize, resize.originHeight + dy);
	}

	if (resize.direction.includes('w')) {
		next.width = Math.max(minItemSize, resize.originWidth - dx);
		next.x = resize.originX + resize.originWidth - next.width;
	}

	if (resize.direction.includes('n')) {
		next.height = Math.max(minItemSize, resize.originHeight - dy);
		next.y = resize.originY + resize.originHeight - next.height;
	}

	return next;
}

function getShapeFill(shape: WhiteboardShapeKind) {
	if (shape === 'ellipse') {
		return 'oklch(0.91 0.08 175)';
	}

	if (shape === 'diamond') {
		return 'oklch(0.92 0.07 320)';
	}

	return 'oklch(0.95 0.06 72)';
}

function getShapeStroke(shape: WhiteboardShapeKind) {
	if (shape === 'ellipse') {
		return 'oklch(0.45 0.12 175)';
	}

	if (shape === 'diamond') {
		return 'oklch(0.5 0.13 320)';
	}

	return 'oklch(0.51 0.12 62)';
}

function getCursor(tool: WhiteboardTool) {
	if (tool === 'pan') {
		return interaction?.kind === 'pan' ? 'grabbing' : 'grab';
	}

	if (tool === 'pen') {
		return 'crosshair';
	}

	if (tool === 'select') {
		return interaction?.kind === 'pan' ? 'grabbing' : 'default';
	}

	return 'copy';
}

function isShapeTool(tool: WhiteboardTool): tool is WhiteboardShapeKind {
	return tool === 'rectangle' || tool === 'ellipse' || tool === 'diamond';
}

function keyToTool(key: string): WhiteboardTool | null {
	if (key === 'v') {
		return 'select';
	}

	if (key === 'h') {
		return 'pan';
	}

	if (key === 't') {
		return 'text';
	}

	if (key === 'r') {
		return 'rectangle';
	}

	if (key === 'e') {
		return 'ellipse';
	}

	if (key === 'd') {
		return 'diamond';
	}

	if (key === 'p') {
		return 'pen';
	}

	return null;
}

function getResizeLabel(direction: ResizeDirection) {
	const names: Record<ResizeDirection, string> = {
		nw: 'Resize from top left',
		n: 'Resize from top',
		ne: 'Resize from top right',
		e: 'Resize from right',
		se: 'Resize from bottom right',
		s: 'Resize from bottom',
		sw: 'Resize from bottom left',
		w: 'Resize from left'
	};

	return names[direction];
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}
</script>

<div class="whiteboard">
	{#if showToolbar}
		<nav class="toolbar" aria-label="Whiteboard tools">
			<div class="tool-group">
				{@render toolButton('select', 'Select')}
				{@render toolButton('pan', 'Pan')}
				{@render toolButton('text', 'Text')}
				{@render toolButton('rectangle', 'Rectangle')}
				{@render toolButton('ellipse', 'Ellipse')}
				{@render toolButton('diamond', 'Diamond')}
				{@render toolButton('pen', 'Pen')}
			</div>

			<div class="tool-group">
				<button type="button" aria-label="Zoom out" title="Zoom out" onclick={() => zoomBy(0.82)}>
					{@render zoomOutIcon()}
				</button>
				<span class="zoom-readout" aria-live="polite">{zoomPercent}</span>
				<button type="button" aria-label="Zoom in" title="Zoom in" onclick={() => zoomBy(1.18)}>
					{@render zoomInIcon()}
				</button>
				<button type="button" aria-label="Fit content" title="Fit content" onclick={fitToItems}>
					{@render fitIcon()}
				</button>
			</div>

			<div class="tool-group">
				<button
					type="button"
					aria-label="Delete selected item"
					title="Delete selected item"
					disabled={!selectedItem || readonly}
					onclick={deleteSelected}
				>
					{@render trashIcon()}
				</button>
			</div>
		</nav>
	{/if}

	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		class="viewport"
		bind:this={viewportElement}
		role="application"
		aria-label={ariaLabel}
		tabindex="0"
		style={viewportStyle}
		onkeydown={handleKeydown}
		onpointerdown={handleSurfacePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
		onwheel={handleWheel}
	>
		<div class="world" style={worldStyle}>
			{#each items as item (item.id)}
				<div
					class="board-item"
					class:selected={item.id === selectedId}
					class:locked={item.locked}
					class:drawing-item={item.kind === 'drawing'}
					class:shape-item={item.kind === 'shape'}
					style={itemStyle(item)}
					role="button"
					tabindex="0"
					aria-label={item.title ?? `${item.kind} item`}
					onpointerdown={(event) => handleItemPointerDown(event, item)}
					onfocus={() => setSelected(item.id)}
				>
					{#if item.kind === 'text'}
						<div
							class="text-box"
							contenteditable={!readonly && !item.locked}
							role="textbox"
							aria-label="Whiteboard text"
							style={`color: ${item.color ?? 'currentColor'}; background: ${item.background ?? 'white'}`}
							use:editableText={{ value: item.text, onchange: (text) => updateText(item.id, text) }}
							onfocus={() => setSelected(item.id)}
						></div>
					{:else if item.kind === 'shape'}
						<svg class="shape" viewBox={`0 0 ${item.width} ${item.height}`} aria-hidden="true">
							{#if item.shape === 'rectangle'}
								<rect
									x="1"
									y="1"
									width={Math.max(0, item.width - 2)}
									height={Math.max(0, item.height - 2)}
									rx="8"
									fill={item.fill ?? 'white'}
									stroke={item.stroke ?? 'currentColor'}
									stroke-width={item.strokeWidth ?? 2}
								/>
							{:else if item.shape === 'ellipse'}
								<ellipse
									cx={item.width / 2}
									cy={item.height / 2}
									rx={Math.max(0, item.width / 2 - 2)}
									ry={Math.max(0, item.height / 2 - 2)}
									fill={item.fill ?? 'white'}
									stroke={item.stroke ?? 'currentColor'}
									stroke-width={item.strokeWidth ?? 2}
								/>
							{:else}
								<polygon
									points={diamondPoints(item)}
									fill={item.fill ?? 'white'}
									stroke={item.stroke ?? 'currentColor'}
									stroke-width={item.strokeWidth ?? 2}
								/>
							{/if}
						</svg>
						<div
							class="shape-label"
							contenteditable={!readonly && !item.locked}
							role="textbox"
							aria-label="Shape label"
							use:editableText={{
								value: item.label ?? '',
								onchange: (label) => updateShapeLabel(item.id, label)
							}}
							onfocus={() => setSelected(item.id)}
						></div>
					{:else if item.kind === 'drawing'}
						<svg
							class="drawing"
							viewBox={`0 0 ${item.width} ${item.height}`}
							aria-hidden="true"
							preserveAspectRatio="none"
						>
							<polyline
								points={drawingPoints(item.points)}
								fill="none"
								stroke={item.stroke ?? defaultStroke}
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width={item.strokeWidth ?? 4}
								vector-effect="non-scaling-stroke"
							/>
						</svg>
					{:else if item.kind === 'component'}
						{@const Component = item.component}
						<div class="component-host" style={`overflow: ${item.overflow ?? 'auto'}`}>
							<Component {...(item.props ?? {})} />
						</div>
					{/if}

					{#if item.id === selectedId && !readonly && !item.locked}
						<div class="item-controls" aria-label="Selected item controls">
							<button
								type="button"
								class="move-handle"
								aria-label="Move item"
								title="Move"
								onpointerdown={(event) => startItemMove(event, item)}
							>
								{@render moveIcon()}
							</button>
							{#each resizeDirections as direction}
								<button
									type="button"
									class={`resize-handle ${direction}`}
									aria-label={getResizeLabel(direction)}
									title={getResizeLabel(direction)}
									onpointerdown={(event) => handleResizePointerDown(event, item, direction)}
								></button>
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			{#if draftDrawing}
				<svg class="draft-drawing" aria-hidden="true">
					<polyline
						points={drawingPoints(draftDrawing.points)}
						fill="none"
						stroke={draftDrawing.stroke}
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width={draftDrawing.strokeWidth}
						vector-effect="non-scaling-stroke"
					/>
				</svg>
			{/if}
		</div>
	</div>
</div>

{#snippet toolButton(tool: WhiteboardTool, label: string)}
	<button
		type="button"
		class:active={activeTool === tool}
		aria-label={label}
		aria-pressed={activeTool === tool}
		title={label}
		onclick={() => (activeTool = tool)}
	>
		{#if tool === 'select'}
			{@render selectIcon()}
		{:else if tool === 'pan'}
			{@render panIcon()}
		{:else if tool === 'text'}
			{@render textIcon()}
		{:else if tool === 'rectangle'}
			{@render rectangleIcon()}
		{:else if tool === 'ellipse'}
			{@render ellipseIcon()}
		{:else if tool === 'diamond'}
			{@render diamondIcon()}
		{:else}
			{@render penIcon()}
		{/if}
	</button>
{/snippet}

{#snippet selectIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
		<path d="M5 3l11 11l-6 1.5L8.5 21z" />
		<path d="M13 14l5 5" />
	</svg>
{/snippet}

{#snippet panIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
		<path d="M7 11V7a2 2 0 0 1 4 0v3" />
		<path d="M11 10V6a2 2 0 0 1 4 0v5" />
		<path d="M15 11V8a2 2 0 0 1 4 0v7a6 6 0 0 1-6 6h-2a7 7 0 0 1-6.2-3.8L3 14a2 2 0 0 1 3.4-2.1L8 14" />
	</svg>
{/snippet}

{#snippet textIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
		<path d="M4 6h16" />
		<path d="M12 6v12" />
		<path d="M8 18h8" />
	</svg>
{/snippet}

{#snippet rectangleIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
		<rect x="5" y="6" width="14" height="12" rx="2" />
	</svg>
{/snippet}

{#snippet ellipseIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
		<ellipse cx="12" cy="12" rx="7" ry="5" />
	</svg>
{/snippet}

{#snippet diamondIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
		<path d="M12 4l8 8l-8 8l-8-8z" />
	</svg>
{/snippet}

{#snippet penIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
		<path d="M4 20c4-1 4-5 8-5" />
		<path d="M14.5 4.5l5 5L10 19l-5 1l1-5z" />
	</svg>
{/snippet}

{#snippet moveIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
		<path d="M12 3v18" />
		<path d="M7 8l5-5l5 5" />
		<path d="M7 16l5 5l5-5" />
		<path d="M3 12h18" />
		<path d="M8 7l-5 5l5 5" />
		<path d="M16 7l5 5l-5 5" />
	</svg>
{/snippet}

{#snippet zoomOutIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="11" cy="11" r="6" />
		<path d="M8 11h6" />
		<path d="M15.5 15.5L21 21" />
	</svg>
{/snippet}

{#snippet zoomInIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="11" cy="11" r="6" />
		<path d="M8 11h6" />
		<path d="M11 8v6" />
		<path d="M15.5 15.5L21 21" />
	</svg>
{/snippet}

{#snippet fitIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
		<path d="M8 4H4v4" />
		<path d="M16 4h4v4" />
		<path d="M20 16v4h-4" />
		<path d="M4 16v4h4" />
		<path d="M9 9h6v6H9z" />
	</svg>
{/snippet}

{#snippet trashIcon()}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
		<path d="M5 7h14" />
		<path d="M9 7V5h6v2" />
		<path d="M8 10v8" />
		<path d="M12 10v8" />
		<path d="M16 10v8" />
		<path d="M7 7l1 14h8l1-14" />
	</svg>
{/snippet}

<style>
.whiteboard {
	position: relative;

	width: 100%;
	height: 100%;
	min-height: 28rem;
	overflow: hidden;

	color: oklch(0.24 0.03 260);
	background: oklch(0.98 0.01 220);
}

.toolbar {
	position: absolute;
	z-index: 20;
	top: 1rem;
	left: 50%;

	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	max-width: calc(100% - 2rem);

	transform: translateX(-50%);
}

.tool-group {
	display: flex;
	align-items: center;
	gap: 0.2rem;
	padding: 0.25rem;

	background: oklch(1 0 0 / 0.88);
	border: 1px solid oklch(0.78 0.04 245 / 0.75);
	border-radius: 0.5rem;
	box-shadow: 0 0.7rem 2rem oklch(0.24 0.05 260 / 0.12);
	backdrop-filter: blur(12px);
}

button {
	display: inline-grid;
	place-items: center;
	width: 2.1rem;
	height: 2.1rem;
	padding: 0;

	color: oklch(0.34 0.06 260);

	border-radius: 0.35rem;
	cursor: pointer;
}

button:hover:not(:disabled),
button:focus-visible,
button.active {
	color: oklch(0.24 0.1 246);
	background: oklch(0.91 0.06 215);
}

button:focus-visible {
	outline: 2px solid oklch(0.58 0.16 245);
	outline-offset: 2px;
}

button:disabled {
	color: oklch(0.68 0.02 260);
	cursor: default;
}

button svg {
	width: 1.18rem;
	height: 1.18rem;
}

.zoom-readout {
	min-width: 3.2rem;
	padding: 0 0.35rem;

	color: oklch(0.36 0.04 260);
	font-family: var(--font-mono);
	font-size: 0.82rem;
	text-align: center;
}

.viewport {
	position: absolute;
	inset: 0;

	overflow: hidden;
	touch-action: none;
	cursor: var(--board-cursor);

	background-color: oklch(0.985 0.012 230);
	background-image:
		linear-gradient(oklch(0.72 0.03 245 / 0.4) 1px, transparent 1px),
		linear-gradient(90deg, oklch(0.72 0.03 245 / 0.4) 1px, transparent 1px),
		linear-gradient(oklch(0.63 0.06 245 / 0.32) 1px, transparent 1px),
		linear-gradient(90deg, oklch(0.63 0.06 245 / 0.32) 1px, transparent 1px);
	background-position:
		var(--grid-x) var(--grid-y),
		var(--grid-x) var(--grid-y),
		var(--grid-x) var(--grid-y),
		var(--grid-x) var(--grid-y);
	background-size:
		var(--grid-size) var(--grid-size),
		var(--grid-size) var(--grid-size),
		var(--major-grid-size) var(--major-grid-size),
		var(--major-grid-size) var(--major-grid-size);
}

.viewport:focus-visible {
	outline: 2px solid oklch(0.58 0.16 245);
	outline-offset: -2px;
}

.world {
	position: absolute;
	top: 0;
	left: 0;

	width: 1px;
	height: 1px;

	transform-origin: 0 0;
}

.board-item {
	position: absolute;

	display: grid;

	border-radius: 0.5rem;
	outline: 1px solid transparent;
	transform-origin: center;
	cursor: grab;
}

.board-item:not(.shape-item):not(.drawing-item) {
	box-shadow: 0 1rem 2.5rem oklch(0.25 0.05 260 / 0.12);
}

.board-item:active {
	cursor: grabbing;
}

.board-item.selected {
	outline: 2px solid oklch(0.53 0.17 245);
	outline-offset: 4px;
}

.board-item.locked {
	cursor: default;
}

.text-box,
.component-host {
	width: 100%;
	height: 100%;
}

.text-box {
	padding: 0.9rem 1rem;
	overflow: auto;

	cursor: text;
	font-size: 1rem;
	line-height: 1.35;
	white-space: pre-wrap;

	border: 1px solid oklch(0.76 0.06 80);
	border-radius: 0.5rem;
}

.text-box:focus,
.shape-label:focus {
	outline: none;
}

.shape,
.drawing {
	position: absolute;
	inset: 0;

	width: 100%;
	height: 100%;
	overflow: visible;
}

.shape {
	filter: drop-shadow(0 0.85rem 0.85rem oklch(0.25 0.05 260 / 0.16));
}

.shape-label {
	position: relative;
	z-index: 2;

	display: grid;
	place-items: center;
	width: 100%;
	height: 100%;
	padding: 0.75rem;

	color: oklch(0.24 0.04 260);
	font-weight: 700;
	line-height: 1.2;
	text-align: center;
	overflow-wrap: anywhere;
	cursor: text;
}

.drawing-item {
	box-shadow: none;
}

.component-host {
	border: 1px solid oklch(0.72 0.04 250 / 0.8);
	border-radius: 0.5rem;
	background: oklch(1 0 0);
	cursor: auto;
}

.draft-drawing {
	position: absolute;
	top: 0;
	left: 0;

	width: 1px;
	height: 1px;
	overflow: visible;

	pointer-events: none;
}

.item-controls {
	position: absolute;
	inset: 0;
	z-index: 5;

	pointer-events: none;
}

.move-handle,
.resize-handle {
	position: absolute;

	background: oklch(0.56 0.16 245);
	border: 2px solid white;
	box-shadow: 0 0.3rem 0.9rem oklch(0.24 0.04 260 / 0.18);
	pointer-events: auto;
}

.move-handle {
	top: -1.85rem;
	left: 50%;

	width: 2.35rem;
	height: 1.35rem;

	border-radius: 0.45rem;
	cursor: grab;
	transform: translateX(-50%);
}

.move-handle svg {
	width: 0.8rem;
	height: 0.8rem;
	color: white;
}

.resize-handle {
	width: 0.9rem;
	height: 0.9rem;

	border-radius: 999px;
}

.resize-handle.nw {
	top: -0.55rem;
	left: -0.55rem;
	cursor: nwse-resize;
}

.resize-handle.n {
	top: -0.55rem;
	left: 50%;
	cursor: ns-resize;
	transform: translateX(-50%);
}

.resize-handle.ne {
	top: -0.55rem;
	right: -0.55rem;
	cursor: nesw-resize;
}

.resize-handle.e {
	top: 50%;
	right: -0.55rem;
	cursor: ew-resize;
	transform: translateY(-50%);
}

.resize-handle.se {
	right: -0.55rem;
	bottom: -0.55rem;
	cursor: nwse-resize;
}

.resize-handle.s {
	bottom: -0.55rem;
	left: 50%;
	cursor: ns-resize;
	transform: translateX(-50%);
}

.resize-handle.sw {
	bottom: -0.55rem;
	left: -0.55rem;
	cursor: nesw-resize;
}

.resize-handle.w {
	top: 50%;
	left: -0.55rem;
	cursor: ew-resize;
	transform: translateY(-50%);
}

@media (max-width: 720px) {
	.toolbar {
		top: 0.65rem;
	}

	.tool-group {
		gap: 0.12rem;
	}

	button {
		width: 1.9rem;
		height: 1.9rem;
	}
}
</style>
