import type { SimpleYamlValue } from './simple-yaml.js';
import { parseSimpleYaml } from './simple-yaml.js';
import { getDirectoryPath } from './paths.js';
import {
	formatVaultValue,
	getVaultRecordValue,
	type VaultIndex,
	type VaultPropertyValue,
	type VaultRecord
} from './vault-index.js';
import {
	getCollectionVaultQueryFields,
	matchVaultRecordQuery,
	parseVaultQuery
} from './vault-query.js';

export type CollectionField = {
	formula: string;
	name: string;
	options: string[];
	type: string;
};

export type CollectionSource = {
	files: string[];
	folders: string[];
	match: Record<string, CollectionMatchRule>;
	tags: string[];
};

export type CollectionMatchRule =
	| VaultPropertyValue
	| CollectionMatchRuleObject;

export type CollectionMatchRuleObject = {
	equals?: VaultPropertyValue;
	exists?: boolean;
	includes?: VaultPropertyValue;
};

export type CollectionView = {
	columns: string[];
	dateField: string;
	filter: string;
	groupBy: string;
	name: string;
	sortColumn: string;
	sortDirection: 'asc' | 'desc';
	type: string;
};

export type CollectionSummaryDefinition = {
	field: string;
	name: string;
	type: string;
};

export type CollectionDefinition = {
	name: string;
	path: string;
	schema: CollectionField[];
	source: CollectionSource;
	summaries: CollectionSummaryDefinition[];
	views: CollectionView[];
};

export type ResolvedCollection = {
	columns: string[];
	definition: CollectionDefinition;
	records: VaultRecord[];
	view: CollectionView;
	viewIndex: number;
};

export type CollectionRecordDraft = {
	content: string;
	path: string;
	title: string;
};

export type CollectionExportRow = Record<string, VaultPropertyValue>;

export type CollectionKanbanGroup = {
	key: string;
	label: string;
	records: VaultRecord[];
};

export type CollectionTimelineItem = {
	dateLabel: string;
	record: VaultRecord;
	timestamp: number | null;
};

export type CollectionSummaryItem = {
	label: string;
	value: string;
};

export type CollectionSummaryResult = {
	items: CollectionSummaryItem[];
	label: string;
	type: string;
	value: string;
};

const collectionFilePattern = /\.(?:dhbase|collection)\.ya?ml$/iu;

export function isDatahoarderCollectionFile(path: string) {
	return collectionFilePattern.test(path);
}

export function parseDatahoarderCollection(content: string, path = ''): CollectionDefinition {
	const root = asRecord(parseSimpleYaml(content));
	const schema = parseSchema(root.schema);
	const views = parseViews(root.views);

	return {
		name: toStringValue(root.name) || getCollectionName(path),
		path,
		schema,
		source: parseSource(root.source),
		summaries: parseSummaries(root.summaries ?? root.metrics),
		views: views.length ? views : [createFallbackCollectionView()]
	};
}

export function resolveDatahoarderCollection(
	content: string,
	path: string,
	vaultIndex: VaultIndex,
	viewIndex = 0
): ResolvedCollection {
	const definition = parseDatahoarderCollection(content, path);
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
		viewIndex: resolvedView.index
	};
}

export function getCollectionView(definition: CollectionDefinition, viewIndex = 0) {
	const fallbackView = createFallbackCollectionView();
	const normalizedViewIndex = Number.isInteger(viewIndex) && viewIndex >= 0 ? viewIndex : 0;
	const resolvedView = definition.views[normalizedViewIndex] ?? definition.views[0] ?? fallbackView;
	const resolvedIndex = definition.views.includes(resolvedView) ? definition.views.indexOf(resolvedView) : 0;

	return {
		index: resolvedIndex,
		view: resolvedView
	};
}

export function getCollectionRecordValue(record: VaultRecord, column: string) {
	return getVaultRecordValue(record, column);
}

export function getCollectionField(definition: CollectionDefinition, column: string) {
	const normalizedColumn = column.trim().toLowerCase();

	return definition.schema.find((field) => field.name.toLowerCase() === normalizedColumn) ?? null;
}

export function formatCollectionRecordValue(record: VaultRecord, column: string) {
	return formatVaultValue(getCollectionRecordValue(record, column));
}

export function sortCollectionRecords(records: VaultRecord[], column: string, direction: 'asc' | 'desc') {
	const sorted = [...records].sort((recordA, recordB) => {
		const valueA = formatCollectionRecordValue(recordA, column);
		const valueB = formatCollectionRecordValue(recordB, column);

		return valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: 'base' });
	});

	return direction === 'desc' ? sorted.reverse() : sorted;
}

export function filterCollectionRecords(records: VaultRecord[], query: string, columns: string[]) {
	const parsedQuery = parseVaultQuery(query);

	if (!parsedQuery.clauses.length) {
		return records;
	}

	return records.filter((record) =>
		matchVaultRecordQuery(record, parsedQuery, {
			textFields: getCollectionVaultQueryFields(record, columns)
		})
	);
}

export function getCollectionViewGroupBy(view: CollectionView) {
	return view.groupBy || 'status';
}

export function getCollectionViewDateField(view: CollectionView) {
	return view.dateField || 'date';
}

export function groupCollectionRecordsForKanban(records: VaultRecord[], groupBy: string): CollectionKanbanGroup[] {
	const groups = new Map<string, CollectionKanbanGroup>();

	for (const record of records) {
		const label = formatCollectionRecordValue(record, groupBy) || 'Unassigned';
		const key = label.toLowerCase();
		const group = groups.get(key) ?? {
			key,
			label,
			records: []
		};

		group.records.push(record);
		groups.set(key, group);
	}

	return [...groups.values()];
}

export function getCollectionTimelineItems(records: VaultRecord[], dateField: string): CollectionTimelineItem[] {
	return sortCollectionRecordsForTimeline(records, dateField).map((record) => {
		const date = getCollectionTimelineDate(getCollectionRecordValue(record, dateField));

		return {
			dateLabel: date?.label ?? 'Undated',
			record,
			timestamp: date?.timestamp ?? null
		};
	});
}

export function sortCollectionRecordsForTimeline(records: VaultRecord[], dateField: string) {
	return records
		.map((record, index) => ({
			index,
			record,
			timestamp: getCollectionTimelineDate(getCollectionRecordValue(record, dateField))?.timestamp ?? null
		}))
		.sort((itemA, itemB) => {
			if (itemA.timestamp === null && itemB.timestamp === null) {
				return itemA.index - itemB.index;
			}

			if (itemA.timestamp === null) {
				return 1;
			}

			if (itemB.timestamp === null) {
				return -1;
			}

			return itemA.timestamp - itemB.timestamp || itemA.index - itemB.index;
		})
		.map((item) => item.record);
}

export function summarizeCollectionRecords(
	records: VaultRecord[],
	summaries: CollectionSummaryDefinition[]
): CollectionSummaryResult[] {
	return summaries.map((summary) => {
		const type = summary.type.toLowerCase();
		const label = summary.name || getCollectionSummaryLabel(summary);

		if (type === 'countby' || type === 'count-by' || type === 'groupcount' || type === 'group-count') {
			const items = countCollectionRecordsByField(records, summary.field);

			return {
				items,
				label,
				type: 'countBy',
				value: items.length ? items.map((item) => `${item.label}: ${item.value}`).join(', ') : '0'
			};
		}

		if (type === 'sum') {
			return {
				items: [],
				label,
				type: 'sum',
				value: formatSummaryNumber(sumCollectionNumericValues(records, summary.field))
			};
		}

		if (type === 'average' || type === 'avg') {
			const values = getCollectionNumericValues(records, summary.field);
			const average = values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

			return {
				items: [],
				label,
				type: 'average',
				value: formatSummaryNumber(average)
			};
		}

		return {
			items: [],
			label,
			type: 'count',
			value: String(records.length)
		};
	});
}

export function getCollectionExportRows(records: VaultRecord[], columns: string[]): CollectionExportRow[] {
	return records.map((record) => {
		const row: CollectionExportRow = {};

		for (const column of columns) {
			row[column] = getCollectionRecordValue(record, column);
		}

		return row;
	});
}

export function serializeCollectionRecordsAsJson(records: VaultRecord[], columns: string[]) {
	return JSON.stringify(getCollectionExportRows(records, columns), null, 2);
}

export function serializeCollectionRecordsAsCsv(records: VaultRecord[], columns: string[]) {
	const rows = getCollectionExportRows(records, columns);
	const csvRows = [columns, ...rows.map((row) => columns.map((column) => formatVaultValue(row[column])))];

	return csvRows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export function getCollectionRecordCreationError(definition: CollectionDefinition) {
	if (!hasExplicitSource(definition.source)) {
		return 'Add a collection source before creating records.';
	}

	if (definition.source.files.length) {
		return 'Collections with exact file sources cannot create matching records.';
	}

	const unsupportedBuiltinMatch = Object.keys(definition.source.match).find(isUnsupportedBuiltinMatchField);

	if (unsupportedBuiltinMatch) {
		return `Cannot create records for a collection that matches built-in field "${unsupportedBuiltinMatch}".`;
	}

	return '';
}

export function isComputedCollectionColumn(definition: CollectionDefinition, column: string) {
	const normalizedColumn = column.trim().toLowerCase();

	return definition.schema.some(
		(field) => field.name.toLowerCase() === normalizedColumn && isComputedCollectionField(field)
	);
}

export function evaluateCollectionFormula(record: VaultRecord, formula: string): VaultPropertyValue {
	const expression = formula.trim();

	if (!expression) {
		return '';
	}

	if (expression.includes('{')) {
		return expression.replace(/\{([^{}]+)\}/gu, (_match, field: string) =>
			formatVaultValue(getVaultRecordValue(record, field.trim()))
		);
	}

	const numericValue = evaluateArithmeticFormula(record, expression);

	return numericValue === null ? '' : numericValue;
}

export function createCollectionRecordDraft(definition: CollectionDefinition, title: string): CollectionRecordDraft {
	const normalizedTitle = title.trim() || 'Untitled';
	const error = getCollectionRecordCreationError(definition);

	if (error) {
		throw new Error(error);
	}

	const folder = getCollectionRecordFolder(definition);
	const fields = getCollectionRecordFields(definition, normalizedTitle);
	const fieldLines = fields.map(([key, value]) => `${key}:: ${formatInlinePropertyValue(value)}`);
	const content = [`# ${normalizedTitle}`, '', ...fieldLines, ''].join('\n');
	const fileName = `${slugifyTitle(normalizedTitle)}.md`;

	return {
		content,
		path: normalizePath(folder ? `${folder}/${fileName}` : fileName),
		title: normalizedTitle
	};
}

function getCollectionColumns(definition: CollectionDefinition, view: CollectionView) {
	const columns = view.columns.length ? view.columns : ['title', ...definition.schema.map((field) => field.name)];
	const uniqueColumns = [...new Set(columns)];

	return uniqueColumns.length ? uniqueColumns : ['title', 'path'];
}

function createFallbackCollectionView(): CollectionView {
	return {
		columns: [],
		dateField: '',
		filter: '',
		groupBy: '',
		name: 'Table',
		sortColumn: '',
		sortDirection: 'asc',
		type: 'table'
	};
}

function resolveCollectionComputedFields(record: VaultRecord, definition: CollectionDefinition): VaultRecord {
	const computedFields = definition.schema.filter(isComputedCollectionField);

	if (!computedFields.length) {
		return record;
	}

	const properties = { ...record.properties };
	let resolvedRecord: VaultRecord = {
		...record,
		properties
	};

	for (const field of computedFields) {
		properties[field.name] = evaluateCollectionFormula(resolvedRecord, field.formula);
		resolvedRecord = {
			...resolvedRecord,
			properties
		};
	}

	return resolvedRecord;
}

function matchesCollectionSource(record: VaultRecord, source: CollectionSource, collectionPath: string) {
	if (!hasExplicitSource(source)) {
		return false;
	}

	return (
		matchesFolders(record, source.folders, collectionPath) &&
		matchesFiles(record, source.files, collectionPath) &&
		matchesTags(record, source.tags) &&
		matchesRules(record, source.match)
	);
}

function hasExplicitSource(source: CollectionSource) {
	return (
		source.files.length > 0 ||
		source.folders.length > 0 ||
		source.tags.length > 0 ||
		Object.keys(source.match).length > 0
	);
}

function getCollectionRecordFolder(definition: CollectionDefinition) {
	if (definition.source.folders.length) {
		return getSourcePathCandidates(definition.source.folders[0], definition.path)[0] ?? '';
	}

	return getDirectoryPath(definition.path);
}

function getCollectionRecordFields(definition: CollectionDefinition, title: string): [string, VaultPropertyValue][] {
	const fields = new Map<string, VaultPropertyValue>();

	for (const [key, rule] of Object.entries(definition.source.match)) {
		const normalizedKey = key.toLowerCase();

		if (normalizedKey === 'title') {
			assertRuleMatchesValue(key, rule, title);
			continue;
		}

		const value = getDefaultMatchRuleValue(key, rule);

		if (value !== undefined) {
			if (normalizedKey === 'tags') {
				setMergedFieldValue(fields, 'tags', value);
			} else {
				fields.set(key, value);
			}
		}
	}

	if (definition.source.tags.length) {
		setMergedFieldValue(fields, 'tags', definition.source.tags);
	}

	const tagsRule = definition.source.match.tags;

	if (tagsRule !== undefined) {
		assertRuleMatchesValue('tags', tagsRule, getCaseInsensitiveValue(fields, 'tags') ?? '');
	}

	for (const field of definition.schema) {
		if (isBuiltinCollectionField(field.name) || isComputedCollectionField(field) || hasCaseInsensitiveKey(fields, field.name)) {
			continue;
		}

		fields.set(field.name, '');
	}

	return [...fields.entries()];
}

function getDefaultMatchRuleValue(key: string, rule: CollectionMatchRule): VaultPropertyValue | undefined {
	if (!isMatchRuleObject(rule)) {
		return rule;
	}

	if (rule.exists === false && (hasValue(rule.equals ?? '') || hasValue(rule.includes ?? ''))) {
		throw new Error(`Collection match for "${key}" cannot require a missing field and a value.`);
	}

	if ('equals' in rule) {
		if ('includes' in rule && !valueIncludes(rule.equals ?? '', rule.includes)) {
			throw new Error(`Collection match for "${key}" has incompatible equals and includes values.`);
		}

		return rule.equals ?? '';
	}

	if ('includes' in rule) {
		return rule.includes ?? '';
	}

	if (rule.exists === true) {
		return 'TODO';
	}

	return undefined;
}

function assertRuleMatchesValue(key: string, rule: CollectionMatchRule, value: VaultPropertyValue) {
	if (matchesRuleValue(rule, value)) {
		return;
	}

	throw new Error(`Collection record scaffold cannot satisfy match rule for "${key}".`);
}

function matchesRuleValue(rule: CollectionMatchRule, value: VaultPropertyValue) {
	if (isMatchRuleObject(rule)) {
		if (typeof rule.exists === 'boolean' && rule.exists !== hasValue(value)) {
			return false;
		}

		if ('equals' in rule && !valuesEqual(value, rule.equals)) {
			return false;
		}

		if ('includes' in rule && !valueIncludes(value, rule.includes)) {
			return false;
		}

		return true;
	}

	return valuesEqual(value, rule);
}

function setMergedFieldValue(fields: Map<string, VaultPropertyValue>, key: string, value: VaultPropertyValue) {
	const existingKey = getCaseInsensitiveKey(fields, key) || key;
	const existingValue = fields.get(existingKey);

	fields.set(existingKey, existingValue === undefined ? value : mergeFieldValues(existingValue, value));
}

function mergeFieldValues(valueA: VaultPropertyValue, valueB: VaultPropertyValue): VaultPropertyValue[] {
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
}

function toValueList(value: VaultPropertyValue): VaultPropertyValue[] {
	return Array.isArray(value) ? value : [value];
}

function formatInlinePropertyValue(value: VaultPropertyValue): string {
	if (Array.isArray(value)) {
		return `[${value.map(formatInlinePropertyValue).join(', ')}]`;
	}

	if (value === null || value === undefined) {
		return '';
	}

	if (typeof value === 'object') {
		return JSON.stringify(value);
	}

	if (typeof value === 'boolean' || typeof value === 'number') {
		return String(value);
	}

	return quoteInlineStringIfNeeded(value);
}

function quoteInlineStringIfNeeded(value: string) {
	if (!value || /^[\w ./@#-]+$/u.test(value)) {
		return value;
	}

	return JSON.stringify(value);
}

function escapeCsvCell(value: string) {
	return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function hasCaseInsensitiveKey(fields: Map<string, VaultPropertyValue>, key: string) {
	return Boolean(getCaseInsensitiveKey(fields, key));
}

function getCaseInsensitiveValue(fields: Map<string, VaultPropertyValue>, key: string) {
	const matchingKey = getCaseInsensitiveKey(fields, key);

	return matchingKey ? fields.get(matchingKey) : undefined;
}

function getCaseInsensitiveKey(fields: Map<string, VaultPropertyValue>, key: string) {
	const normalizedKey = key.toLowerCase();

	for (const fieldKey of fields.keys()) {
		if (fieldKey.toLowerCase() === normalizedKey) {
			return fieldKey;
		}
	}

	return '';
}

function isBuiltinCollectionField(field: string) {
	return ['basename', 'folder', 'path', 'preview', 'tags', 'title', 'updatedat'].includes(field.toLowerCase());
}

function isUnsupportedBuiltinMatchField(field: string) {
	const normalizedField = field.toLowerCase();

	return isBuiltinCollectionField(field) && normalizedField !== 'tags' && normalizedField !== 'title';
}

function matchesFolders(record: VaultRecord, folders: string[], collectionPath: string) {
	if (!folders.length) {
		return true;
	}

	return folders.some((folder) =>
		getSourcePathCandidates(folder, collectionPath).some(
			(candidate) => record.path === candidate || record.path.startsWith(`${candidate}/`)
		)
	);
}

function matchesFiles(record: VaultRecord, files: string[], collectionPath: string) {
	if (!files.length) {
		return true;
	}

	const paths = new Set(files.flatMap((file) => getSourcePathCandidates(file, collectionPath)));

	return paths.has(record.path) || paths.has(record.routePath);
}

function matchesTags(record: VaultRecord, tags: string[]) {
	if (!tags.length) {
		return true;
	}

	const recordTags = new Set(record.tags.map((tag) => tag.toLowerCase()));

	return tags.every((tag) => recordTags.has(tag.replace(/^#/u, '').toLowerCase()));
}

function matchesRules(record: VaultRecord, rules: Record<string, CollectionMatchRule>) {
	return Object.entries(rules).every(([key, rule]) => {
		const value = getVaultRecordValue(record, key);

		if (isMatchRuleObject(rule)) {
			if (typeof rule.exists === 'boolean') {
				const exists = hasValue(value);

				if (rule.exists !== exists) {
					return false;
				}
			}

			if ('equals' in rule && !valuesEqual(value, rule.equals)) {
				return false;
			}

			if ('includes' in rule && !valueIncludes(value, rule.includes)) {
				return false;
			}

			return true;
		}

		return valuesEqual(value, rule);
	});
}

function parseSource(value: SimpleYamlValue | undefined): CollectionSource {
	const source = asRecord(value);

	return {
		files: toStringList(source.files).map(normalizeSourcePath),
		folders: toStringList(source.folders ?? source.folder).map(normalizeSourcePath),
		match: parseMatch(source.match),
		tags: toStringList(source.tags ?? source.tag).map((tag) => tag.replace(/^#/u, ''))
	};
}

function parseSchema(value: SimpleYamlValue | undefined) {
	const schema = asRecord(value);

	return Object.entries(schema).map(([name, field]) => {
		if (isRecord(field)) {
			const formula = toStringValue(field.formula ?? field.expression ?? field.expr ?? field.value);

			return {
				formula,
				name,
				options: toStringList(field.options ?? field.values ?? field.choices),
				type: toStringValue(field.type) || (formula ? 'formula' : 'text')
			};
		}

		return {
			formula: '',
			name,
			options: [],
			type: toStringValue(field) || 'text'
		};
	});
}

function parseViews(value: SimpleYamlValue | undefined) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map((view, index) => {
		const record = asRecord(view);
		const type = toStringValue(record.type) || 'table';
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
					record.time_field
			),
			filter: toStringValue(record.filter ?? record.query ?? record.search),
			groupBy: toStringValue(record.groupBy ?? record.group_by ?? record.group),
			name: toStringValue(record.name) || `${capitalize(type)} ${index + 1}`,
			sortColumn: sort.column,
			sortDirection: sort.direction,
			type
		};
	});
}

function parseCollectionViewSort(record: Record<string, SimpleYamlValue>) {
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
				sortRecord.column
		) || (sortTextMatch ? sortTextMatch[1].trim() : rawSortText);
	const direction = getCollectionSortDirection(
		toStringValue(
			record.sortDirection ??
				record.sort_direction ??
				record.direction ??
				record.order ??
				sortRecord.direction ??
				sortRecord.order
		) || (sortTextMatch ? sortTextMatch[2] : '')
	);

	return { column, direction };
}

function getCollectionSortDirection(value: string): 'asc' | 'desc' {
	return /^(?:desc|descending)$/iu.test(value.trim()) ? 'desc' : 'asc';
}

function parseSummaries(value: SimpleYamlValue | undefined) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map((summary, index) => {
		const record = asRecord(summary);
		const type = toStringValue(record.type) || 'count';
		const field = toStringValue(record.field ?? record.by ?? record.groupBy ?? record.group_by ?? record.group);

		return {
			field,
			name: toStringValue(record.name) || `${capitalize(type)} ${index + 1}`,
			type
		};
	});
}

function parseMatch(value: SimpleYamlValue | undefined): Record<string, CollectionMatchRule> {
	const match = asRecord(value);
	const rules: Record<string, CollectionMatchRule> = {};

	for (const [key, rule] of Object.entries(match)) {
		if (isRecord(rule)) {
			const ruleObject: CollectionMatchRuleObject = {};

			if ('equals' in rule) {
				ruleObject.equals = rule.equals;
			}

			if (typeof rule.exists === 'boolean') {
				ruleObject.exists = rule.exists;
			}

			if ('includes' in rule) {
				ruleObject.includes = rule.includes;
			}

			rules[key] = ruleObject;
			continue;
		}

		rules[key] = rule;
	}

	return rules;
}

function hasValue(value: VaultPropertyValue): boolean {
	return (
		value !== null &&
		value !== undefined &&
		value !== '' &&
		(!Array.isArray(value) || value.length > 0) &&
		(typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 0)
	);
}

function valuesEqual(valueA: VaultPropertyValue, valueB: VaultPropertyValue | undefined): boolean {
	if (Array.isArray(valueA)) {
		return valueA.some((item) => valuesEqual(item, valueB));
	}

	if (Array.isArray(valueB)) {
		return valueB.some((item) => valuesEqual(valueA, item));
	}

	return formatVaultValue(valueA).toLowerCase() === formatVaultValue(valueB ?? '').toLowerCase();
}

function valueIncludes(value: VaultPropertyValue, expected: VaultPropertyValue | undefined): boolean {
	if (Array.isArray(value)) {
		return value.some((item) => valuesEqual(item, expected));
	}

	return formatVaultValue(value).toLowerCase().includes(formatVaultValue(expected ?? '').toLowerCase());
}

function toStringList(value: SimpleYamlValue | undefined): string[] {
	if (Array.isArray(value)) {
		return value.flatMap(toStringList);
	}

	if (value === null || value === undefined || typeof value === 'object') {
		return [];
	}

	return String(value)
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function toStringValue(value: SimpleYamlValue | undefined) {
	if (value === null || value === undefined || typeof value === 'object') {
		return '';
	}

	return String(value);
}

function getCollectionSummaryLabel(summary: CollectionSummaryDefinition) {
	if (summary.type.toLowerCase() === 'count' || !summary.field) {
		return 'Records';
	}

	return `${capitalize(summary.type)} ${summary.field}`;
}

function countCollectionRecordsByField(records: VaultRecord[], field: string): CollectionSummaryItem[] {
	const counts = new Map<string, number>();

	for (const record of records) {
		const labels = getCollectionSummaryFieldLabels(record, field);

		for (const label of labels.length ? labels : ['Unassigned']) {
			counts.set(label, (counts.get(label) ?? 0) + 1);
		}
	}

	return [...counts.entries()]
		.map(([label, count]) => ({ label, value: String(count) }))
		.sort((itemA, itemB) => Number(itemB.value) - Number(itemA.value) || itemA.label.localeCompare(itemB.label));
}

function getCollectionSummaryFieldLabels(record: VaultRecord, field: string) {
	const value = getCollectionRecordValue(record, field);

	if (Array.isArray(value)) {
		return value.map(formatVaultValue).map((label) => label.trim()).filter(Boolean);
	}

	const label = formatVaultValue(value).trim();

	return label ? [label] : [];
}

function sumCollectionNumericValues(records: VaultRecord[], field: string) {
	return getCollectionNumericValues(records, field).reduce((total, value) => total + value, 0);
}

function getCollectionNumericValues(records: VaultRecord[], field: string) {
	return records.flatMap((record) => getNumericValues(getCollectionRecordValue(record, field)));
}

function getNumericValues(value: VaultPropertyValue): number[] {
	if (Array.isArray(value)) {
		return value.flatMap(getNumericValues);
	}

	const numberValue = typeof value === 'number' ? value : Number(formatVaultValue(value));

	return Number.isFinite(numberValue) ? [numberValue] : [];
}

function formatSummaryNumber(value: number) {
	return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, '').replace(/\.$/u, '');
}

type FormulaToken =
	| { type: 'number'; value: number }
	| { type: 'operator'; value: FormulaOperator };

type FormulaOperator = '+' | '-' | '*' | '/' | '(' | ')';

function evaluateArithmeticFormula(record: VaultRecord, expression: string) {
	const tokens = tokenizeArithmeticFormula(record, expression);

	if (!tokens.length) {
		return null;
	}

	let cursor = 0;

	function peek() {
		return tokens[cursor];
	}

	function consume() {
		return tokens[cursor++];
	}

	function parseExpression(): number | null {
		let value = parseTerm();

		while (value !== null) {
			const token = peek();

			if (token?.type !== 'operator' || (token.value !== '+' && token.value !== '-')) {
				break;
			}

			consume();
			const rightValue = parseTerm();

			if (rightValue === null) {
				return null;
			}

			value = token.value === '+' ? value + rightValue : value - rightValue;
		}

		return value;
	}

	function parseTerm(): number | null {
		let value = parseFactor();

		while (value !== null) {
			const token = peek();

			if (token?.type !== 'operator' || (token.value !== '*' && token.value !== '/')) {
				break;
			}

			consume();
			const rightValue = parseFactor();

			if (rightValue === null) {
				return null;
			}

			value = token.value === '*' ? value * rightValue : value / rightValue;
		}

		return value;
	}

	function parseFactor(): number | null {
		const token = consume();

		if (!token) {
			return null;
		}

		if (token.type === 'number') {
			return token.value;
		}

		if (token.value === '+') {
			return parseFactor();
		}

		if (token.value === '-') {
			const value = parseFactor();

			return value === null ? null : -value;
		}

		if (token.value === '(') {
			const value = parseExpression();
			const closingToken = consume();

			return closingToken?.type === 'operator' && closingToken.value === ')' ? value : null;
		}

		return null;
	}

	const value = parseExpression();

	if (value === null || cursor !== tokens.length || !Number.isFinite(value)) {
		return null;
	}

	return Number.isInteger(value) ? value : Number(value.toFixed(6));
}

function tokenizeArithmeticFormula(record: VaultRecord, expression: string): FormulaToken[] {
	const tokens: FormulaToken[] = [];
	let cursor = 0;

	while (cursor < expression.length) {
		const character = expression[cursor] ?? '';

		if (/\s/u.test(character)) {
			cursor += 1;
			continue;
		}

		if ('+-*/()'.includes(character)) {
			tokens.push({ type: 'operator', value: character as FormulaOperator });
			cursor += 1;
			continue;
		}

		const numberMatch = expression.slice(cursor).match(/^\d+(?:\.\d+)?/u);

		if (numberMatch) {
			tokens.push({ type: 'number', value: Number(numberMatch[0]) });
			cursor += numberMatch[0].length;
			continue;
		}

		const fieldMatch = expression.slice(cursor).match(/^[\p{L}_][\p{L}\p{N}_]*/u);

		if (fieldMatch) {
			const numberValue = getFormulaNumberValue(record, fieldMatch[0]);

			if (numberValue === null) {
				return [];
			}

			tokens.push({ type: 'number', value: numberValue });
			cursor += fieldMatch[0].length;
			continue;
		}

		return [];
	}

	return tokens;
}

function getFormulaNumberValue(record: VaultRecord, field: string) {
	const value = getVaultRecordValue(record, field);

	if (!hasValue(value)) {
		return null;
	}

	const values = getNumericValues(value);

	return values[0] ?? null;
}

function getCollectionTimelineDate(value: VaultPropertyValue): { label: string; timestamp: number } | null {
	if (Array.isArray(value)) {
		for (const item of value) {
			const date = getCollectionTimelineDate(item);

			if (date) {
				return date;
			}
		}

		return null;
	}

	if (typeof value === 'number' && Number.isFinite(value)) {
		return { label: String(value), timestamp: value };
	}

	if (typeof value !== 'string') {
		return null;
	}

	const label = value.trim();
	const timestamp = Date.parse(label);

	return Number.isFinite(timestamp) ? { label, timestamp } : null;
}

function isComputedCollectionField(field: CollectionField) {
	const type = field.type.toLowerCase();

	return Boolean(field.formula || type === 'formula' || type === 'computed');
}

function getCollectionName(path: string) {
	return path.split('/').at(-1)?.replace(collectionFilePattern, '') || 'Collection';
}

function getSourcePathCandidates(path: string, collectionPath: string) {
	const normalizedPath = normalizePath(path);

	if (path.trim().startsWith('/')) {
		return [normalizedPath];
	}

	const collectionDirectory = getDirectoryPath(collectionPath);
	const relativePath = normalizePath(collectionDirectory ? `${collectionDirectory}/${path}` : path);

	return [...new Set([relativePath, normalizedPath])].filter(Boolean);
}

function normalizeSourcePath(path: string) {
	const rootRelative = path.trim().startsWith('/');
	const normalizedPath = normalizePath(path);

	return rootRelative && normalizedPath ? `/${normalizedPath}` : normalizedPath;
}

function slugifyTitle(title: string) {
	const slug = title
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');

	return slug || 'untitled';
}

function normalizePath(path: string) {
	const segments: string[] = [];

	for (const segment of path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').split('/')) {
		if (!segment || segment === '.') {
			continue;
		}

		if (segment === '..') {
			segments.pop();
			continue;
		}

		segments.push(segment);
	}

	return segments.join('/');
}

function capitalize(value: string) {
	return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function asRecord(value: SimpleYamlValue | undefined): Record<string, SimpleYamlValue> {
	return isRecord(value) ? value : {};
}

function isRecord(value: SimpleYamlValue | undefined): value is Record<string, SimpleYamlValue> {
	return Boolean(value) && !Array.isArray(value) && typeof value === 'object';
}

function isMatchRuleObject(rule: CollectionMatchRule): rule is CollectionMatchRuleObject {
	return isRecord(rule) && ('equals' in rule || 'exists' in rule || 'includes' in rule);
}
