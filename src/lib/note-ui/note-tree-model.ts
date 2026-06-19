import type { InlineFileCreate } from "../local-vault/shared/types.js";
import type { NoteTreeFile, NoteTreeNode } from "../note-model/tree.js";

export type DisplayDirectory = {
    kind: "directory",
    name: string,
    path: string,
    children: DisplayNode[],
};

export type PendingFileNode = {
    id: string,
    kind: "pending-file",
    name: string,
    path: string,
};

export type DisplayNode = DisplayDirectory | NoteTreeFile | PendingFileNode;

export type NoteColumn = {
    directoryPath: string,
    key: string,
    label: string,
    level: number,
    items: DisplayNode[],
};

export const buildColumns = (
    rootNodes: DisplayNode[],
    selectedPaths: string[],
    rootColumnLabel: string,
): NoteColumn[] => {
    const nextColumns: NoteColumn[] = [
        {
            key: "root",
            directoryPath: "",
            label: rootColumnLabel,
            level: 0,
            items: rootNodes,
        },
    ];
    let currentItems = rootNodes;

    for (const path of selectedPaths) {
        const selectedDirectory = currentItems.find(
            (item): item is DisplayDirectory => item.kind === "directory" && item.path === path,
        );

        if (!selectedDirectory) {
            break;
        }

        nextColumns.push({
            key: selectedDirectory.path,
            directoryPath: selectedDirectory.path,
            label: selectedDirectory.name,
            level: nextColumns.length,
            items: selectedDirectory.children,
        });
        currentItems = selectedDirectory.children;
    }

    return nextColumns;
};

export const buildDisplayNodes = (
    rootNodes: NoteTreeNode[],
    pendingCreate: InlineFileCreate | null,
): DisplayNode[] => {
    const nextNodes = cloneDisplayNodes(rootNodes);

    if (!pendingCreate) {
        return nextNodes;
    }

    const parent = ensureDisplayDirectory(nextNodes, pendingCreate.directoryPath);

    parent.push({
        id: pendingCreate.id,
        kind: "pending-file",
        name: pendingCreate.fileName,
        path: `__pending-file-create__:${pendingCreate.id}`,
    });
    sortDisplayNodes(nextNodes);

    return nextNodes;
};

export const findActiveDirectoryPaths = (
    rootNodes: DisplayNode[],
    currentPath: string,
): string[] => {
    if (!currentPath) {
        return [];
    }

    for (const node of rootNodes) {
        if (node.kind !== "directory" || !isPathInsideDirectory(currentPath, node.path)) {
            continue;
        }

        return [node.path, ...findActiveDirectoryPaths(node.children, currentPath)];
    }

    return [];
};

export const reconcileSelectedDirectoryPaths = (
    selectedPaths: string[],
    activePaths: string[],
): string[] => {
    if (isDirectoryBranchPrefix(activePaths, selectedPaths)) {
        return selectedPaths;
    }

    return activePaths;
};

export const getDirectoryPathSegments = (directoryPath: string): string[] => {
    const paths: string[] = [];
    let currentPath = "";

    for (const segment of directoryPath.split("/").filter(Boolean)) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        paths.push(currentPath);
    }

    return paths;
};

const cloneDisplayNodes = (rootNodes: NoteTreeNode[]): DisplayNode[] => rootNodes.map((node) => {
    if (node.kind === "file") {
        return node;
    }

    return {
        ...node,
        children: cloneDisplayNodes(node.children),
    };
});

const ensureDisplayDirectory = (
    rootNodes: DisplayNode[],
    directoryPath: string,
): DisplayNode[] => {
    if (!directoryPath) {
        return rootNodes;
    }

    let currentNodes = rootNodes;
    let currentPath = "";

    for (const segment of directoryPath.split("/").filter(Boolean)) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;

        let directory = currentNodes.find(
            (node): node is DisplayDirectory => node.kind === "directory" && node.path === currentPath,
        );

        if (!directory) {
            directory = {
                kind: "directory",
                name: segment,
                path: currentPath,
                children: [],
            };
            currentNodes.push(directory);
        }

        currentNodes = directory.children;
    }

    return currentNodes;
};

const sortDisplayNodes = (rootNodes: DisplayNode[]): void => {
    rootNodes.sort((a, b) => {
        if (a.kind !== b.kind) {
            return a.kind === "directory" ? -1 : b.kind === "directory" ? 1 : 0;
        }

        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });

    for (const node of rootNodes) {
        if (node.kind === "directory") {
            sortDisplayNodes(node.children);
        }
    }
};

const isDirectoryBranchPrefix = (ancestorPaths: string[], descendantPaths: string[]): boolean => (
    ancestorPaths.every((path, index) => descendantPaths[index] === path)
);

const isPathInsideDirectory = (path: string, directoryPath: string): boolean => path.startsWith(`${directoryPath}/`);
