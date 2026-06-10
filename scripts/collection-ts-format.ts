import type {
    CollectionDefinition,
    CollectionField,
    CollectionSource,
    CollectionSummaryDefinition,
    CollectionView,
} from "../src/lib/collections/index.ts";

export const formatCollectionDefinitionAsTypeScript = (
    definition: CollectionDefinition,
    sourcePath: string,
) => {
    const hasDerivedFields = definition.schema.some((field) => isDerivedField(field));
    const hasTranslatedFormulaFields = definition.schema.some((field) => Boolean(field.formula));
    const imports = hasDerivedFields
        ? "import { collection, derived } from \"datahoarder/collection\";"
        : "import { collection } from \"datahoarder/collection\";";
    const helpers = hasTranslatedFormulaFields ? getFormulaHelperSource() : "";

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
};

const getFormulaHelperSource = () => {
    return [
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
    ].join("\n");
};

const formatSchema = (fields: CollectionField[], indentLevel: number) => {
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
};

const formatField = (field: CollectionField, indentLevel: number) => {
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
};

const formatDerivedField = (field: CollectionField) => {
    const expression = field.formula
        ? translateFormulaToTypeScript(field.formula)
        : "\"\"";

    return field.formula
        ? `derived(({ value }) => ${expression})`
        : `derived(() => ${expression})`;
};

const translateFormulaToTypeScript = (formula: string) => {
    const expression = normalizeFormula(formula);

    if (!expression) {
        return "\"\"";
    }

    const conditional = parseConditionalFormula(expression);

    if (conditional) {
        return `${translateFormulaCondition(conditional.condition)} ? ${translateFormulaExpression(conditional.trueExpression)} : ${translateFormulaExpression(conditional.falseExpression)}`;
    }

    return translateFormulaExpression(expression);
};

const parseConditionalFormula = (expression: string) => {
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
};

const translateFormulaCondition = (expression: string) => {
    const emptyMatch = expression.trim().match(/^note\["([^"]+)"\]\.isEmpty\(\)$/iu);

    if (emptyMatch) {
        return `isEmpty(value(${formatTsValue(emptyMatch[1])}))`;
    }

    throw new Error(`Unsupported formula condition: ${expression}`);
};

const translateFormulaExpression = (expression: string) => {
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
};

const splitFormulaArguments = (value: string) => {
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
};

const normalizeFormula = (formula: string) => {
    return formula.split(/\s+/u).map((part) => part.trim()).filter(Boolean).join(" ");
};

const isDerivedField = (field: CollectionField) => {
    const type = field.type.toLowerCase();

    return Boolean(field.formula || type === "formula" || type === "computed");
};

const formatSource = (source: CollectionSource, indentLevel: number) => {
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
};

const formatSummaries = (summaries: CollectionSummaryDefinition[], indentLevel: number) => {
    return formatTsArray(
        summaries.map((summary) => ({
            field: summary.field,
            name: summary.name,
            type: summary.type,
        })),
        indentLevel,
    );
};

const formatViews = (views: CollectionView[], indentLevel: number) => {
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
};

const formatTsObject = (record: Record<string, unknown>, indentLevel: number) => {
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
};

const formatTsArray = (values: unknown[], indentLevel: number) => {
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
};

const formatTsValue = (value: unknown, indentLevel = 0): string => {
    if (Array.isArray(value)) {
        return formatTsArray(value, indentLevel);
    }

    if (isRecord(value)) {
        return formatTsObject(value, indentLevel);
    }

    return JSON.stringify(value);
};

const formatPropertyName = (name: string) => {
    return /^[A-Za-z_$][\w$]*$/u.test(name) ? name : JSON.stringify(name);
};

const isEmptyObjectValue = (value: unknown) => {
    return (
        value === "" ||
        value === undefined ||
        (Array.isArray(value) && value.length === 0) ||
        (isRecord(value) && Object.keys(value).length === 0)
    );
};

const getIndent = (indentLevel: number) => {
    return "    ".repeat(indentLevel);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return Boolean(value) && !Array.isArray(value) && typeof value === "object";
};
