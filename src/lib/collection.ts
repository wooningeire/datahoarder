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
	evaluateCollectionFormula,
	isComputedCollectionField
} from './collection-formula.js';
import { formatCollectionRecordValue } from './collection-records.js';
import {
	collectionFilePattern,
	type CollectionDefinition,
	type CollectionKanbanGroup,
	type CollectionMatchRule,
	type CollectionMatchRuleObject,
	type CollectionRecordDraft,
	type CollectionSource,
	type CollectionView,
	type ResolvedCollection
} from './collection-types.js';

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
	ResolvedCollection
} from './collection-types.js';
export { evaluateCollectionFormula } from './collection-formula.js';
export {
	filterCollectionRecords,
	formatCollectionRecordValue,
	getCollectionExportRows,
	getCollectionRecordValue,
	serializeCollectionRecordsAsCsv,
	serializeCollectionRecordsAsJson,
	sortCollectionRecords
} from './collection-records.js';
export { summarizeCollectionRecords } from './collection-summary.js';
export {
	getCollectionTimelineItems,
	sortCollectionRecordsForTimeline
} from './collection-timeline.js';

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

export function getCollectionField(definition: CollectionDefinition, column: string) {
	const normalizedColumn = column.trim().toLowerCase();

	return definition.schema.find((field) => field.name.toLowerCase() === normalizedColumn) ?? null;
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
