<script lang="ts">
import { untrack } from "svelte";
import type { InlineFileCreate } from "../local-vault/shared/types.js";
import type { NoteTreeNode } from "../note-model/tree.js";
import NoteTreeColumn from "./DirectoryTreeColumn.svelte";
import {
    buildColumns,
    buildDisplayNodes,
    findActiveDirectoryPaths,
    getDirectoryPathSegments,
    reconcileSelectedDirectoryPaths,
    type DisplayDirectory,
} from "./note-tree-model.js";
import {
    areColumnKeysEqual,
    columnCollapseDuration,
    getRemovedColumnSpace,
} from "./note-tree-scroll.js";

type CreateAction = (directoryPath: string) => void | Promise<void>;
type DraggedTreeItem = {
    kind: "directory" | "file",
    path: string,
};
type PointerTreeDrag = {
    item: DraggedTreeItem,
    pointerId: number,
    startX: number,
    startY: number,
    isDragging: boolean,
};
type MoveDirectoryAction = (directoryPath: string, targetDirectoryPath: string) => void | Promise<void>;
type MoveFileAction = (filePath: string, directoryPath: string) => void | Promise<void>;

type Props = {
    activePath: string,
    createDisabled?: boolean,
    createDrawingNote?: CreateAction,
    createFolder?: CreateAction,
    createNote?: CreateAction,
    createNoteFromTemplate?: CreateAction,
    inlineFileCreate?: InlineFileCreate | null,
    moveDisabled?: boolean,
    moveDirectoryToDirectory?: MoveDirectoryAction,
    moveFileToDirectory?: MoveFileAction,
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
    createFolder,
    createNote,
    createNoteFromTemplate,
    inlineFileCreate = null,
    moveDisabled = false,
    moveDirectoryToDirectory,
    moveFileToDirectory,
    nodes,
    cancelInlineFileCreate,
    onSelect,
    rootLabel = "Notes",
    submitInlineFileCreate,
    updateInlineFileCreateName,
}: Props = $props();

let selectedDirectoryPaths = $state<string[]>([]);
let openNewMenuColumnKey = $state("");
let noteColumnsElement: HTMLDivElement | undefined = $state();
let collapsingColumnSpace = $state(0);
let collapseAnimating = $state(false);
let draggedItem = $state<DraggedTreeItem | null>(null);
let dropTargetDirectoryPath = $state<string | null>(null);
let renderedColumnKeys: string[] = [];
let pendingCollapseSpace = 0;
let collapseAnimationTimeout: number | undefined;
let pointerDrag: PointerTreeDrag | null = null;
let stopPointerDragListeners: (() => void) | undefined;
let suppressedClickPath: string | null = null;

const pointerDragStartDistance = 4;

let displayNodes = $derived(buildDisplayNodes(nodes, inlineFileCreate));
let activeDirectoryPaths = $derived(findActiveDirectoryPaths(displayNodes, activePath));
let inlineCreateDirectoryPaths = $derived(
    inlineFileCreate ? getDirectoryPathSegments(inlineFileCreate.directoryPath) : [],
);
let columns = $derived(buildColumns(displayNodes, selectedDirectoryPaths, rootLabel));
let hasCreateActions = $derived(Boolean(createDrawingNote || createFolder || createNote || createNoteFromTemplate));
let openNewMenuColumn = $derived(columns.find((column) => column.key === openNewMenuColumnKey));
let canMoveDirectories = $derived(Boolean(moveDirectoryToDirectory) && !moveDisabled);
let canMoveFiles = $derived(Boolean(moveFileToDirectory) && !moveDisabled);

$effect(() => {
    const currentDirectoryPaths = untrack(() => selectedDirectoryPaths);
    const nextDirectoryPaths = inlineFileCreate
        ? inlineCreateDirectoryPaths
        : reconcileSelectedDirectoryPaths(currentDirectoryPaths, activeDirectoryPaths);

    if (nextDirectoryPaths !== currentDirectoryPaths) {
        selectedDirectoryPaths = nextDirectoryPaths;
    }
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
    selectedDirectoryPaths = [
        ...selectedDirectoryPaths.slice(0, level),
        node.path,
    ];
};

const toggleNewMenu = (columnKey: string): void => {
    if (openNewMenuColumnKey === columnKey) {
        closeNewMenu();
        return;
    }

    openNewMenuColumnKey = columnKey;
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
};

const startDirectoryDrag = (event: PointerEvent, directoryPath: string): void => {
    startTreeItemDrag(event, {
        kind: "directory",
        path: directoryPath,
    });
};

const startFileDrag = (event: PointerEvent, filePath: string): void => {
    startTreeItemDrag(event, {
        kind: "file",
        path: filePath,
    });
};

const startTreeItemDrag = (event: PointerEvent, item: DraggedTreeItem): void => {
    if (event.button !== 0 || !canMoveTreeItem(item)) {
        return;
    }

    closeNewMenu();
    stopPointerDragListeners?.();
    pointerDrag = {
        item,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        isDragging: false,
    };

    window.addEventListener("pointermove", movePointerTreeItem);
    window.addEventListener("pointerup", finishPointerTreeItemDrag);
    window.addEventListener("pointercancel", cancelPointerTreeItemDrag);
    stopPointerDragListeners = () => {
        window.removeEventListener("pointermove", movePointerTreeItem);
        window.removeEventListener("pointerup", finishPointerTreeItemDrag);
        window.removeEventListener("pointercancel", cancelPointerTreeItemDrag);
    };
};

const movePointerTreeItem = (event: PointerEvent): void => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) {
        return;
    }

    const dragDistance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);

    if (!pointerDrag.isDragging) {
        if (dragDistance < pointerDragStartDistance) {
            return;
        }

        pointerDrag.isDragging = true;
        draggedItem = pointerDrag.item;
        dropTargetDirectoryPath = null;
        suppressedClickPath = pointerDrag.item.path;
    }

    event.preventDefault();
    updatePointerDropTarget(event.clientX, event.clientY);
};

const finishPointerTreeItemDrag = (event: PointerEvent): void => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) {
        return;
    }

    const drag = pointerDrag;

    if (!drag.isDragging) {
        clearPointerDrag();
        return;
    }

    event.preventDefault();
    updatePointerDropTarget(event.clientX, event.clientY);

    const targetDirectoryPath = dropTargetDirectoryPath;

    clearPointerDrag();
    scheduleSuppressedClickReset(drag.item.path);

    if (targetDirectoryPath !== null && canDropItemInDirectory(drag.item, targetDirectoryPath)) {
        void moveTreeItemToDirectory(drag.item, targetDirectoryPath);
    }
};

const cancelPointerTreeItemDrag = (event: PointerEvent): void => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) {
        return;
    }

    const drag = pointerDrag;

    clearPointerDrag();

    if (drag.isDragging) {
        scheduleSuppressedClickReset(drag.item.path);
    }
};

const updatePointerDropTarget = (clientX: number, clientY: number): void => {
    const directoryPath = getPointerDropDirectoryPath(clientX, clientY);

    if (!draggedItem || directoryPath === null || !canDropItemInDirectory(draggedItem, directoryPath)) {
        dropTargetDirectoryPath = null;
        return;
    }

    dropTargetDirectoryPath = directoryPath;
};

const getPointerDropDirectoryPath = (clientX: number, clientY: number): string | null => {
    const target = document.elementFromPoint(clientX, clientY);

    if (!(target instanceof Element)) {
        return null;
    }

    const dropTarget = target.closest<HTMLElement>("[data-drop-directory-path]");

    return dropTarget?.dataset.dropDirectoryPath ?? null;
};

const moveTreeItemToDirectory = async (item: DraggedTreeItem, directoryPath: string): Promise<void> => {
    if (item.kind === "directory") {
        await moveDirectoryToDirectory?.(item.path, directoryPath);
        return;
    }

    await moveFileToDirectory?.(item.path, directoryPath);
};

const cancelTreeItemClick = (path: string): boolean => {
    if (suppressedClickPath !== path) {
        return false;
    }

    suppressedClickPath = null;
    return true;
};

const scheduleSuppressedClickReset = (path: string): void => {
    suppressedClickPath = path;
    window.setTimeout(() => {
        if (suppressedClickPath === path) {
            suppressedClickPath = null;
        }
    }, 100);
};

const clearPointerDrag = (): void => {
    stopPointerDragListeners?.();
    stopPointerDragListeners = undefined;
    pointerDrag = null;
    clearTreeItemDrag();
};

const isDraggingDirectory = (directoryPath: string): boolean => draggedItem?.kind === "directory" && draggedItem.path === directoryPath;

const isDraggingFile = (filePath: string): boolean => draggedItem?.kind === "file" && draggedItem.path === filePath;

const isDirectoryDropTarget = (directoryPath: string): boolean => dropTargetDirectoryPath === directoryPath;

const canDropInDirectory = (directoryPath: string): boolean => canDropItemInDirectory(draggedItem, directoryPath);

const canDropItemInDirectory = (item: DraggedTreeItem | null, directoryPath: string): boolean => {
    if (!item || !canMoveTreeItem(item)) {
        return false;
    }

    if (getParentDirectoryPath(item.path) === directoryPath) {
        return false;
    }

    if (item.kind === "file") {
        return true;
    }

    return item.path !== directoryPath && !isPathInsideDirectory(directoryPath, item.path);
};

const canMoveTreeItem = (item: DraggedTreeItem): boolean => item.kind === "directory" ? canMoveDirectories : canMoveFiles;

const getParentDirectoryPath = (filePath: string): string => {
    const segments = filePath.split("/");

    segments.pop();
    return segments.join("/");
};

const isPathInsideDirectory = (path: string, directoryPath: string): boolean => Boolean(directoryPath) && path.startsWith(`${directoryPath}/`);

const clearTreeItemDrag = (): void => {
    draggedItem = null;
    dropTargetDirectoryPath = null;
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
    class:tree-dragging={Boolean(draggedItem)}
    class="note-columns"
    aria-label="Directory columns"
    bind:this={noteColumnsElement}
    style:--collapsing-column-space={`${collapsingColumnSpace}px`}
>
    {#each columns as column (column.key)}
        <NoteTreeColumn
            {activePath}
            {cancelInlineFileCreate}
            {closeNewMenu}
            {column}
            {createDrawingNote}
            {createDisabled}
            {createFolder}
            {createInColumn}
            {createNote}
            {createNoteFromTemplate}
            {cancelTreeItemClick}
            {hasCreateActions}
            {inlineFileCreate}
            {isDirectoryDropTarget}
            {isDraggingDirectory}
            {isDraggingFile}
            isLastColumn={column.level === columns.length - 1}
            {canDropInDirectory}
            {canMoveDirectories}
            {canMoveFiles}
            {onSelect}
            {openNewMenuColumnKey}
            {selectedDirectoryPaths}
            {selectDirectory}
            {startDirectoryDrag}
            {startFileDrag}
            {submitInlineFileCreate}
            {toggleNewMenu}
            {updateInlineFileCreateName}
        />
    {/each}
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
