<script lang="ts">
import type { WhiteboardItem, WhiteboardTool } from "./whiteboard.js";

type Props = {
    activeTool: WhiteboardTool,
    deleteSelected: () => void,
    fitToItems: () => void,
    readonly: boolean,
    selectedItem: WhiteboardItem | null,
    zoomBy: (factor: number) => void,
    zoomPercent: string,
};

let {
    activeTool = $bindable<WhiteboardTool>("select"),
    deleteSelected,
    fitToItems,
    readonly,
    selectedItem,
    zoomBy,
    zoomPercent,
}: Props = $props();
</script>

<nav class="toolbar" aria-label="Whiteboard tools">
    <div class="tool-group">
        {@render toolButton("select", "Select")}
        {@render toolButton("pan", "Pan")}
        {@render toolButton("text", "Text")}
        {@render toolButton("rectangle", "Rectangle")}
        {@render toolButton("ellipse", "Ellipse")}
        {@render toolButton("diamond", "Diamond")}
        {@render toolButton("pen", "Pen")}
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

{#snippet toolButton(tool: WhiteboardTool, label: string)}
    <button
        type="button"
        class:active={activeTool === tool}
        aria-label={label}
        aria-pressed={activeTool === tool}
        title={label}
        onclick={() => (activeTool = tool)}
    >
        {#if tool === "select"}
            {@render selectIcon()}
        {:else if tool === "pan"}
            {@render panIcon()}
        {:else if tool === "text"}
            {@render textIcon()}
        {:else if tool === "rectangle"}
            {@render rectangleIcon()}
        {:else if tool === "ellipse"}
            {@render ellipseIcon()}
        {:else if tool === "diamond"}
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

<style lang="scss">
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
