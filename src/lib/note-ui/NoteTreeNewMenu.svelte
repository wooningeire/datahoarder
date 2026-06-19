<script lang="ts">
import type { NoteColumn } from "./note-tree-model.js";

type CreateAction = (directoryPath: string) => void | Promise<void>;

type Props = {
    column?: NoteColumn,
    createDrawingNote?: CreateAction,
    createFolder?: CreateAction,
    createInColumn: (create: CreateAction, directoryPath: string) => Promise<void>,
    createNote?: CreateAction,
    createNoteFromTemplate?: CreateAction,
    hasCreateActions: boolean,
};

let {
    column,
    createDrawingNote,
    createFolder,
    createInColumn,
    createNote,
    createNoteFromTemplate,
    hasCreateActions,
}: Props = $props();
</script>

{#if hasCreateActions && column}
    <div
        class="new-menu-items"
        role="menu"
        aria-label="New options"
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
        {#if createFolder}
            <button
                type="button"
                role="menuitem"
                onclick={() => createInColumn(createFolder, column.directoryPath)}
            >
                New Folder
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
    position: absolute;
    z-index: 25;
    right: 0;
    bottom: calc(100% + 0.25rem);
    left: 0;

    box-sizing: border-box;
    display: grid;
    gap: 0.18rem;
    padding: 0.25rem;
    overflow: hidden;

    background: oklch(0.99 0.008 235);
    border: 1px solid oklch(0.76 0.04 235);
    border-radius: 0.35rem;
    box-shadow: 0 0.7rem 1.6rem oklch(0.16 0.04 245 / 0.16);

    animation: new-menu-drawer 160ms cubic-bezier(0, 1, 0.5, 1);
    transform-origin: bottom center;
    will-change: clip-path, opacity, transform;
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

@keyframes new-menu-drawer {
    from {
        clip-path: inset(100% 0 0);
        opacity: 0;
        transform: translateY(0.35rem);
    }

    to {
        clip-path: inset(0);
        opacity: 1;
        transform: translateY(0);
    }
}

@media (prefers-reduced-motion: reduce) {
    .new-menu-items {
        animation-duration: 1ms;
    }
}
</style>
