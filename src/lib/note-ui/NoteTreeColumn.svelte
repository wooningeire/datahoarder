<script lang="ts">
import type { InlineFileCreate } from "../local-vault/shared/types.js";
import NoteTreeInlineFileCreate from "./NoteTreeInlineFileCreate.svelte";
import {
    scrollColumnIntoView,
    scrollCurrentNote,
} from "./note-tree-scroll.js";
import type {
    DisplayDirectory,
    NoteColumn,
} from "./note-tree-model.js";

type Props = {
    activePath: string,
    cancelInlineFileCreate?: () => void,
    column: NoteColumn,
    createDisabled: boolean,
    hasCreateActions: boolean,
    inlineFileCreate: InlineFileCreate | null,
    isLastColumn: boolean,
    onSelect?: (path: string) => void,
    openNewMenuColumnKey: string,
    selectedDirectoryPaths: string[],
    selectDirectory: (node: DisplayDirectory, level: number) => void,
    submitInlineFileCreate?: () => void,
    toggleNewMenu: (columnKey: string, event: MouseEvent) => void,
    updateInlineFileCreateName?: (fileName: string) => void,
};

let {
    activePath,
    cancelInlineFileCreate,
    column,
    createDisabled,
    hasCreateActions,
    inlineFileCreate,
    isLastColumn,
    onSelect,
    openNewMenuColumnKey,
    selectedDirectoryPaths,
    selectDirectory,
    submitInlineFileCreate,
    toggleNewMenu,
    updateInlineFileCreateName,
}: Props = $props();

let hasColumnInlineCreate = $derived(
    Boolean(inlineFileCreate && column.items.some((item) => item.path === `__pending-file-create__:${inlineFileCreate.id}`)),
);

const isActive = (path: string): boolean => path === activePath || `${path}.md` === activePath;

const isSelected = (path: string, level: number): boolean => selectedDirectoryPaths[level] === path;
</script>

<section
    class="note-column"
    aria-labelledby={`note-column-${column.level}`}
    data-column-key={column.key}
    use:scrollColumnIntoView={isLastColumn}
>
    <h2 id={`note-column-${column.level}`}>{column.label}</h2>
    <ul class="note-column-items">
        {#each column.items as item (item.path)}
            {#if item.kind === "directory"}
                <li>
                    <button
                        type="button"
                        class:selected={isSelected(item.path, column.level)}
                        aria-pressed={isSelected(item.path, column.level)}
                        onclick={() => selectDirectory(item, column.level)}
                    >
                        <span class="directory-mark" aria-hidden="true"></span>
                        <span class="name">{item.name}</span>
                        <span class="chevron" aria-hidden="true"></span>
                    </button>
                </li>
            {:else if item.kind === "pending-file" && inlineFileCreate}
                <li class="pending-file-create">
                    <NoteTreeInlineFileCreate
                        {cancelInlineFileCreate}
                        {inlineFileCreate}
                        {submitInlineFileCreate}
                        {updateInlineFileCreateName}
                    />
                </li>
            {:else if item.kind === "file" && onSelect}
                <li class:active={isActive(item.path)}>
                    <button
                        type="button"
                        class="file-button"
                        aria-current={isActive(item.path) ? "page" : undefined}
                        use:scrollCurrentNote={isActive(item.path)}
                        onclick={() => onSelect?.(item.path)}
                    >
                        <span class="file-mark" aria-hidden="true"></span>
                        <span class="name">{item.name}</span>
                    </button>
                </li>
            {:else if item.kind === "file"}
                <li class:active={isActive(item.path)}>
                    <a
                        href={item.href}
                        aria-current={isActive(item.path) ? "page" : undefined}
                        use:scrollCurrentNote={isActive(item.path)}
                    >
                        <span class="file-mark" aria-hidden="true"></span>
                        <span class="name">{item.name}</span>
                    </a>
                </li>
            {/if}
        {/each}
    </ul>
    {#if hasCreateActions}
        <div class="note-column-footer">
            <div class:open={openNewMenuColumnKey === column.key} class="new-menu">
                <button
                    type="button"
                    class="new-menu-trigger"
                    aria-expanded={openNewMenuColumnKey === column.key}
                    aria-haspopup="menu"
                    disabled={createDisabled}
                    onclick={(event) => toggleNewMenu(column.key, event)}
                >
                    <span>New</span>
                    <span class="new-menu-chevron" aria-hidden="true"></span>
                </button>
            </div>
        </div>
    {/if}
</section>

<style lang="scss">
.note-column {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: visible;
    padding-right: 0.5rem;

    border-right: 1px solid oklch(0.78 0.04 250 / 0.55);
}

.note-column:last-child {
    border-right-color: transparent;
}

h2 {
    margin: 0 0 0.45rem;
    padding: 0 0.45rem;
    overflow: hidden;

    color: oklch(0.42 0.06 255);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.2;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
}

.note-column-items {
    display: grid;
    flex: 1 1 auto;
    align-content: start;
    gap: 0.125rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;

    list-style: none;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
}

li {
    min-width: 0;
}

button,
a {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    min-height: 1.75rem;
    padding: 0.15rem 0.45rem;

    color: oklch(0.28 0.04 255);
    font: inherit;
    text-align: left;
    text-decoration: none;

    background: transparent;
    border: 0;
    border-radius: 0.35rem;
}

button {
    cursor: pointer;
    user-select: none;
}

a,
.file-button {
    grid-template-columns: 1rem minmax(0, 1fr);
}

button:hover,
a:hover {
    background: oklch(0.92 0.04 245);
}

a:focus-visible,
button:focus-visible {
    outline: 2px solid oklch(0.55 0.14 250);
    outline-offset: 2px;
}

.name {
    overflow: hidden;

    text-overflow: ellipsis;
    white-space: nowrap;
}

.directory-mark,
.chevron,
.file-mark {
    position: relative;

    width: 1rem;
    height: 1rem;
}

.directory-mark::before,
.directory-mark::after,
.chevron::before,
.file-mark::before {
    position: absolute;

    content: "";
}

.directory-mark::before {
    top: 0.32rem;
    left: 0.14rem;

    width: 0.7rem;
    height: 0.45rem;

    background: oklch(0.72 0.08 85);
    border-radius: 0.12rem;
}

.directory-mark::after {
    top: 0.22rem;
    left: 0.18rem;

    width: 0.38rem;
    height: 0.18rem;

    background: oklch(0.78 0.09 85);
    border-radius: 0.12rem 0.12rem 0 0;
}

.chevron::before {
    top: 0.32rem;
    right: 0.25rem;

    width: 0.4rem;
    height: 0.4rem;

    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;

    transform: rotate(-45deg);
    transform-origin: center;
}

.file-mark::before {
    top: 0.32rem;
    left: 0.32rem;

    width: 0.35rem;
    height: 0.35rem;

    background: oklch(0.58 0.1 180);
    border-radius: 999px;
}

.selected {
    color: oklch(0.22 0.08 255);
    font-weight: 700;

    background: oklch(0.9 0.05 225);
}

.active > a,
.active > button {
    color: oklch(0.22 0.08 255);
    font-weight: 700;

    background: oklch(0.86 0.06 205);
}

.note-column-footer {
    flex: 0 0 auto;
    position: relative;
    margin-top: auto;
    padding: 0.45rem 0.45rem 0;
}

.new-menu {
    position: relative;
}

.new-menu-trigger {
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 1.85rem;

    color: oklch(0.29 0.07 180);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 700;
    text-align: center;
    text-transform: uppercase;

    background: oklch(0.95 0.025 155);
    border: 1px solid oklch(0.74 0.06 155);
}

.new-menu-trigger:hover:not(:disabled),
.new-menu.open .new-menu-trigger {
    background: oklch(0.89 0.045 155);
}

.new-menu-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.new-menu-chevron {
    position: relative;

    width: 0.75rem;
    height: 0.75rem;
}

.new-menu-chevron::before {
    position: absolute;
    top: 0.22rem;
    left: 0.18rem;

    width: 0.35rem;
    height: 0.35rem;

    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;

    content: "";
    transform: rotate(45deg);
    transform-origin: center;
}

.new-menu.open .new-menu-chevron::before {
    top: 0.34rem;

    transform: rotate(225deg);
}
</style>
