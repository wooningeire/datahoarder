type SortableVaultDirectory = {
    path: string,
};

const ignoredLocalDirectoryNames = new Set([".git", ".svelte-kit", "build", "dist", "node_modules"]);

export const isIgnoredLocalDirectoryName = (name: string) => ignoredLocalDirectoryNames.has(name);

export const assertManageableLocalDirectoryPath = (path: string) => {
    if (path.split("/").some(isIgnoredLocalDirectoryName)) {
        throw new Error("This folder name is reserved by the vault index.");
    }
};

export const sortLocalVaultDirectories = <T extends SortableVaultDirectory>(directories: T[]) => {
    return directories.sort((a, b) => a.path.localeCompare(b.path, undefined, {
        numeric: true,
        sensitivity: "base",
    }));
};
