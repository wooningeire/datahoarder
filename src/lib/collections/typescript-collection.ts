import ts from "typescript";
import {
    booleanField,
    collection,
    derived,
    enumField,
    numberField,
    objectField,
    textField,
    value,
    type CollectionFieldInput,
    type CollectionFieldInputObject,
    type CollectionSchemaInput,
    type TypeScriptCollectionInput,
} from "./dsl.js";
import type {
    CollectionDefinition,
    CollectionField,
    CollectionSource,
    CollectionSummaryDefinition,
    CollectionView,
} from "./types.js";
import type { VaultPropertyValue } from "../vault/index.js";
import { collectionFilePattern } from "./types.js";

type CollectionModule = {
    default?: unknown;
};

const allowedCollectionModuleSpecifiers = new Set([
    "@vaie/datahoarder/collection",
    "@vaie/datahoarder/collections",
    "datahoarder/collection",
    "datahoarder/collections",
]);

const collectionApi = {
    booleanField,
    collection,
    derived,
    enumField,
    numberField,
    objectField,
    textField,
    value,
};

export const parseTypeScriptCollection = (content: string, path = ""): CollectionDefinition => {
    const exportedDefinition = evaluateTypeScriptCollection(content, path);
    const definition = normalizeTypeScriptCollectionDefinition(exportedDefinition, path);

    return {
        ...definition,
        sourceFormat: "typescript",
    };
};

const evaluateTypeScriptCollection = (content: string, path: string) => {
    const transpiled = ts.transpileModule(content, {
        compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: path || "collection.ts",
        reportDiagnostics: true,
    });
    const blockingDiagnostics = transpiled.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];

    if (blockingDiagnostics.length) {
        throw new Error(formatTypeScriptCollectionDiagnostics(blockingDiagnostics));
    }

    const module: {
        exports: CollectionModule;
    } = {
        exports: {},
    };
    const exports = module.exports;
    const requireCollectionModule = (specifier: string) => {
        if (allowedCollectionModuleSpecifiers.has(specifier)) {
            return collectionApi;
        }

        throw new Error(`Unsupported import in ${path || "collection.ts"}: ${specifier}`);
    };
    const apiNames = Object.keys(collectionApi);
    const apiValues = Object.values(collectionApi);
    const runner = new Function(
        "exports",
        "module",
        "require",
        ...apiNames,
        `"use strict";\n${transpiled.outputText}`,
    );

    runner(exports, module, requireCollectionModule, ...apiValues);

    return module.exports.default ?? module.exports;
};

const normalizeTypeScriptCollectionDefinition = (
    input: unknown,
    path: string,
): CollectionDefinition => {
    const record = asRecord(input) as TypeScriptCollectionInput;
    const views = parseViews(record.views);

    return {
        name: toStringValue(record.name) || getCollectionName(path),
        path,
        readOnly: true,
        schema: parseSchema(record.schema),
        source: parseSource(record.source),
        sourceFormat: "typescript",
        summaries: parseSummaries(record.summaries),
        views: views.length ? views : [createFallbackCollectionView()],
    };
};

const parseSchema = (value: unknown): CollectionField[] => {
    const fields: CollectionField[] = [];

    collectSchemaFields(fields, "", asRecord(value) as CollectionSchemaInput);

    return fields;
};

const collectSchemaFields = (
    fields: CollectionField[],
    prefix: string,
    schema: CollectionSchemaInput,
) => {
    for (const [name, field] of Object.entries(schema)) {
        const fieldName = prefix ? `${prefix}.${name}` : name;

        if (isSchemaGroup(field)) {
            collectSchemaFields(fields, fieldName, getSchemaGroupFields(field));
            continue;
        }

        fields.push(normalizeField(fieldName, field));
    }
};

const normalizeField = (name: string, field: CollectionFieldInput): CollectionField => {
    if (typeof field === "string") {
        return {
            formula: "",
            name,
            options: [],
            type: field || "text",
        };
    }

    const record = asRecord(field) as CollectionFieldInputObject;

    return {
        derive: typeof record.derive === "function" ? record.derive : undefined,
        formula: toStringValue(record.formula),
        name,
        options: toStringList(record.options),
        readOnly: Boolean(record.readOnly || record.derive),
        type: toStringValue(record.type) || (record.derive ? "computed" : "text"),
    };
};

const isSchemaGroup = (field: CollectionFieldInput): field is CollectionFieldInputObject => {
    if (!isRecord(field)) {
        return false;
    }

    return "fields" in field || !("type" in field || "derive" in field || "formula" in field || "options" in field);
};

const getSchemaGroupFields = (field: CollectionFieldInputObject): CollectionSchemaInput => {
    if (isRecord(field.fields)) {
        return field.fields as CollectionSchemaInput;
    }

    return field as CollectionSchemaInput;
};

const parseSource = (value: unknown): CollectionSource => {
    const source = asRecord(value);

    return {
        files: toStringList(source.files).map(normalizeSourcePath),
        folders: toStringList(source.folders ?? source.folder).map(normalizeSourcePath),
        match: asRecord(source.match) as Record<string, VaultPropertyValue>,
        tags: toStringList(source.tags ?? source.tag).map((tag) => tag.replace(/^#/u, "")),
    };
};

const parseViews = (value: unknown): CollectionView[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((view, index) => {
        const record = asRecord(view);
        const type = toStringValue(record.type) || "table";

        return {
            columns: toStringList(record.columns),
            dateField: toStringValue(record.dateField ?? record.date_field ?? record.date),
            filter: toStringValue(record.filter ?? record.query ?? record.search),
            groupBy: toStringValue(record.groupBy ?? record.group_by ?? record.group),
            name: toStringValue(record.name) || `${capitalize(type)} ${index + 1}`,
            sortColumn: toStringValue(record.sortBy ?? record.sort_by ?? record.sortColumn ?? record.sort_column),
            sortDirection: getCollectionSortDirection(toStringValue(record.sortDirection ?? record.sort_direction ?? record.direction)),
            type,
        };
    });
};

const parseSummaries = (value: unknown): CollectionSummaryDefinition[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((summary, index) => {
        const record = asRecord(summary);
        const type = toStringValue(record.type) || "count";

        return {
            field: toStringValue(record.field ?? record.by ?? record.groupBy ?? record.group_by ?? record.group),
            name: toStringValue(record.name) || `${capitalize(type)} ${index + 1}`,
            type,
        };
    });
};

const createFallbackCollectionView = (): CollectionView => ({
    columns: ["title", "tags", "updatedAt"],
    dateField: "",
    filter: "",
    groupBy: "",
    name: "Table",
    sortColumn: "",
    sortDirection: "asc",
    type: "table",
});

const getCollectionSortDirection = (value: string): "asc" | "desc" =>
    /^(?:desc|descending)$/iu.test(value.trim()) ? "desc" : "asc";

const formatTypeScriptCollectionDiagnostics = (diagnostics: ts.Diagnostic[]) =>
    diagnostics
        .map((diagnostic) => {
            const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

            if (!diagnostic.file || diagnostic.start === undefined) {
                return message;
            }

            const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

            return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}: ${message}`;
        })
        .join("\n");

const toStringList = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.flatMap(toStringList);
    }

    if (value === null || value === undefined || typeof value === "object") {
        return [];
    }

    return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
};

const toStringValue = (value: unknown) => {
    if (value === null || value === undefined || typeof value === "object") {
        return "";
    }

    return String(value);
};

const getCollectionName = (path: string) =>
    path.split("/").at(-1)?.replace(collectionFilePattern, "") || "Collection";

const normalizeSourcePath = (path: string) => {
    const rootRelative = path.trim().startsWith("/");
    const normalizedPath = normalizePath(path);

    return rootRelative && normalizedPath ? `/${normalizedPath}` : normalizedPath;
};

const normalizePath = (path: string) => {
    const segments: string[] = [];

    for (const segment of path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").split("/")) {
        if (!segment || segment === ".") {
            continue;
        }

        if (segment === "..") {
            segments.pop();
            continue;
        }

        segments.push(segment);
    }

    return segments.join("/");
};

const capitalize = (value: string) => value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;

const asRecord = (value: unknown): Record<string, unknown> =>
    isRecord(value) ? value : {};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && !Array.isArray(value) && typeof value === "object";
