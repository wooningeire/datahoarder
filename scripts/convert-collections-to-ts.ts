import {
    parseDatahoarderCollection,
    type CollectionDefinition,
    type CollectionField,
    type CollectionSource,
    type CollectionSummaryDefinition,
    type CollectionView,
} from "../src/lib/collections/index.ts";

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

function formatCollectionDefinitionAsTypeScript(definition: CollectionDefinition, sourcePath: string) {
    const hasDerivedFields = definition.schema.some((field) => isDerivedField(field));
    const hasTranslatedFormulaFields = definition.schema.some((field) => Boolean(field.formula));
    const imports = hasDerivedFields
        ? "import { collection, derived } from \"datahoarder/collection\";"
        : "import { collection } from \"datahoarder/collection\";";
    const helpers = hasTranslatedFormulaFields
        ? [
            "",
            "const isEmpty = (value: unknown) =>",
            "    value === null ||",
            "    value === undefined ||",
            "    value === \"\" ||",
            "    (Array.isArray(value) && value.length === 0) ||",
            "    (typeof value === \"object\" && !Array.isArray(value) && Object.keys(value).length === 0);",
            "",
            "const numberValue = (value: unknown) => {",
            "    const number = typeof value === \"number\" ? value : Number(value);",
            "",
            "    return Number.isFinite(number) ? number : 0;",
            "};",
            "",
            "const round = (value: number) => Number.isInteger(value) ? value : Number(value.toFixed(6));",
        ].join("\n")
        : "";

    return [
        `// Generated from ${sourcePath.replace(/\\/gu, "/")}.`,
        imports,
        helpers,
        "",
        "export default collection({",
        `    name: ${formatTsValue(definition.name)},`,
        `    source: ${formatSource(definition.source, 1)},`,
        `    schema: ${formatSchema(definition.schema, 1)},`,
        ...(definition.summaries.length ? [`    summaries: ${formatSummaries(definition.summaries, 1)},`] : []),
        `    views: ${formatViews(definition.views, 1)},`,
        "});",
        "",
    ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
}

function formatSchema(fields: CollectionField[], indentLevel: number) {
    if (!fields.length) {
        return "{}";
    }

    const indent = getIndent(indentLevel);
    const childIndent = getIndent(indentLevel + 1);
    const lines = ["{"];

    for (const field of fields) {
        lines.push(`${childIndent}${formatPropertyName(field.name)}: ${formatField(field, indentLevel + 1)},`);
    }

    lines.push(`${indent}}`);

    return lines.join("\n");
}

function formatField(field: CollectionField, indentLevel: number) {
    if (isDerivedField(field)) {
        return formatDerivedField(field);
    }

    if (field.options.length) {
        return formatTsObject(
            {
                options: field.options,
                type: field.type,
            },
            indentLevel,
        );
    }

    return formatTsValue(field.type || "text");
}

function formatDerivedField(field: CollectionField) {
    const expression = field.formula
        ? translateFormulaToTypeScript(field.formula)
        : "\"\"";

    return field.formula
        ? `derived(({ value }) => ${expression})`
        : `derived(() => ${expression})`;
}

function translateFormulaToTypeScript(formula: string) {
    const expression = normalizeFormula(formula);

    if (!expression) {
        return "\"\"";
    }

    const conditional = parseConditionalFormula(expression);

    if (conditional) {
        return `${translateFormulaCondition(conditional.condition)} ? ${translateFormulaExpression(conditional.trueExpression)} : ${translateFormulaExpression(conditional.falseExpression)}`;
    }

    return translateFormulaExpression(expression);
}

function parseConditionalFormula(expression: string) {
    if (!expression.toLowerCase().startsWith("if(") || !expression.endsWith(")")) {
        return null;
    }

    const args = splitFormulaArguments(expression.slice(3, -1));

    if (args.length !== 3) {
        return null;
    }

    return {
        condition: args[0],
        falseExpression: args[2],
        trueExpression: args[1],
    };
}

function translateFormulaCondition(expression: string) {
    const emptyMatch = expression.trim().match(/^note\["([^"]+)"\]\.isEmpty\(\)$/iu);

    if (emptyMatch) {
        return `isEmpty(value(${formatTsValue(emptyMatch[1])}))`;
    }

    throw new Error(`Unsupported formula condition: ${expression}`);
}

function translateFormulaExpression(expression: string) {
    const trimmed = expression.trim();
    const fieldReference = trimmed.match(/^note\["([^"]+)"\]$/u);

    if (fieldReference) {
        return `value(${formatTsValue(fieldReference[1])})`;
    }

    if (/[+\-*/()]/u.test(trimmed)) {
        const arithmeticExpression = trimmed.replace(/note\["([^"]+)"\]/gu, (_match, field: string) =>
            `numberValue(value(${formatTsValue(field)}))`
        );

        return `round(${arithmeticExpression})`;
    }

    if (/^\d+(?:\.\d+)?$/u.test(trimmed)) {
        return trimmed;
    }

    throw new Error(`Unsupported formula expression: ${expression}`);
}

function splitFormulaArguments(value: string) {
    const args: string[] = [];
    let current = "";
    let quote = "";
    let depth = 0;
    let bracketDepth = 0;

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index] ?? "";

        if (quote) {
            current += character;

            if (character === "\\") {
                index += 1;
                current += value[index] ?? "";
                continue;
            }

            if (character === quote) {
                quote = "";
            }

            continue;
        }

        if (character === "\"" || character === "'") {
            quote = character;
            current += character;
            continue;
        }

        if (character === "(") {
            depth += 1;
        } else if (character === ")") {
            depth = Math.max(0, depth - 1);
        } else if (character === "[") {
            bracketDepth += 1;
        } else if (character === "]") {
            bracketDepth = Math.max(0, bracketDepth - 1);
        }

        if (character === "," && depth === 0 && bracketDepth === 0) {
            args.push(current.trim());
            current = "";
            continue;
        }

        current += character;
    }

    if (current.trim()) {
        args.push(current.trim());
    }

    return args;
}

function normalizeFormula(formula: string) {
    return formula.split(/\s+/u).map((part) => part.trim()).filter(Boolean).join(" ");
}

function isDerivedField(field: CollectionField) {
    const type = field.type.toLowerCase();

    return Boolean(field.formula || type === "formula" || type === "computed");
}

function formatSource(source: CollectionSource, indentLevel: number) {
    const record: Record<string, unknown> = {};

    if (source.files.length) {
        record.files = source.files;
    }

    if (source.folders.length) {
        record.folders = source.folders;
    }

    if (Object.keys(source.match).length) {
        record.match = source.match;
    }

    if (source.tags.length) {
        record.tags = source.tags;
    }

    return formatTsObject(record, indentLevel);
}

function formatSummaries(summaries: CollectionSummaryDefinition[], indentLevel: number) {
    return formatTsArray(
        summaries.map((summary) => ({
            field: summary.field,
            name: summary.name,
            type: summary.type,
        })),
        indentLevel,
    );
}

function formatViews(views: CollectionView[], indentLevel: number) {
    return formatTsArray(
        views.map((view) => ({
            columns: view.columns,
            dateField: view.dateField,
            filter: view.filter,
            groupBy: view.groupBy,
            name: view.name,
            sortColumn: view.sortColumn,
            sortDirection: view.sortDirection,
            type: view.type,
        })),
        indentLevel,
    );
}

function formatTsObject(record: Record<string, unknown>, indentLevel: number) {
    const entries = Object.entries(record).filter(([, value]) => !isEmptyObjectValue(value));

    if (!entries.length) {
        return "{}";
    }

    const indent = getIndent(indentLevel);
    const childIndent = getIndent(indentLevel + 1);
    const lines = ["{"];

    for (const [key, value] of entries) {
        lines.push(`${childIndent}${formatPropertyName(key)}: ${formatTsValue(value, indentLevel + 1)},`);
    }

    lines.push(`${indent}}`);

    return lines.join("\n");
}

function formatTsArray(values: unknown[], indentLevel: number) {
    if (!values.length) {
        return "[]";
    }

    const indent = getIndent(indentLevel);
    const childIndent = getIndent(indentLevel + 1);
    const lines = ["["];

    for (const value of values) {
        lines.push(`${childIndent}${formatTsValue(value, indentLevel + 1)},`);
    }

    lines.push(`${indent}]`);

    return lines.join("\n");
}

function formatTsValue(value: unknown, indentLevel = 0): string {
    if (Array.isArray(value)) {
        return formatTsArray(value, indentLevel);
    }

    if (isRecord(value)) {
        return formatTsObject(value, indentLevel);
    }

    return JSON.stringify(value);
}

function formatPropertyName(name: string) {
    return /^[A-Za-z_$][\w$]*$/u.test(name) ? name : JSON.stringify(name);
}

function isEmptyObjectValue(value: unknown) {
    return (
        value === "" ||
        value === undefined ||
        (Array.isArray(value) && value.length === 0) ||
        (isRecord(value) && Object.keys(value).length === 0)
    );
}

function getIndent(indentLevel: number) {
    return "    ".repeat(indentLevel);
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && !Array.isArray(value) && typeof value === "object";
}
