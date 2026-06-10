import type { SimpleYamlValue } from "../shared/simple-yaml.js";
import { parseSimpleYaml } from "../shared/simple-yaml.js";
import { parseTypeScriptCollection } from "./typescript-collection.js";
import { normalizeSourcePath } from "./source.js";
import {
    collectionFilePattern,
    type CollectionDefinition,
    type CollectionMatchRule,
    type CollectionMatchRuleObject,
    type CollectionSource,
    type CollectionView,
} from "./types.js";

export const parseDatahoarderCollection = (content: string, path = ""): CollectionDefinition => {
    if (isTypeScriptCollectionFile(path)) {
        return parseTypeScriptCollection(content, path);
    }

    const root = asRecord(parseSimpleYaml(content));
    const schema = parseSchema(root.schema);
    const views = parseViews(root.views);

    return {
        name: toStringValue(root.name) || getCollectionName(path),
        path,
        schema,
        source: parseSource(root.source),
        sourceFormat: "datahoarder",
        summaries: parseSummaries(root.summaries ?? root.metrics),
        views: views.length ? views : [createFallbackCollectionView()],
    };
};

export const isTypeScriptCollectionFile = (path: string) => {
    return /\.collection\.ts$/iu.test(path);
};

export const createFallbackCollectionView = (): CollectionView => {
    return {
        columns: [],
        dateField: "",
        filter: "",
        groupBy: "",
        name: "Table",
        sortColumn: "",
        sortDirection: "asc",
        type: "table",
    };
};

const parseSource = (value: SimpleYamlValue | undefined): CollectionSource => {
    const source = asRecord(value);

    return {
        files: toStringList(source.files).map(normalizeSourcePath),
        folders: toStringList(source.folders ?? source.folder).map(normalizeSourcePath),
        match: parseMatch(source.match),
        tags: toStringList(source.tags ?? source.tag).map((tag) => tag.replace(/^#/u, "")),
    };
};

const parseSchema = (value: SimpleYamlValue | undefined) => {
    const schema = asRecord(value);

    return Object.entries(schema).map(([name, field]) => {
        if (isRecord(field)) {
            const formula = toStringValue(field.formula ?? field.expression ?? field.expr ?? field.value);

            return {
                formula,
                name,
                options: toStringList(field.options ?? field.values ?? field.choices),
                type: toStringValue(field.type) || (formula ? "formula" : "text"),
            };
        }

        return {
            formula: "",
            name,
            options: [],
            type: toStringValue(field) || "text",
        };
    });
};

const parseViews = (value: SimpleYamlValue | undefined) => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((view, index) => {
        const record = asRecord(view);
        const type = toStringValue(record.type) || "table";
        const sort = parseCollectionViewSort(record);

        return {
            columns: toStringList(record.columns),
            dateField: toStringValue(
                record.dateField ??
                    record.date_field ??
                    record.dateBy ??
                    record.date_by ??
                    record.date ??
                    record.timeField ??
                    record.time_field,
            ),
            filter: toStringValue(record.filter ?? record.query ?? record.search),
            groupBy: toStringValue(record.groupBy ?? record.group_by ?? record.group),
            name: toStringValue(record.name) || `${capitalize(type)} ${index + 1}`,
            sortColumn: sort.column,
            sortDirection: sort.direction,
            type,
        };
    });
};

const parseCollectionViewSort = (record: Record<string, SimpleYamlValue>) => {
    const sort = record.sort;
    const sortRecord = asRecord(sort);
    const rawSortText = toStringValue(sort);
    const sortTextMatch = rawSortText.match(/^(.+?)\s+(asc|ascending|desc|descending)$/iu);
    const column =
        toStringValue(
            record.sortBy ??
                record.sort_by ??
                record.sortColumn ??
                record.sort_column ??
                record.orderBy ??
                record.order_by ??
                sortRecord.by ??
                sortRecord.field ??
                sortRecord.column,
        ) || (sortTextMatch ? sortTextMatch[1].trim() : rawSortText);
    const direction = getCollectionSortDirection(
        toStringValue(
            record.sortDirection ??
                record.sort_direction ??
                record.direction ??
                record.order ??
                sortRecord.direction ??
                sortRecord.order,
        ) || (sortTextMatch ? sortTextMatch[2] : ""),
    );

    return { column, direction };
};

const getCollectionSortDirection = (value: string): "asc" | "desc" => {
    return /^(?:desc|descending)$/iu.test(value.trim()) ? "desc" : "asc";
};

const parseSummaries = (value: SimpleYamlValue | undefined) => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((summary, index) => {
        const record = asRecord(summary);
        const type = toStringValue(record.type) || "count";
        const field = toStringValue(record.field ?? record.by ?? record.groupBy ?? record.group_by ?? record.group);

        return {
            field,
            name: toStringValue(record.name) || `${capitalize(type)} ${index + 1}`,
            type,
        };
    });
};

const parseMatch = (value: SimpleYamlValue | undefined): Record<string, CollectionMatchRule> => {
    const match = asRecord(value);
    const rules: Record<string, CollectionMatchRule> = {};

    for (const [key, rule] of Object.entries(match)) {
        if (isRecord(rule)) {
            const ruleObject: CollectionMatchRuleObject = {};

            if ("equals" in rule) {
                ruleObject.equals = rule.equals;
            }

            if (typeof rule.exists === "boolean") {
                ruleObject.exists = rule.exists;
            }

            if ("includes" in rule) {
                ruleObject.includes = rule.includes;
            }

            rules[key] = ruleObject;
            continue;
        }

        rules[key] = rule;
    }

    return rules;
};

const toStringList = (value: SimpleYamlValue | undefined): string[] => {
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

const toStringValue = (value: SimpleYamlValue | undefined) => {
    if (value === null || value === undefined || typeof value === "object") {
        return "";
    }

    return String(value);
};

const getCollectionName = (path: string) => {
    return path.split("/").at(-1)?.replace(collectionFilePattern, "") || "Collection";
};

const capitalize = (value: string) => {
    return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
};

const asRecord = (value: SimpleYamlValue | undefined): Record<string, SimpleYamlValue> => {
    return isRecord(value) ? value : {};
};

const isRecord = (value: SimpleYamlValue | undefined): value is Record<string, SimpleYamlValue> => {
    return Boolean(value) && !Array.isArray(value) && typeof value === "object";
};
