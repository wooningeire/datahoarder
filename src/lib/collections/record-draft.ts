import {
    formatVaultValue,
    type VaultPropertyValue,
} from "../vault/index.js";
import { isComputedCollectionField } from "./formula.js";
import {
    getCollectionRecordFolder,
    hasExplicitSource,
    hasValue,
    isBuiltinCollectionField,
    isMatchRuleObject,
    isUnsupportedBuiltinMatchField,
    normalizePath,
    valueIncludes,
    valuesEqual,
} from "./source.js";
import type {
    CollectionDefinition,
    CollectionMatchRule,
    CollectionRecordDraft,
} from "./types.js";

export const getCollectionRecordCreationError = (definition: CollectionDefinition) => {
    if (definition.readOnly) {
        return "Converted Obsidian bases are read-only until saved as a Datahoarder collection.";
    }

    if (!hasExplicitSource(definition.source)) {
        return "Add a collection source before creating records.";
    }

    if (definition.source.files.length) {
        return "Collections with exact file sources cannot create matching records.";
    }

    const unsupportedBuiltinMatch = Object.keys(definition.source.match).find(isUnsupportedBuiltinMatchField);

    if (unsupportedBuiltinMatch) {
        return `Cannot create records for a collection that matches built-in field "${unsupportedBuiltinMatch}".`;
    }

    return "";
};

export const createCollectionRecordDraft = (
    definition: CollectionDefinition,
    title: string,
): CollectionRecordDraft => {
    const normalizedTitle = title.trim() || "Untitled";
    const error = getCollectionRecordCreationError(definition);

    if (error) {
        throw new Error(error);
    }

    const folder = getCollectionRecordFolder(definition.path, definition.source);
    const fields = getCollectionRecordFields(definition, normalizedTitle);
    const fieldLines = fields.map(([key, value]) => `${key}:: ${formatInlinePropertyValue(value)}`);
    const content = [`# ${normalizedTitle}`, "", ...fieldLines, ""].join("\n");
    const fileName = `${slugifyTitle(normalizedTitle)}.md`;

    return {
        content,
        path: normalizePath(folder ? `${folder}/${fileName}` : fileName),
        title: normalizedTitle,
    };
};

const getCollectionRecordFields = (
    definition: CollectionDefinition,
    title: string,
): [string, VaultPropertyValue][] => {
    const fields = new Map<string, VaultPropertyValue>();

    for (const [key, rule] of Object.entries(definition.source.match)) {
        const normalizedKey = key.toLowerCase();

        if (normalizedKey === "title") {
            assertRuleMatchesValue(key, rule, title);
            continue;
        }

        const value = getDefaultMatchRuleValue(key, rule);

        if (value !== undefined) {
            if (normalizedKey === "tags") {
                setMergedFieldValue(fields, "tags", value);
            } else {
                fields.set(key, value);
            }
        }
    }

    if (definition.source.tags.length) {
        setMergedFieldValue(fields, "tags", definition.source.tags);
    }

    const tagsRule = definition.source.match.tags;

    if (tagsRule !== undefined) {
        assertRuleMatchesValue("tags", tagsRule, getCaseInsensitiveValue(fields, "tags") ?? "");
    }

    for (const field of definition.schema) {
        if (isBuiltinCollectionField(field.name) || isComputedCollectionField(field) || hasCaseInsensitiveKey(fields, field.name)) {
            continue;
        }

        fields.set(field.name, "");
    }

    return [...fields.entries()];
};

const getDefaultMatchRuleValue = (key: string, rule: CollectionMatchRule): VaultPropertyValue | undefined => {
    if (!isMatchRuleObject(rule)) {
        return rule;
    }

    if (rule.exists === false && (hasValue(rule.equals ?? "") || hasValue(rule.includes ?? ""))) {
        throw new Error(`Collection match for "${key}" cannot require a missing field and a value.`);
    }

    if ("equals" in rule) {
        if ("includes" in rule && !valueIncludes(rule.equals ?? "", rule.includes)) {
            throw new Error(`Collection match for "${key}" has incompatible equals and includes values.`);
        }

        return rule.equals ?? "";
    }

    if ("includes" in rule) {
        return rule.includes ?? "";
    }

    if (rule.exists === true) {
        return "TODO";
    }

    return undefined;
};

const assertRuleMatchesValue = (key: string, rule: CollectionMatchRule, value: VaultPropertyValue) => {
    if (matchesRuleValue(rule, value)) {
        return;
    }

    throw new Error(`Collection record scaffold cannot satisfy match rule for "${key}".`);
};

const matchesRuleValue = (rule: CollectionMatchRule, value: VaultPropertyValue) => {
    if (isMatchRuleObject(rule)) {
        if (typeof rule.exists === "boolean" && rule.exists !== hasValue(value)) {
            return false;
        }

        if ("equals" in rule && !valuesEqual(value, rule.equals)) {
            return false;
        }

        if ("includes" in rule && !valueIncludes(value, rule.includes)) {
            return false;
        }

        return true;
    }

    return valuesEqual(value, rule);
};

const setMergedFieldValue = (fields: Map<string, VaultPropertyValue>, key: string, value: VaultPropertyValue) => {
    const existingKey = getCaseInsensitiveKey(fields, key) || key;
    const existingValue = fields.get(existingKey);

    fields.set(existingKey, existingValue === undefined ? value : mergeFieldValues(existingValue, value));
};

const mergeFieldValues = (valueA: VaultPropertyValue, valueB: VaultPropertyValue): VaultPropertyValue[] => {
    const values = [...toValueList(valueA), ...toValueList(valueB)];
    const seenValues = new Set<string>();
    const mergedValues: VaultPropertyValue[] = [];

    for (const value of values) {
        const normalizedValue = formatVaultValue(value).toLowerCase();

        if (seenValues.has(normalizedValue)) {
            continue;
        }

        seenValues.add(normalizedValue);
        mergedValues.push(value);
    }

    return mergedValues;
};

const toValueList = (value: VaultPropertyValue): VaultPropertyValue[] => {
    return Array.isArray(value) ? value : [value];
};

const formatInlinePropertyValue = (value: VaultPropertyValue): string => {
    if (Array.isArray(value)) {
        return `[${value.map(formatInlinePropertyValue).join(", ")}]`;
    }

    if (value === null || value === undefined) {
        return "";
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    if (typeof value === "boolean" || typeof value === "number") {
        return String(value);
    }

    return quoteInlineStringIfNeeded(value);
};

const quoteInlineStringIfNeeded = (value: string) => {
    if (!value || /^[\w ./@#-]+$/u.test(value)) {
        return value;
    }

    return JSON.stringify(value);
};

const hasCaseInsensitiveKey = (fields: Map<string, VaultPropertyValue>, key: string) => {
    return Boolean(getCaseInsensitiveKey(fields, key));
};

const getCaseInsensitiveValue = (fields: Map<string, VaultPropertyValue>, key: string) => {
    const matchingKey = getCaseInsensitiveKey(fields, key);

    return matchingKey ? fields.get(matchingKey) : undefined;
};

const getCaseInsensitiveKey = (fields: Map<string, VaultPropertyValue>, key: string) => {
    const normalizedKey = key.toLowerCase();

    for (const fieldKey of fields.keys()) {
        if (fieldKey.toLowerCase() === normalizedKey) {
            return fieldKey;
        }
    }

    return "";
};

const slugifyTitle = (title: string) => {
    const slug = title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "");

    return slug || "untitled";
};
