<script lang="ts">
import WhiteboardItemView from "./WhiteboardItem.svelte";
import {
    drawingPoints,
    type DraftDrawing,
    type ResizeDirection,
} from "./whiteboard-geometry.js";
import type { WhiteboardItem } from "./whiteboard.js";

type Props = {
    ariaLabel: string,
    draftDrawing: DraftDrawing | null,
    items: WhiteboardItem[],
    onItemFocus: (id: string | null) => void,
    onItemMoveStart: (event: PointerEvent, item: WhiteboardItem) => void,
    onItemPointerDown: (event: PointerEvent, item: WhiteboardItem) => void,
    onItemResizeStart: (event: PointerEvent, item: WhiteboardItem, direction: ResizeDirection) => void,
    onItemShapeLabelChange: (id: string, label: string) => void,
    onItemTextChange: (id: string, text: string) => void,
    onViewportKeydown: (event: KeyboardEvent) => void,
    onViewportPointerCancel: (event: PointerEvent) => void,
    onViewportPointerDown: (event: PointerEvent) => void,
    onViewportPointerMove: (event: PointerEvent) => void,
    onViewportPointerUp: (event: PointerEvent) => void,
    onViewportWheel: (event: WheelEvent) => void,
    readonly: boolean,
    selectedId: string | null,
    viewportCursorClass: string,
    viewportElement: HTMLDivElement | null,
    viewportGridSize: string,
    viewportMajorGridSize: string,
    viewportGridX: string,
    viewportGridY: string,
    worldScale: string,
    worldX: string,
    worldY: string,
};

let {
    ariaLabel,
    draftDrawing,
    items,
    onItemFocus,
    onItemMoveStart,
    onItemPointerDown,
    onItemResizeStart,
    onItemShapeLabelChange,
    onItemTextChange,
    onViewportKeydown,
    onViewportPointerCancel,
    onViewportPointerDown,
    onViewportPointerMove,
    onViewportPointerUp,
    onViewportWheel,
    readonly,
    selectedId,
    viewportCursorClass,
    viewportElement = $bindable<HTMLDivElement | null>(null),
    viewportGridSize,
    viewportMajorGridSize,
    viewportGridX,
    viewportGridY,
    worldScale,
    worldX,
    worldY,
}: Props = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
    class={`viewport ${viewportCursorClass}`}
    bind:this={viewportElement}
    role="application"
    aria-label={ariaLabel}
    tabindex="0"
    style:--grid-size={viewportGridSize}
    style:--major-grid-size={viewportMajorGridSize}
    style:--grid-x={viewportGridX}
    style:--grid-y={viewportGridY}
    onkeydown={onViewportKeydown}
    onpointerdown={onViewportPointerDown}
    onpointermove={onViewportPointerMove}
    onpointerup={onViewportPointerUp}
    onpointercancel={onViewportPointerCancel}
    onwheel={onViewportWheel}
>
    <div
        class="world"
        style:--world-x={worldX}
        style:--world-y={worldY}
        style:--world-scale={worldScale}
    >
        {#each items as item (item.id)}
            <WhiteboardItemView
                {item}
                {readonly}
                onItemFocus={onItemFocus}
                onItemMoveStart={onItemMoveStart}
                onItemPointerDown={onItemPointerDown}
                onItemResizeStart={onItemResizeStart}
                onItemShapeLabelChange={onItemShapeLabelChange}
                onItemTextChange={onItemTextChange}
                selected={item.id === selectedId}
            />
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

<style lang="scss">
.viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    cursor: default;
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

.viewport.cursor-copy {
    cursor: copy;
}

.viewport.cursor-crosshair {
    cursor: crosshair;
}

.viewport.cursor-grab {
    cursor: grab;
}

.viewport.cursor-grabbing {
    cursor: grabbing;
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
    transform: translate(var(--world-x, 0), var(--world-y, 0)) scale(var(--world-scale, 1));
    transform-origin: 0 0;
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
</style>
