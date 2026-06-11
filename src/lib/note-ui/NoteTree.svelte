<script lang="ts">
import type { InlineFileCreate } from "../local-vault/shared/types.js";
import type { NoteTreeNode } from "../note-model/tree.js";
import NoteTreeColumn from "./DirectoryTreeColumn.svelte";
import NoteTreeNewMenu from "./NoteTreeNewMenu.svelte";
import {
    buildColumns,
    buildDisplayNodes,
    findActiveDirectoryPaths,
    getDirectoryPathSegments,
    type DisplayDirectory,
} from "./note-tree-model.js";
import {
    areColumnKeysEqual,
    columnCollapseDuration,
    getRemovedColumnSpace,
} from "./note-tree-scroll.js";

type CreateAction = (directoryPath: string) => void | Promise<void>;

type NewMenuBounds = {
    left: number,
    top: number,
    width: number,
};

type Props = {
    activePath: string,
    createDisabled?: boolean,
    createDrawingNote?: CreateAction,
    createNote?: CreateAction,
    createNoteFromTemplate?: CreateAction,
    inlineFileCreate?: InlineFileCreate | null,
    nodes: NoteTreeNode[],
    cancelInlineFileCreate?: () => void,
    onSelect?: (path: string) => void,
    rootLabel?: string,
    submitInlineFileCreate?: () => void,
    updateInlineFileCreateName?: (fileName: string) => void,
};

let {
    activePath,
    createDisabled = false,
    createDrawingNote,
    createNote,
    createNoteFromTemplate,
    inlineFileCreate = null,
    nodes,
    cancelInlineFileCreate,
    onSelect,
    rootLabel = "Notes",
    submitInlineFileCreate,
    updateInlineFileCreateName,
}: Props = $props();

let selectedDirectoryPaths = $state<string[]>([]);
let newMenuBounds = $state<NewMenuBounds | null>(null);
let openNewMenuColumnKey = $state("");
let noteColumnsElement: HTMLDivElement | undefined = $state();
let collapsingColumnSpace = $state(0);
let collapseAnimating = $state(false);
let renderedColumnKeys: string[] = [];
let pendingCollapseSpace = 0;
let collapseAnimationTimeout: number | undefined;

let displayNodes = $derived(buildDisplayNodes(nodes, inlineFileCreate));
let activeDirectoryPaths = $derived(findActiveDirectoryPaths(displayNodes, activePath));
let inlineCreateDirectoryPaths = $derived(
    inlineFileCreate ? getDirectoryPathSegments(inlineFileCreate.directoryPath) : [],
);
let columns = $derived(buildColumns(displayNodes, selectedDirectoryPaths, rootLabel));
let hasCreateActions = $derived(Boolean(createDrawingNote || createNote || createNoteFromTemplate));
let openNewMenuColumn = $derived(columns.find((column) => column.key === openNewMenuColumnKey));

$effect(() => {
    selectedDirectoryPaths = inlineFileCreate ? inlineCreateDirectoryPaths : activeDirectoryPaths;
});

$effect(() => {
    if (createDisabled) {
        closeNewMenu();
    }
});

$effect(() => {
    if (openNewMenuColumnKey && !openNewMenuColumn) {
        closeNewMenu();
    }
});

$effect.pre(() => {
    const node = noteColumnsElement;
    const nextKeys = columns.map((column) => column.key);

    if (!node) {
        return;
    }

    if (renderedColumnKeys.length <= nextKeys.length) {
        return;
    }

    const nextKeySet = new Set(nextKeys);
    const removedSpace = getRemovedColumnSpace(node, nextKeySet);

    if (removedSpace <= 0) {
        return;
    }

    if (collapseAnimationTimeout !== undefined) {
        window.clearTimeout(collapseAnimationTimeout);
        collapseAnimationTimeout = undefined;
    }

    pendingCollapseSpace = removedSpace;
    collapseAnimating = false;
    collapsingColumnSpace = removedSpace;
});

$effect(() => {
    const node = noteColumnsElement;
    const nextKeys = columns.map((column) => column.key);
    const previousKeys = renderedColumnKeys;
    const removedColumns = previousKeys.length > nextKeys.length;
    const collapseSpace = pendingCollapseSpace;

    renderedColumnKeys = nextKeys;

    if (!node || !removedColumns) {
        return;
    }

    requestAnimationFrame(() => {
        if (!areColumnKeysEqual(renderedColumnKeys, nextKeys)) {
            return;
        }

        animateCollapsedColumns(node, collapseSpace);
    });
});

const selectDirectory = (node: DisplayDirectory, level: number): void => {
    selectedDirectoryPaths = [...selectedDirectoryPaths.slice(0, level), node.path];
};

const toggleNewMenu = (columnKey: string, event: MouseEvent): void => {
    if (openNewMenuColumnKey === columnKey) {
        closeNewMenu();
        return;
    }

    const triggerRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    openNewMenuColumnKey = columnKey;
    newMenuBounds = getNewMenuBounds(triggerRect);
};

const createInColumn = async (
    create: CreateAction,
    directoryPath: string,
): Promise<void> => {
    closeNewMenu();
    await create(directoryPath);
};

const closeNewMenu = (): void => {
    openNewMenuColumnKey = "";
    newMenuBounds = null;
};

const getNewMenuBounds = (triggerRect: DOMRect): NewMenuBounds => {
    const gap = 4;
    const estimatedMenuHeight = 112;
    const columnsRect = noteColumnsElement?.getBoundingClientRect();
    const boundaryTop = Math.max(0, columnsRect?.top ?? 0);
    const boundaryBottom = Math.min(window.innerHeight, columnsRect?.bottom ?? window.innerHeight);
    const opensBelow = triggerRect.bottom + gap + estimatedMenuHeight <= boundaryBottom;
    const top = opensBelow
        ? triggerRect.bottom + gap
        : Math.max(boundaryTop + gap, triggerRect.top - gap - estimatedMenuHeight);

    return {
        left: triggerRect.left,
        top,
        width: triggerRect.width,
    };
};

const animateCollapsedColumns = (node: HTMLElement, reservedSpace: number): void => {
    const nextScrollLeft = Math.max(0, getMaxScrollLeft(node) - reservedSpace);

    node.scrollTo({
        left: nextScrollLeft,
        behavior: "smooth",
    });

    window.requestAnimationFrame(() => {
        if (!node.isConnected) {
            return;
        }

        collapseAnimating = true;
        collapsingColumnSpace = 0;
        pendingCollapseSpace = 0;
        collapseAnimationTimeout = window.setTimeout(() => {
            collapseAnimating = false;
            collapseAnimationTimeout = undefined;
        }, columnCollapseDuration);
    });
};

const getMaxScrollLeft = (node: HTMLElement): number => Math.max(0, node.scrollWidth - node.clientWidth);
</script>

<div
    class:collapsing-columns={collapseAnimating}
    class="note-columns"
    aria-label="Directory columns"
    bind:this={noteColumnsElement}
    style:--collapsing-column-space={`${collapsingColumnSpace}px`}
>
    {#each columns as column (column.key)}
        <NoteTreeColumn
            {activePath}
            {cancelInlineFileCreate}
            {column}
            {createDisabled}
            {hasCreateActions}
            {inlineFileCreate}
            isLastColumn={column.level === columns.length - 1}
            {onSelect}
            {openNewMenuColumnKey}
            {selectedDirectoryPaths}
            {selectDirectory}
            {submitInlineFileCreate}
            {toggleNewMenu}
            {updateInlineFileCreateName}
        />
    {/each}
    <NoteTreeNewMenu
        bounds={newMenuBounds}
        column={openNewMenuColumn}
        {createDrawingNote}
        {createInColumn}
        {createNote}
        {createNoteFromTemplate}
        {hasCreateActions}
    />
</div>

<style lang="scss">
.note-columns {
    --note-column-width: 14rem;

    display: grid;
    grid-auto-columns: var(--note-column-width);
    grid-auto-flow: column;
    grid-template-rows: minmax(0, 1fr);
    gap: 0.5rem;
    align-items: stretch;
    height: 100%;
    min-height: 0;
    padding-bottom: 0.35rem;
    padding-right: var(--collapsing-column-space, 0);
    overflow: auto;

    overscroll-behavior: contain;
}

.note-columns.collapsing-columns {
    transition: padding-right 220ms ease;
}

@media (prefers-reduced-motion: reduce) {
    .note-columns.collapsing-columns {
        transition-duration: 1ms;
    }
}
</style>
