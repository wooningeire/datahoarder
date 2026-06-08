import type { SimpleYamlValue } from "../shared/simple-yaml.js";
import { parseSimpleYaml } from "../shared/simple-yaml.js";
import { getDirectoryPath } from "../vault/paths.js";
import type {
	CollectionDefinition,
	CollectionField,
	CollectionSummaryDefinition,
	CollectionView
} from "./types.js";

type ParsedBaseView = {
	folders: string[];
	summaries: CollectionSummaryDefinition[];
	view: CollectionView;
};

const obsidianBaseFilePattern = /\.base$/iu;

export function isObsidianBaseFile(path: string) {
	return obsidianBaseFilePattern.test(path);
}

export function parseObsidianBaseCollection(content: string, path = ""): CollectionDefinition {
	const root = asRecord(parseSimpleYaml(content));
	const formulas = getFormulaBlocks(content);
	const rootFilterExpressions = getFilterExpressions(root.filters);
	const rootFolders = rootFilterExpressions.flatMap(getFilterFolder);
	const viewResults = parseObsidianBaseViews(root.views, rootFilterExpressions, path);
	const sourceFolders = rootFolders.length ? rootFolders : viewResults.flatMap((view) => view.folders);
	const views = viewResults.map((view) => view.view);
	const schema = createObsidianBaseSchema(views, formulas);

	return {
		name: getObsidianBaseName(path),
		path,
		readOnly: true,
		schema,
		source: {
			files: [],
			folders: uniqueStrings(sourceFolders.map((folder) => rebaseSourceFolder(folder, path))),
			match: {},
			tags: []
		},
		sourceFormat: "obsidian-base",
		summaries: uniqueSummaries(viewResults.flatMap((view) => view.summaries)),
		views: views.length ? views : [createFallbackBaseView()]
	};
}

export function formatObsidianBaseAsCollectionYaml(content: string, path = "") {
	return serializeCollectionDefinition(parseObsidianBaseCollection(content, path));
}

function parseObsidianBaseViews(
	value: SimpleYamlValue | undefined,
	rootFilterExpressions: string[],
	path: string
): ParsedBaseView[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map((view, index) => {
		const record = asRecord(view);
		const filterExpressions = [...rootFilterExpressions, ...getFilterExpressions(record.filters)];
		const folders = filterExpressions.flatMap(getFilterFolder);
		const convertedFilters = filterExpressions
			.filter((expression) => !getFilterFolder(expression).length)
			.map(convertFilterExpression)
			.filter(Boolean);
		const type = toStringValue(record.type) || "table";
		const sort = parseObsidianBaseSort(record.sort);

		return {
			folders,
			summaries: parseObsidianBaseSummaries(record.summaries),
			view: {
				columns: toStringList(record.order ?? record.columns).map(normalizeObsidianColumn),
				dateField: "",
				filter: convertedFilters.join(" "),
				groupBy: "",
				name: toStringValue(record.name) || `${capitalize(type)} ${index + 1}`,
				sortColumn: normalizeObsidianColumn(sort.column),
				sortDirection: sort.direction,
				type
			}
		};
	});
}

function createObsidianBaseSchema(views: CollectionView[], formulas: Record<string, string>) {
	const fields = new Map<string, CollectionField>();

	for (const [name, formula] of Object.entries(formulas)) {
		const fieldName = `formula.${name}`;

		fields.set(fieldName.toLowerCase(), {
			formula: normalizeFormulaWhitespace(formula),
			name: fieldName,
			options: [],
			type: "formula"
		});
	}

	for (const view of views) {
		for (const column of view.columns) {
			if (isBuiltinObsidianColumn(column) || fields.has(column.toLowerCase())) {
				continue;
			}

			fields.set(column.toLowerCase(), {
				formula: "",
				name: column,
				options: [],
				type: inferFieldType(column)
			});
		}
	}

	return [...fields.values()];
}

function getFormulaBlocks(content: string) {
	const formulas: Record<string, string> = {};
	const lines = content.split(/\r?\n/u);
	const formulasStart = findTopLevelKey(lines, "formulas");

	if (formulasStart < 0) {
		return formulas;
	}

	let cursor = formulasStart + 1;

	while (cursor < lines.length) {
		const line = lines[cursor];

		if (line.trim() && getIndent(line) === 0) {
			break;
		}

		const match = line.match(/^\s{2}([^:]+):\s*(.*)$/u);

		if (!match) {
			cursor += 1;
			continue;
		}

		const name = cleanYamlScalar(match[1]);
		const value = match[2].trim();

		if (value === "|-" || value === "|") {
			const block = getIndentedBlock(lines, cursor + 1, getIndent(line));

			formulas[name] = block.text;
			cursor = block.end;
			continue;
		}

		formulas[name] = cleanYamlScalar(value);
		cursor += 1;
	}

	return formulas;
}

function getIndentedBlock(lines: string[], start: number, parentIndent: number) {
	let end = start;
	const blockLines: string[] = [];

	while (end < lines.length) {
		const line = lines[end];

		if (line.trim() && getIndent(line) <= parentIndent) {
			break;
		}

		blockLines.push(line);
		end += 1;
	}

	const contentIndent = Math.min(
		...blockLines.filter((line) => line.trim()).map(getIndent)
	);
	const safeIndent = Number.isFinite(contentIndent) ? contentIndent : parentIndent + 2;

	return {
		end,
		text: blockLines.map((line) => line.slice(Math.min(getIndent(line), safeIndent))).join("\n").trim()
	};
}

function getFilterExpressions(value: SimpleYamlValue | undefined): string[] {
	if (!value) {
		return [];
	}

	if (typeof value === "string") {
		return [value];
	}

	if (Array.isArray(value)) {
		return value.flatMap(getFilterExpressions);
	}

	if (typeof value !== "object") {
		return [];
	}

	const record = value as Record<string, SimpleYamlValue>;

	return [
		...getFilterExpressions(record.and),
		...getFilterExpressions(record.filter),
		...getFilterExpressions(record.where)
	];
}

function getFilterFolder(expression: string) {
	const match = expression.trim().match(/^file\.inFolder\((["'])(.+?)\1\)$/iu);

	return match?.[2] ? [match[2]] : [];
}

function convertFilterExpression(expression: string) {
	const trimmedExpression = expression.trim();
	const comparison = trimmedExpression.match(/^(?:note\["([^"]+)"\]|([^!=]+?))\s*(!=|==)\s*(.+)$/u);

	if (comparison) {
		const field = comparison[1] || comparison[2].trim();
		const operator = comparison[3];
		const value = cleanYamlScalar(comparison[4].trim());
		const prefix = operator === "!=" ? "-" : "";

		return `${prefix}${formatQueryField(field)}=${formatQueryValue(value)}`;
	}

	const isEmpty = trimmedExpression.match(/^note\["([^"]+)"\]\.isEmpty\(\)$/u);

	if (isEmpty) {
		return `-${formatQueryField(isEmpty[1])}=*`;
	}

	return trimmedExpression;
}

function parseObsidianBaseSort(value: SimpleYamlValue | undefined) {
	const sort = Array.isArray(value) ? asRecord(value[0]) : asRecord(value);
	const direction = toStringValue(sort.direction).toLowerCase() === "desc" ? "desc" : "asc";

	return {
		column: toStringValue(sort.property ?? sort.field ?? sort.column),
		direction: direction as "asc" | "desc"
	};
}

function parseObsidianBaseSummaries(value: SimpleYamlValue | undefined): CollectionSummaryDefinition[] {
	const summaries = asRecord(value);

	return Object.entries(summaries).map(([field, type]) => ({
		field: normalizeObsidianColumn(field),
		name: getSummaryName(field, toStringValue(type)),
		type: normalizeSummaryType(toStringValue(type))
	}));
}

function normalizeSummaryType(type: string) {
	const normalizedType = type.toLowerCase();

	if (normalizedType === "unique") {
		return "countBy";
	}

	return normalizedType || "count";
}

function getSummaryName(field: string, type: string) {
	return type ? `${field} ${type}` : field;
}

function normalizeObsidianColumn(column: string) {
	const trimmedColumn = column.trim();
	const normalizedColumn = trimmedColumn.toLowerCase();

	if (normalizedColumn.startsWith("note.")) {
		return trimmedColumn.slice(5);
	}

	switch (normalizedColumn) {
		case "file.name":
			return "basename";
		case "file.path":
			return "path";
		case "file.folder":
			return "folder";
		case "file.size":
			return "size";
		case "file.ctime":
		case "file.mtime":
			return "updatedAt";
		default:
			return trimmedColumn;
	}
}

function rebaseSourceFolder(folder: string, path: string) {
	const normalizedFolder = normalizePath(folder);
	const folderSegments = normalizedFolder.split("/").filter(Boolean);
	const folderParent = folderSegments.slice(0, -1);
	const folderTail = folderSegments.slice(-1);
	const directorySegments = getDirectoryPath(path).split("/").filter(Boolean);
	const maxSuffixLength = Math.min(folderParent.length, directorySegments.length);

	for (let suffixLength = maxSuffixLength; suffixLength > 0; suffixLength -= 1) {
		const folderSuffix = folderParent.slice(folderParent.length - suffixLength);
		const directorySuffix = directorySegments.slice(directorySegments.length - suffixLength);

		if (segmentsEqual(folderSuffix, directorySuffix)) {
			return folderTail.join("/") || normalizedFolder;
		}
	}

	return normalizedFolder;
}

function serializeCollectionDefinition(definition: CollectionDefinition) {
	const lines: string[] = [
		`name: ${formatYamlScalar(definition.name)}`,
		"source:",
		"    folders:"
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
}

function createFallbackBaseView(): CollectionView {
	return {
		columns: [],
		dateField: "",
		filter: "",
		groupBy: "",
		name: "Table",
		sortColumn: "",
		sortDirection: "asc",
		type: "table"
	};
}

function isBuiltinObsidianColumn(column: string) {
	return ["basename", "folder", "path", "preview", "size", "tags", "title", "updatedat"].includes(column.toLowerCase());
}

function inferFieldType(field: string) {
	const normalizedField = field.toLowerCase();

	if (/(?:date|created|edited|due|start)$/u.test(normalizedField)) {
		return "date";
	}

	if (/(?:days|hourly|annual|pay|rate|size|hr completed)/u.test(normalizedField)) {
		return "number";
	}

	if (/^(?:auto|dropped|fleeting|scrapbook)$/u.test(normalizedField) || /(?:^| )clear(?: |$)/u.test(normalizedField)) {
		return "boolean";
	}

	return "text";
}

function formatQueryField(field: string) {
	return /^[A-Za-z_][A-Za-z0-9_-]*$/u.test(field) ? field : formatQueryToken(field);
}

function formatQueryValue(value: string) {
	return /^[A-Za-z0-9_.@#/-]+$/u.test(value) ? value : formatQueryToken(value);
}

function formatQueryToken(value: string) {
	return `"${value.replace(/(["\\])/gu, "\\$1")}"`;
}

function formatYamlKey(key: string) {
	return /^[A-Za-z_][A-Za-z0-9_-]*$/u.test(key) ? key : formatYamlScalar(key);
}

function formatYamlScalar(value: string) {
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
}

function normalizeFormulaWhitespace(formula: string) {
	return formula.split(/\s+/u).map((part) => part.trim()).filter(Boolean).join(" ");
}

function normalizePath(path: string) {
	return path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
}

function segmentsEqual(left: string[], right: string[]) {
	return left.length === right.length && left.every((segment, index) =>
		segment.toLowerCase() === right[index].toLowerCase()
	);
}

function uniqueStrings(values: string[]) {
	const seen = new Set<string>();
	const unique: string[] = [];

	for (const value of values) {
		const normalizedValue = value.trim();
		const key = normalizedValue.toLowerCase();

		if (!normalizedValue || seen.has(key)) {
			continue;
		}

		seen.add(key);
		unique.push(normalizedValue);
	}

	return unique;
}

function uniqueSummaries(summaries: CollectionSummaryDefinition[]) {
	const seen = new Set<string>();
	const unique: CollectionSummaryDefinition[] = [];

	for (const summary of summaries) {
		const key = `${summary.type}\0${summary.field}\0${summary.name}`.toLowerCase();

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		unique.push(summary);
	}

	return unique;
}

function getObsidianBaseName(path: string) {
	const directory = getDirectoryPath(path);
	const folderName = directory.split("/").filter(Boolean).at(-1);

	return folderName || "Base";
}

function findTopLevelKey(lines: string[], key: string) {
	const normalizedKey = key.toLowerCase();

	return lines.findIndex((line) =>
		getIndent(line) === 0 &&
		line.trim().toLowerCase() === `${normalizedKey}:`
	);
}

function getIndent(line: string) {
	return line.match(/^\s*/u)?.[0].replace(/\t/gu, "  ").length ?? 0;
}

function cleanYamlScalar(value: string) {
	const trimmedValue = value.trim();
	const quote = trimmedValue[0];

	if ((quote === "\"" || quote === "'") && trimmedValue.at(-1) === quote) {
		return trimmedValue.slice(1, -1);
	}

	return trimmedValue;
}

function toStringList(value: SimpleYamlValue | undefined): string[] {
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
}

function toStringValue(value: SimpleYamlValue | undefined) {
	if (value === null || value === undefined || typeof value === "object") {
		return "";
	}

	return String(value);
}

function asRecord(value: SimpleYamlValue | undefined): Record<string, SimpleYamlValue> {
	return Boolean(value) && !Array.isArray(value) && typeof value === "object"
		? value as Record<string, SimpleYamlValue>
		: {};
}

function capitalize(value: string) {
	return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
