import { parseDatahoarderCollection } from "../src/lib/collections/index.ts";
import { formatCollectionDefinitionAsTypeScript } from "./collection-ts-format.ts";

type ConvertOptions = {
    outDir: string;
    root: string;
    writeBesideCollection: boolean;
};

type CollectionFile = {
    absolutePath: string;
    relativePath: string;
};

const options = parseOptions(Deno.args);
const collectionFiles = await findCollectionFiles(options.root);

if (!collectionFiles.length) {
    console.log(`No .collection.yaml files found under ${options.root}`);
    Deno.exit(0);
}

for (const file of collectionFiles) {
    const content = await Deno.readTextFile(file.absolutePath);
    const definition = parseDatahoarderCollection(content, file.relativePath);
    const converted = formatCollectionDefinitionAsTypeScript(definition, file.relativePath);
    const outputPath = getOutputPath(file, options);

    await Deno.mkdir(getDirectoryPath(outputPath), { recursive: true });
    await Deno.writeTextFile(outputPath, converted);
    console.log(`${file.relativePath} -> ${outputPath}`);
}

console.log(`Converted ${collectionFiles.length} collection YAML files.`);

function parseOptions(args: string[]): ConvertOptions {
    let root = "";
    let outDir = "";
    let writeBesideCollection = false;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index] ?? "";

        if (arg === "--help" || arg === "-h") {
            printUsage();
            Deno.exit(0);
        }

        if (arg === "--out") {
            outDir = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg === "--write") {
            writeBesideCollection = true;
            continue;
        }

        if (!root) {
            root = arg;
            continue;
        }

        throw new Error(`Unexpected argument: ${arg}`);
    }

    if (!root) {
        printUsage();
        throw new Error("A vault or notes root is required.");
    }

    if (!outDir && !writeBesideCollection) {
        throw new Error("Choose --out <directory> for a mirrored conversion or --write to write beside each .collection.yaml file.");
    }

    return {
        outDir: outDir ? normalizePath(outDir) : "",
        root: normalizePath(root),
        writeBesideCollection,
    };
}

function printUsage() {
    console.log([
        "Usage:",
        "    deno run -A --sloppy-imports scripts/convert-collections-to-ts.ts <root> --out <directory>",
        "    deno run -A --sloppy-imports scripts/convert-collections-to-ts.ts <root> --write",
        "",
        "The --out mode mirrors converted .collection.ts files into a separate directory.",
        "The --write mode writes .collection.ts beside each .collection.yaml file.",
    ].join("\n"));
}

async function findCollectionFiles(root: string) {
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

function getOutputPath(file: CollectionFile, options: ConvertOptions) {
    const convertedRelativePath = file.relativePath.replace(/\.collection\.ya?ml$/iu, ".collection.ts");

    if (options.writeBesideCollection) {
        return file.absolutePath.replace(/\.collection\.ya?ml$/iu, ".collection.ts");
    }

    return joinPath(options.outDir, convertedRelativePath);
}

function getRelativePath(root: string, path: string) {
    const rootPath = normalizePath(root).replace(/\/+$/u, "");
    const normalizedPath = normalizePath(path);

    return normalizedPath.slice(rootPath.length).replace(/^\/+/u, "");
}

function getDirectoryPath(path: string) {
    return normalizePath(path).split("/").slice(0, -1).join("/");
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
