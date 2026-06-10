<script lang="ts">
import WhiteboardToolbar from "./WhiteboardToolbar.svelte";
import WhiteboardViewportView from "./WhiteboardViewport.svelte";
import {
    clamp,
    createDraftDrawing,
    createShapeItem,
    createTextItem,
    getCursorClass,
    getItemsBounds,
    gridSize,
    isShapeTool,
    majorGridSize,
    normalizeDrawing,
    resizeBox,
    type DraftDrawing,
    type ResizeDirection,
    type WhiteboardInteraction,
} from "./whiteboard-geometry.js";
import {
    type WhiteboardItem,
    type WhiteboardPoint,
    type WhiteboardShapeKind,
    type WhiteboardTool,
    type WhiteboardViewport,
} from "./whiteboard.js";
import { createWhiteboardKeydownHandler } from "./whiteboard-keyboard.js";
import { getWorldPoint } from "./whiteboard-viewport.js";

type Props = {
    items?: WhiteboardItem[],
    viewport?: WhiteboardViewport,
    activeTool?: WhiteboardTool,
    ariaLabel?: string,
    minZoom?: number,
    maxZoom?: number,
    readonly?: boolean,
    showToolbar?: boolean,
    onchange?: (items: WhiteboardItem[]) => void,
    onselect?: (item: WhiteboardItem | null) => void,
};

let {
    items = $bindable<WhiteboardItem[]>([]),
    viewport = $bindable<WhiteboardViewport>({ x: 0, y: 0, scale: 1 }),
    activeTool = $bindable<WhiteboardTool>("select"),
    ariaLabel = "Infinite whiteboard",
    minZoom = 0.15,
    maxZoom = 4,
    readonly = false,
    showToolbar = true,
    onchange,
    onselect,
}: Props = $props();

let viewportElement = $state<HTMLDivElement | null>(null);
let selectedId = $state<string | null>(null);
let interaction = $state<WhiteboardInteraction | null>(null);
let draftDrawing = $state<DraftDrawing | null>(null);

let selectedItem = $derived(items.find((item) => item.id === selectedId) ?? null);
let viewportGridSize = $derived(`${Math.max(4, gridSize * viewport.scale)}px`);
let viewportMajorGridSize = $derived(`${Math.max(12, majorGridSize * viewport.scale)}px`);
let viewportGridX = $derived(`${viewport.x}px`);
let viewportGridY = $derived(`${viewport.y}px`);
let viewportCursorClass = $derived(getCursorClass(activeTool, interaction));
let worldX = $derived(`${viewport.x}px`);
let worldY = $derived(`${viewport.y}px`);
let worldScale = $derived(String(viewport.scale));
let zoomPercent = $derived(`${Math.round(viewport.scale * 100)}%`);

const setItems = (nextItems: WhiteboardItem[]): void => {
    items = nextItems;
    onchange?.(items);

    if (selectedId && !items.some((item) => item.id === selectedId)) {
        setSelected(null);
    }
};
const setSelected = (id: string | null): void => {
    selectedId = id;
    onselect?.(items.find((item) => item.id === id) ?? null);
};
const updateItem = (
    id: string,
    update: (item: WhiteboardItem) => WhiteboardItem,
): void => {
    setItems(items.map((item) => (item.id === id ? update(item) : item)));
};
const deleteSelected = (): void => {
    if (!selectedId || readonly) {
        return;
    }

    setItems(items.filter((item) => item.id !== selectedId));
};
const handleSurfacePointerDown = (event: PointerEvent): void => {
    if (!viewportElement || event.button !== 0) {
        return;
    }

    viewportElement.focus({ preventScroll: true });
    viewportElement.setPointerCapture(event.pointerId);

    const point = getWorldPoint(event, viewportElement, viewport);

    if (activeTool === "pen" && !readonly) {
        draftDrawing = createDraftDrawing(point);
        interaction = { kind: "draw", pointerId: event.pointerId };
        event.preventDefault();
        return;
    }

    if (isShapeTool(activeTool) && !readonly) {
        addShape(activeTool, point);
        event.preventDefault();
        return;
    }

    if (activeTool === "text" && !readonly) {
        addText(point);
        event.preventDefault();
        return;
    }

    setSelected(null);
    interaction = {
        kind: "pan",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: viewport.x,
        originY: viewport.y,
    };
    event.preventDefault();
};
const handleItemPointerDown = (
    event: PointerEvent,
    item: WhiteboardItem,
): void => {
    if (event.button !== 0 || activeTool !== "select") {
        return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("[contenteditable=\"true\"]") || target.closest(".component-host")) {
        event.stopPropagation();
        setSelected(item.id);
        return;
    }

    if (target.closest(".item-controls")) {
        setSelected(item.id);
        return;
    }

    startItemMove(event, item);
};
const startItemMove = (
    event: PointerEvent,
    item: WhiteboardItem,
): void => {
    event.stopPropagation();
    event.preventDefault();
    setSelected(item.id);

    if (readonly || item.locked || !viewportElement) {
        return;
    }

    viewportElement.setPointerCapture(event.pointerId);

    interaction = {
        kind: "move",
        pointerId: event.pointerId,
        id: item.id,
        start: getWorldPoint(event, viewportElement, viewport),
        originX: item.x,
        originY: item.y,
    };
};
const handleResizePointerDown = (
    event: PointerEvent,
    item: WhiteboardItem,
    direction: ResizeDirection,
): void => {
    if (readonly || item.locked || !viewportElement || activeTool !== "select") {
        return;
    }

    event.stopPropagation();
    event.preventDefault();
    setSelected(item.id);
    viewportElement.setPointerCapture(event.pointerId);
    interaction = {
        kind: "resize",
        pointerId: event.pointerId,
        id: item.id,
        direction,
        start: getWorldPoint(event, viewportElement, viewport),
        originX: item.x,
        originY: item.y,
        originWidth: item.width,
        originHeight: item.height,
    };
};
const handlePointerMove = (event: PointerEvent): void => {
    const currentInteraction = interaction;

    if (!currentInteraction || currentInteraction.pointerId !== event.pointerId) {
        return;
    }

    if (currentInteraction.kind === "pan") {
        viewport = {
            ...viewport,
            x: currentInteraction.originX + event.clientX - currentInteraction.startX,
            y: currentInteraction.originY + event.clientY - currentInteraction.startY,
        };
        return;
    }

    if (currentInteraction.kind === "draw") {
        appendDraftPoint(getWorldPoint(event, viewportElement, viewport));
        return;
    }

    const point = getWorldPoint(event, viewportElement, viewport);

    if (currentInteraction.kind === "move") {
        const dx = point.x - currentInteraction.start.x;
        const dy = point.y - currentInteraction.start.y;

        updateItem(currentInteraction.id, (item) => ({
            ...item,
            x: currentInteraction.originX + dx,
            y: currentInteraction.originY + dy,
        }));
        return;
    }

    if (currentInteraction.kind === "resize") {
        const dx = point.x - currentInteraction.start.x;
        const dy = point.y - currentInteraction.start.y;

        updateItem(currentInteraction.id, (item) => ({
            ...item,
            ...resizeBox(currentInteraction, dx, dy),
        }));
    }
};

const handlePointerUp = (event: PointerEvent): void => {
    if (!interaction || interaction.pointerId !== event.pointerId) {
        return;
    }

    if (interaction.kind === "draw") {
        commitDraftDrawing();
    }

    viewportElement?.releasePointerCapture(event.pointerId);
    interaction = null;
};

const handleWheel = (event: WheelEvent): void => {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.0014);
        zoomAt(event.clientX, event.clientY, viewport.scale * factor);
        return;
    }

    viewport = {
        ...viewport,
        x: viewport.x - event.deltaX,
        y: viewport.y - event.deltaY,
    };
};

const clearInteraction = (): void => {
    draftDrawing = null;
    interaction = null;
    activeTool = "select";
    setSelected(null);
};

const zoomAt = (clientX: number, clientY: number, nextScale: number): void => {
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
        scale,
    };
};

const zoomBy = (factor: number): void => {
    const rect = viewportElement?.getBoundingClientRect();

    if (!rect) {
        viewport = { ...viewport, scale: clamp(viewport.scale * factor, minZoom, maxZoom) };
        return;
    }

    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, viewport.scale * factor);
};

const fitToItems = (): void => {
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
        maxZoom,
    );

    viewport = {
        scale,
        x: rect.width / 2 - (bounds.x + bounds.width / 2) * scale,
        y: rect.height / 2 - (bounds.y + bounds.height / 2) * scale,
    };
};

const handleKeydown = createWhiteboardKeydownHandler({
    clearInteraction,
    deleteSelected,
    fitToItems,
    selectTool: (tool) => {
        activeTool = tool;
    },
});

const addText = (point: WhiteboardPoint): void => {
    const item = createTextItem(point);

    setItems([...items, item]);
    setSelected(item.id);
    activeTool = "select";
};

const addShape = (shape: WhiteboardShapeKind, point: WhiteboardPoint): void => {
    const item = createShapeItem(shape, point);

    setItems([...items, item]);
    setSelected(item.id);
    activeTool = "select";
};

const appendDraftPoint = (point: WhiteboardPoint): void => {
    if (!draftDrawing) {
        return;
    }

    const previous = draftDrawing.points.at(-1);

    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 1.5) {
        return;
    }

    draftDrawing = {
        ...draftDrawing,
        points: [...draftDrawing.points, point],
    };
};

const commitDraftDrawing = (): void => {
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
    activeTool = "select";
};

const updateText = (id: string, text: string): void => {
    updateItem(id, (item) => (item.kind === "text" ? { ...item, text } : item));
};

const updateShapeLabel = (id: string, label: string): void => {
    updateItem(id, (item) => (item.kind === "shape" ? { ...item, label } : item));
};

</script>

<div class="whiteboard">
    {#if showToolbar}
        <WhiteboardToolbar
            bind:activeTool
            {deleteSelected}
            {fitToItems}
            {readonly}
            {selectedItem}
            {zoomBy}
            {zoomPercent}
        />
    {/if}

    <WhiteboardViewportView
        {ariaLabel}
        {draftDrawing}
        {items}
        onItemFocus={setSelected}
        onItemMoveStart={startItemMove}
        onItemPointerDown={handleItemPointerDown}
        onItemResizeStart={handleResizePointerDown}
        onItemShapeLabelChange={updateShapeLabel}
        onItemTextChange={updateText}
        onViewportKeydown={handleKeydown}
        onViewportPointerCancel={handlePointerUp}
        onViewportPointerDown={handleSurfacePointerDown}
        onViewportPointerMove={handlePointerMove}
        onViewportPointerUp={handlePointerUp}
        onViewportWheel={handleWheel}
        {readonly}
        {selectedId}
        {viewportCursorClass}
        bind:viewportElement
        {viewportGridSize}
        {viewportMajorGridSize}
        {viewportGridX}
        {viewportGridY}
        {worldScale}
        {worldX}
        {worldY}
    />
</div>

<style lang="scss">
.whiteboard {
    position: relative;

    width: 100%;
    height: 100%;
    min-height: 28rem;
    overflow: hidden;

    color: oklch(0.24 0.03 260);
    background: oklch(0.98 0.01 220);
}

</style>
