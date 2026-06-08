import { formatObsidianBaseAsCollectionYaml } from "../src/lib/collections/index.ts";

type ConvertOptions = {
    outDir: string;
    root: string;
    writeBesideBase: boolean;
};

type BaseFile = {
    absolutePath: string;
    relativePath: string;
};

const options = parseOptions(Deno.args);
const baseFiles = await findBaseFiles(options.root);

if (!baseFiles.length) {
    console.log(`No .base files found under ${options.root}`);
    Deno.exit(0);
}

for (const file of baseFiles) {
    const content = await Deno.readTextFile(file.absolutePath);
    const converted = formatObsidianBaseAsCollectionYaml(content, file.relativePath);
    const outputPath = getOutputPath(file, options);

    await Deno.mkdir(getDirectoryPath(outputPath), { recursive: true });
    await Deno.writeTextFile(outputPath, converted);
    console.log(`${file.relativePath} -> ${outputPath}`);
}

console.log(`Converted ${baseFiles.length} Obsidian base files.`);

function parseOptions(args: string[]): ConvertOptions {
    let root = "";
    let outDir = "";
    let writeBesideBase = false;

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
            writeBesideBase = true;
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

    if (!outDir && !writeBesideBase) {
        throw new Error("Choose --out <directory> for a mirrored conversion or --write to write beside each .base file.");
    }

    return {
        outDir: outDir ? normalizePath(outDir) : "",
        root: normalizePath(root),
        writeBesideBase
    };
}

function printUsage() {
    console.log([
        "Usage:",
        "    deno run -A scripts/convert-obsidian-bases.ts <root> --out <directory>",
        "    deno run -A scripts/convert-obsidian-bases.ts <root> --write",
        "",
        "The --out mode mirrors converted .collection.yaml files into a separate directory.",
        "The --write mode writes Base.collection.yaml beside each Base.base file."
    ].join("\n"));
}

async function findBaseFiles(root: string) {
    const files: BaseFile[] = [];

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

            if (!entry.isFile || !entry.name.toLowerCase().endsWith(".base")) {
                continue;
            }

            files.push({
                absolutePath: path,
                relativePath: getRelativePath(root, path)
            });
        }
    }

    await visit(root);

    return files.sort((fileA, fileB) => fileA.relativePath.localeCompare(fileB.relativePath));
}

function getOutputPath(file: BaseFile, options: ConvertOptions) {
    const convertedRelativePath = file.relativePath.replace(/\.base$/iu, ".collection.yaml");

    if (options.writeBesideBase) {
        return file.absolutePath.replace(/\.base$/iu, ".collection.yaml");
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
