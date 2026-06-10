import type { NoteTreeDirectory, NoteTreeNode } from "../note-model/tree.js";
import type { LocalVaultFile } from "./local-files.js";
import { isEditableTextFile } from "./local-file-paths.js";
import { getNoteExtension, type VaultRouteConfig } from "./paths.js";

export const buildLocalVaultTree = (
    files: LocalVaultFile[],
    _config: VaultRouteConfig = {},
) => {
    const root: NoteTreeDirectory = {
        kind: "directory",
        name: "",
        path: "",
        children: [],
    };
    const directoryLookup = new Map<string, NoteTreeDirectory>([["", root]]);

    for (const file of files) {
        const segments = file.path.split("/");
        const fileName = segments.pop();

        if (!fileName) {
            continue;
        }

        let parent = root;
        let parentPath = "";

        for (const segment of segments) {
            parentPath = parentPath ? `${parentPath}/${segment}` : segment;

            let directory = directoryLookup.get(parentPath);

            if (!directory) {
                directory = {
                    kind: "directory",
                    name: segment,
                    path: parentPath,
                    children: [],
                };

                directoryLookup.set(parentPath, directory);
                parent.children.push(directory);
            }

            parent = directory;
        }

        parent.children.push({
            kind: "file",
            name: fileName,
            path: file.path,
            href: file.routePath,
        });
    }

    sortLocalTree(root.children);
    return root.children;
};

export const getTextAssets = (files: LocalVaultFile[]) => {
    return files.filter((file) => isEditableTextFile(file.path) && !getNoteExtension(file.path));
};

const sortLocalTree = (nodes: NoteTreeNode[]) => {
    nodes.sort((a, b) => {
        if (a.kind !== b.kind) {
            return a.kind === "directory" ? -1 : 1;
        }

        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });

    for (const node of nodes) {
        if (node.kind === "directory") {
            sortLocalTree(node.children);
        }
    }
};
