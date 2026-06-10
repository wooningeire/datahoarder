import {
    getVaultRecordValue,
    type VaultIndex,
    type VaultPropertyValue,
    type VaultRecord,
} from "../vault/index.js";
import {
    formatObsidianBaseAsCollectionYaml,
    isObsidianBaseFile,
    parseObsidianBaseCollection,
} from "./obsidian-base.js";
import {
    evaluateCollectionFormula,
    isComputedCollectionField,
} from "./formula.js";
import { createFallbackCollectionView, parseDatahoarderCollection } from "./parse.js";
import { formatCollectionRecordValue } from "./records.js";
import { matchesCollectionSource } from "./source.js";
import {
    collectionFilePattern,
    type CollectionDefinition,
    type CollectionKanbanGroup,
    type CollectionSource,
    type CollectionView,
    type ResolvedCollection,
} from "./types.js";

export type {
    CollectionDefinition,
    CollectionExportRow,
    CollectionField,
    CollectionKanbanGroup,
    CollectionMatchRule,
    CollectionMatchRuleObject,
    CollectionRecordDraft,
    CollectionSource,
    CollectionSummaryDefinition,
    CollectionSummaryItem,
    CollectionSummaryResult,
    CollectionTimelineItem,
    CollectionView,
    ResolvedCollection,
} from "./types.js";
export { evaluateCollectionFormula } from "./formula.js";
export {
    booleanField,
    collection,
    derived,
    enumField,
    numberField,
    objectField,
    textField,
    value,
} from "./dsl.js";
export {
    filterCollectionRecords,
    formatCollectionRecordValue,
    getCollectionExportRows,
    getCollectionRecordValue,
    serializeCollectionRecordsAsCsv,
    serializeCollectionRecordsAsJson,
    sortCollectionRecords,
} from "./records.js";
export { summarizeCollectionRecords } from "./summary.js";
export {
    getCollectionTimelineItems,
    sortCollectionRecordsForTimeline,
} from "./timeline.js";
export {
    formatObsidianBaseAsCollectionYaml,
    isObsidianBaseFile,
    parseObsidianBaseCollection,
} from "./obsidian-base.js";
export {
    isTypeScriptCollectionFile,
    parseDatahoarderCollection,
} from "./parse.js";
export {
    createCollectionRecordDraft,
    getCollectionRecordCreationError,
} from "./record-draft.js";

export const isDatahoarderCollectionFile = (path: string) => {
    return collectionFilePattern.test(path);
};

export const resolveDatahoarderCollection = (
    content: string,
    path: string,
    vaultIndex: VaultIndex,
    viewIndex = 0,
): ResolvedCollection => {
    const definition = parseDatahoarderCollection(content, path);

    return resolveCollectionDefinition(definition, vaultIndex, viewIndex);
};

export const resolveObsidianBaseCollection = (
    content: string,
    path: string,
    vaultIndex: VaultIndex,
    viewIndex = 0,
): ResolvedCollection => {
    const definition = parseObsidianBaseCollection(content, path);

    return resolveCollectionDefinition(definition, vaultIndex, viewIndex);
};

export const resolveCollectionDefinition = (
    definition: CollectionDefinition,
    vaultIndex: VaultIndex,
    viewIndex = 0,
): ResolvedCollection => {
    const resolvedView = getCollectionView(definition, viewIndex);
    const view = resolvedView.view;
    const columns = getCollectionColumns(definition, view);
    const records = vaultIndex.records
        .filter((record) => matchesCollectionSource(record, definition.source, definition.path))
        .map((record) => resolveCollectionComputedFields(record, definition));

    return {
        columns,
        definition,
        records,
        view,
        viewIndex: resolvedView.index,
    };
};

export const getCollectionView = (definition: CollectionDefinition, viewIndex = 0) => {
    const fallbackView = createFallbackCollectionView();
    const normalizedViewIndex = Number.isInteger(viewIndex) && viewIndex >= 0 ? viewIndex : 0;
    const resolvedView = definition.views[normalizedViewIndex] ?? definition.views[0] ?? fallbackView;
    const resolvedIndex = definition.views.includes(resolvedView) ? definition.views.indexOf(resolvedView) : 0;

    return {
        index: resolvedIndex,
        view: resolvedView,
    };
};

export const getCollectionField = (definition: CollectionDefinition, column: string) => {
    const normalizedColumn = column.trim().toLowerCase();
    const exactField = definition.schema.find((field) => field.name.toLowerCase() === normalizedColumn);

    if (exactField) {
        return exactField;
    }

    return definition.schema.find((field) => normalizedColumn.startsWith(`${field.name.toLowerCase()}.`)) ?? null;
};

export const getCollectionViewGroupBy = (view: CollectionView) => {
    return view.groupBy || "status";
};

export const getCollectionViewDateField = (view: CollectionView) => {
    return view.dateField || "date";
};

export const groupCollectionRecordsForKanban = (
    records: VaultRecord[],
    groupBy: string,
): CollectionKanbanGroup[] => {
    const groups = new Map<string, CollectionKanbanGroup>();

    for (const record of records) {
        const label = formatCollectionRecordValue(record, groupBy) || "Unassigned";
        const key = label.toLowerCase();
        const group = groups.get(key) ?? {
            key,
            label,
            records: [],
        };

        group.records.push(record);
        groups.set(key, group);
    }

    return [...groups.values()];
};

export const isComputedCollectionColumn = (definition: CollectionDefinition, column: string) => {
    const field = getCollectionField(definition, column);

    return Boolean(field && isComputedCollectionField(field));
};

const getCollectionColumns = (definition: CollectionDefinition, view: CollectionView) => {
    const columns = view.columns.length ? view.columns : ["title", ...definition.schema.map((field) => field.name)];
    const uniqueColumns = [...new Set(columns)];

    return uniqueColumns.length ? uniqueColumns : ["title", "path"];
};

const resolveCollectionComputedFields = (record: VaultRecord, definition: CollectionDefinition): VaultRecord => {
    const computedFields = definition.schema.filter(isComputedCollectionField);

    if (!computedFields.length) {
        return record;
    }

    const properties = { ...record.properties };
    let resolvedRecord: VaultRecord = {
        ...record,
        properties,
    };

    for (const field of computedFields) {
        properties[field.name] = field.derive
            ? field.derive(createCollectionFieldDeriveContext(resolvedRecord))
            : evaluateCollectionFormula(resolvedRecord, field.formula);
        resolvedRecord = {
            ...resolvedRecord,
            properties,
        };
    }

    return resolvedRecord;
};

const createCollectionFieldDeriveContext = (record: VaultRecord) => {
    return {
        record,
        value: (path: string) => getVaultRecordValue(record, path),
        values: createCollectionFieldValues(record),
    };
};

const createCollectionFieldValues = (record: VaultRecord) => {
    return new Proxy({} as Record<string, VaultPropertyValue>, {
        get(_target, property) {
            if (typeof property !== "string") {
                return undefined;
            }

            return getVaultRecordValue(record, property);
        },
    });
};
