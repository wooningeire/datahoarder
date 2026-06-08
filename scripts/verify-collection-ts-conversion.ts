import {
    formatCollectionRecordValue,
    resolveDatahoarderCollection,
} from "../src/lib/collections/index.ts";
import {
    buildLocalVaultIndex,
    type VaultIndex,
} from "../src/lib/vault/index.ts";
import type { LocalVaultFile } from "../src/lib/vault/local-files.ts";

type CollectionFile = {
    absolutePath: string;
    relativePath: string;
};

const [notesRootArg = "", convertedRootArg = ""] = Deno.args;

if (!notesRootArg || !convertedRootArg) {
    console.log("Usage: deno run -A --sloppy-imports scripts/verify-collection-ts-conversion.ts <notes-root> <converted-ts-root>");
    Deno.exit(1);
}

const notesRoot = normalizePath(notesRootArg);
const convertedRoot = normalizePath(convertedRootArg);
const yamlFiles = await findCollectionYamlFiles(notesRoot);
const vaultIndex = await buildLocalVaultIndex(await findVaultFiles(notesRoot));
let verified = 0;

for (const yamlFile of yamlFiles) {
    const tsRelativePath = yamlFile.relativePath.replace(/\.collection\.ya?ml$/iu, ".collection.ts");
    const tsAbsolutePath = joinPath(convertedRoot, tsRelativePath);
    const yamlContent = await Deno.readTextFile(yamlFile.absolutePath);
    const tsContent = await Deno.readTextFile(tsAbsolutePath);

    verifyCollectionPair(yamlContent, tsContent, yamlFile.relativePath, tsRelativePath, vaultIndex);
    verified += 1;
    console.log(`Verified ${yamlFile.relativePath} -> ${tsRelativePath}`);
}

console.log(`Verified ${verified} converted collection files.`);

function verifyCollectionPair(
    yamlContent: string,
    tsContent: string,
    yamlPath: string,
    tsPath: string,
    vaultIndex: VaultIndex,
) {
    const yamlDefinition = resolveDatahoarderCollection(yamlContent, yamlPath, vaultIndex).definition;
    const tsDefinition = resolveDatahoarderCollection(tsContent, tsPath, vaultIndex).definition;
    const viewCount = Math.max(yamlDefinition.views.length, tsDefinition.views.length);

    assertEqual(tsDefinition.name, yamlDefinition.name, `${yamlPath} name`);
    assertEqual(tsDefinition.source.folders, yamlDefinition.source.folders, `${yamlPath} source folders`);
    assertEqual(tsDefinition.source.files, yamlDefinition.source.files, `${yamlPath} source files`);
    assertEqual(tsDefinition.source.tags, yamlDefinition.source.tags, `${yamlPath} source tags`);
    assertEqual(tsDefinition.views.length, yamlDefinition.views.length, `${yamlPath} view count`);

    for (let viewIndex = 0; viewIndex < viewCount; viewIndex += 1) {
        const yamlCollection = resolveDatahoarderCollection(yamlContent, yamlPath, vaultIndex, viewIndex);
        const tsCollection = resolveDatahoarderCollection(tsContent, tsPath, vaultIndex, viewIndex);

        assertEqual(tsCollection.columns, yamlCollection.columns, `${yamlPath} view ${viewIndex} columns`);
        assertEqual(
            tsCollection.records.map((record) => record.path),
            yamlCollection.records.map((record) => record.path),
            `${yamlPath} view ${viewIndex} record paths`,
        );

        for (const column of yamlCollection.columns) {
            assertEqual(
                tsCollection.records.map((record) => formatCollectionRecordValue(record, column)),
                yamlCollection.records.map((record) => formatCollectionRecordValue(record, column)),
                `${yamlPath} view ${viewIndex} column ${column}`,
            );
        }
    }
}

async function findCollectionYamlFiles(root: string) {
    const files: CollectionFile[] = [];

    async function visit(directory: string) {
        for await (const entry of Deno.readDir(directory)) {
            const path = joinPath(directory, entry.name);

            if (entry.isDirectory) {
                if ([".git", ".svelte-kit", "node_modules"].includes(entry.name)) {
                    continue;
                }

                await visit(path);
                continue;
            }

            if (!entry.isFile || !/\.collection\.ya?ml$/iu.test(entry.name)) {
                continue;
            }

            files.push({
                absolutePath: path,
                relativePath: getRelativePath(root, path),
            });
        }
    }

    await visit(root);

    return files.sort((fileA, fileB) => fileA.relativePath.localeCompare(fileB.relativePath));
}

async function findVaultFiles(root: string) {
    const files: LocalVaultFile[] = [];

    async function visit(directory: string) {
        for await (const entry of Deno.readDir(directory)) {
            const path = joinPath(directory, entry.name);

            if (entry.isDirectory) {
                if ([".git", ".svelte-kit", "node_modules"].includes(entry.name)) {
                    continue;
                }

                await visit(path);
                continue;
            }

            if (!entry.isFile) {
                continue;
            }

            const relativePath = getRelativePath(root, path);
            const stat = await Deno.stat(path);

            files.push({
                extension: getPathExtension(relativePath),
                handle: {
                    kind: "file",
                    name: relativePath.split("/").at(-1) ?? relativePath,
                    async getFile() {
                        return new File([await Deno.readTextFile(path)], relativePath, {
                            lastModified: stat.mtime?.getTime() ?? Date.now(),
                            type: "text/plain",
                        });
                    },
                },
                path: relativePath,
                routePath: relativePath.replace(/\.(md|svx)$/iu, ""),
                size: stat.size,
                updatedAt: stat.mtime?.getTime() ?? Date.now(),
            });
        }
    }

    await visit(root);

    return files;
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);

    if (actualJson !== expectedJson) {
        throw new Error(`${label} mismatch\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
    }
}

function getRelativePath(root: string, path: string) {
    const rootPath = normalizePath(root).replace(/\/+$/u, "");
    const normalizedPath = normalizePath(path);

    return normalizedPath.slice(rootPath.length).replace(/^\/+/u, "");
}

function getPathExtension(path: string) {
    const fileName = path.split("/").at(-1) ?? "";
    const extensionIndex = fileName.lastIndexOf(".");

    return extensionIndex > 0 ? fileName.slice(extensionIndex).toLowerCase() : "";
}

function joinPath(...parts: string[]) {
    const [firstPart = "", ...restParts] = parts;
    const prefix = firstPart.match(/^[A-Za-z]:/u)?.[0] ?? "";
    const joinedPath = [firstPart, ...restParts]
        .join("/")
        .replace(/\\/gu, "/")
        .replace(/\/+/gu, "/");

    return prefix ? joinedPath.replace(`${prefix}/`, `${prefix}/`) : joinedPath;
}

function normalizePath(path: string) {
    return path.replace(/\\/gu, "/").replace(/\/+$/u, "");
}
