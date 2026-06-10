import type { CollectionDefinition } from "./types.js";

export const serializeCollectionDefinition = (definition: CollectionDefinition) => {
    const lines: string[] = [
        `name: ${formatYamlScalar(definition.name)}`,
        "source:",
        "    folders:",
    ];

    for (const folder of definition.source.folders) {
        lines.push(`        - ${formatYamlScalar(folder)}`);
    }

    if (definition.schema.length) {
        lines.push("schema:");

        for (const field of definition.schema) {
            if (field.formula) {
                lines.push(`    ${formatYamlKey(field.name)}:`);
                lines.push("        type: formula");
                lines.push(`        formula: ${formatYamlScalar(field.formula)}`);
                continue;
            }

            lines.push(`    ${formatYamlKey(field.name)}: ${field.type}`);
        }
    }

    if (definition.summaries.length) {
        lines.push("summaries:");

        for (const summary of definition.summaries) {
            lines.push(`    - name: ${formatYamlScalar(summary.name)}`);
            lines.push(`      type: ${summary.type}`);

            if (summary.field) {
                lines.push(`      field: ${formatYamlScalar(summary.field)}`);
            }
        }
    }

    lines.push("views:");

    for (const view of definition.views) {
        lines.push(`    - type: ${view.type}`);
        lines.push(`      name: ${formatYamlScalar(view.name)}`);

        if (view.filter) {
            lines.push(`      filter: ${formatYamlScalar(view.filter)}`);
        }

        if (view.sortColumn) {
            lines.push(`      sortBy: ${formatYamlScalar(view.sortColumn)}`);
            lines.push(`      sortDirection: ${view.sortDirection}`);
        }

        if (view.columns.length) {
            lines.push("      columns:");

            for (const column of view.columns) {
                lines.push(`          - ${formatYamlScalar(column)}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
};

const formatYamlKey = (key: string) => {
    return /^[A-Za-z_][A-Za-z0-9_-]*$/u.test(key) ? key : formatYamlScalar(key);
};

const formatYamlScalar = (value: string) => {
    if (!value) {
        return "\"\"";
    }

    if (/^[A-Za-z0-9_.@#/-]+$/u.test(value)) {
        return value;
    }

    if (!value.includes("'")) {
        return `'${value}'`;
    }

    return `"${value.replace(/"/gu, "\"\"")}"`;
};
