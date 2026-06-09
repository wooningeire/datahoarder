<script lang="ts">
import type { NoteColumn } from "./note-tree-model.js";

type NewMenuBounds = {
    left: number,
    top: number,
    width: number,
};

type CreateAction = (directoryPath: string) => void | Promise<void>;

type Props = {
    bounds: NewMenuBounds | null,
    column?: NoteColumn,
    createDrawingNote?: CreateAction,
    createInColumn: (create: CreateAction, directoryPath: string) => Promise<void>,
    createNote?: CreateAction,
    createNoteFromTemplate?: CreateAction,
    hasCreateActions: boolean,
};

let {
    bounds,
    column,
    createDrawingNote,
    createInColumn,
    createNote,
    createNoteFromTemplate,
    hasCreateActions,
}: Props = $props();
</script>

{#if hasCreateActions && column && bounds}
    <div
        class="new-menu-items"
        role="menu"
        aria-label="New options"
        style:--new-menu-left={`${bounds.left}px`}
        style:--new-menu-top={`${bounds.top}px`}
        style:--new-menu-width={`${bounds.width}px`}
    >
        {#if createNote}
            <button
                type="button"
                role="menuitem"
                onclick={() => createInColumn(createNote, column.directoryPath)}
            >
                New Note
            </button>
        {/if}
        {#if createDrawingNote}
            <button
                type="button"
                role="menuitem"
                onclick={() => createInColumn(createDrawingNote, column.directoryPath)}
            >
                New Drawing
            </button>
        {/if}
        {#if createNoteFromTemplate}
            <button
                type="button"
                role="menuitem"
                onclick={() => createInColumn(createNoteFromTemplate, column.directoryPath)}
            >
                New From Template
            </button>
        {/if}
    </div>
{/if}

<style lang="scss">
.new-menu-items {
    position: fixed;
    z-index: 25;
    left: var(--new-menu-left);
    top: var(--new-menu-top);

    box-sizing: border-box;
    display: grid;
    gap: 0.18rem;
    width: var(--new-menu-width);
    padding: 0.25rem;

    background: oklch(0.99 0.008 235);
    border: 1px solid oklch(0.76 0.04 235);
    border-radius: 0.35rem;
    box-shadow: 0 0.7rem 1.6rem oklch(0.16 0.04 245 / 0.16);
}

.new-menu-items button {
    display: block;
    min-height: 1.75rem;
    padding: 0.25rem 0.45rem;

    color: oklch(0.27 0.045 245);
    font-size: 0.82rem;
    text-align: left;

    background: transparent;
    border: 0;
    border-radius: 0.25rem;
}

.new-menu-items button:hover {
    background: oklch(0.92 0.04 205);
}
</style>
