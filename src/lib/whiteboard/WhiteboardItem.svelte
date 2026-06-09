<script lang="ts">
import {
    defaultStroke,
    diamondPoints,
    drawingPoints,
    getResizeLabel,
    resizeDirections,
    type ResizeDirection,
} from "./whiteboard-geometry.js";
import { editableText } from "./whiteboard-text.js";
import type { WhiteboardItem } from "./whiteboard.js";

type Props = {
    item: WhiteboardItem,
    onItemFocus: (id: string) => void,
    onItemPointerDown: (event: PointerEvent, item: WhiteboardItem) => void,
    onItemResizeStart: (event: PointerEvent, item: WhiteboardItem, direction: ResizeDirection) => void,
    onItemTextChange: (id: string, text: string) => void,
    onItemShapeLabelChange: (id: string, label: string) => void,
    onItemMoveStart: (event: PointerEvent, item: WhiteboardItem) => void,
    readonly: boolean,
    selected: boolean,
};

let {
    item,
    onItemFocus,
    onItemPointerDown,
    onItemResizeStart,
    onItemTextChange,
    onItemShapeLabelChange,
    onItemMoveStart,
    readonly,
    selected,
}: Props = $props();
</script>

<div
    class="board-item"
    class:selected
    class:locked={item.locked}
    class:drawing-item={item.kind === "drawing"}
    class:shape-item={item.kind === "shape"}
    style:--item-x={`${item.x}px`}
    style:--item-y={`${item.y}px`}
    style:--item-width={`${item.width}px`}
    style:--item-height={`${item.height}px`}
    style:--item-z-index={item.zIndex ?? 1}
    style:--item-rotation={`${item.rotation ?? 0}deg`}
    role="button"
    tabindex="0"
    aria-label={item.title ?? `${item.kind} item`}
    onpointerdown={(event) => onItemPointerDown(event, item)}
    onfocus={() => onItemFocus(item.id)}
>
    {#if item.kind === "text"}
        <div
            class="text-box"
            contenteditable={!readonly && !item.locked}
            role="textbox"
            aria-label="Whiteboard text"
            style:--text-color={item.color ?? "currentColor"}
            style:--text-background={item.background ?? "white"}
            use:editableText={{ value: item.text, onchange: (text) => onItemTextChange(item.id, text) }}
            onfocus={() => onItemFocus(item.id)}
        ></div>
    {:else if item.kind === "shape"}
        <svg class="shape" viewBox={`0 0 ${item.width} ${item.height}`} aria-hidden="true">
            {#if item.shape === "rectangle"}
                <rect
                    x="1"
                    y="1"
                    width={Math.max(0, item.width - 2)}
                    height={Math.max(0, item.height - 2)}
                    rx="8"
                    fill={item.fill ?? "white"}
                    stroke={item.stroke ?? "currentColor"}
                    stroke-width={item.strokeWidth ?? 2}
                />
            {:else if item.shape === "ellipse"}
                <ellipse
                    cx={item.width / 2}
                    cy={item.height / 2}
                    rx={Math.max(0, item.width / 2 - 2)}
                    ry={Math.max(0, item.height / 2 - 2)}
                    fill={item.fill ?? "white"}
                    stroke={item.stroke ?? "currentColor"}
                    stroke-width={item.strokeWidth ?? 2}
                />
            {:else}
                <polygon
                    points={diamondPoints(item)}
                    fill={item.fill ?? "white"}
                    stroke={item.stroke ?? "currentColor"}
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
                value: item.label ?? "",
                onchange: (label) => onItemShapeLabelChange(item.id, label),
            }}
            onfocus={() => onItemFocus(item.id)}
        ></div>
    {:else if item.kind === "drawing"}
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
    {:else if item.kind === "component"}
        {@const Component = item.component}
        <div
            class="component-host"
            class:overflow-hidden={item.overflow === "hidden"}
            class:overflow-visible={item.overflow === "visible"}
        >
            <Component {...(item.props ?? {})} />
        </div>
    {/if}

    {#if selected && !readonly && !item.locked}
        <div class="item-controls" aria-label="Selected item controls">
            <button
                type="button"
                class="move-handle"
                aria-label="Move item"
                title="Move"
                onpointerdown={(event) => onItemMoveStart(event, item)}
            >
                {@render moveIcon()}
            </button>
            {#each resizeDirections as direction}
                <button
                    type="button"
                    class={`resize-handle ${direction}`}
                    aria-label={getResizeLabel(direction)}
                    title={getResizeLabel(direction)}
                    onpointerdown={(event) => onItemResizeStart(event, item, direction)}
                ></button>
            {/each}
        </div>
    {/if}
</div>

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

<style lang="scss">
.board-item {
    position: absolute;
    left: var(--item-x, 0);
    top: var(--item-y, 0);
    z-index: var(--item-z-index, 1);

    display: grid;
    width: var(--item-width, 0);
    height: var(--item-height, 0);

    border-radius: 0.5rem;
    outline: 1px solid transparent;
    transform: rotate(var(--item-rotation, 0deg));
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

    color: var(--text-color, currentColor);
    cursor: text;
    font-size: 1rem;
    line-height: 1.35;
    white-space: pre-wrap;

    background: var(--text-background, white);
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
    overflow-wrap: anywhere;

    color: oklch(0.24 0.04 260);
    cursor: text;
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
}

.drawing-item {
    box-shadow: none;
}

.component-host {
    overflow: auto;

    background: oklch(1 0 0);
    border: 1px solid oklch(0.72 0.04 250 / 0.8);
    border-radius: 0.5rem;
    cursor: auto;
}

.component-host.overflow-hidden {
    overflow: hidden;
}

.component-host.overflow-visible {
    overflow: visible;
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
</style>
