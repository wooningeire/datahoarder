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

export type CollectionField = {
	name: string;
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
	name: string;
	type: string;
};

export type CollectionDefinition = {
	name: string;
	path: string;
	schema: CollectionField[];
	source: CollectionSource;
	views: CollectionView[];
};

export type ResolvedCollection = {
	columns: string[];
	definition: CollectionDefinition;
	records: VaultRecord[];
	view: CollectionView;
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
		views: views.length ? views : [{ columns: [], name: 'Table', type: 'table' }]
	};
}

export function resolveDatahoarderCollection(
	content: string,
	path: string,
	vaultIndex: VaultIndex
): ResolvedCollection {
	const definition = parseDatahoarderCollection(content, path);
	const view = definition.views[0] ?? { columns: [], name: 'Table', type: 'table' };
	const columns = getCollectionColumns(definition, view);
	const records = vaultIndex.records.filter((record) =>
		matchesCollectionSource(record, definition.source, definition.path)
	);

	return {
		columns,
		definition,
		records,
		view
	};
}

export function getCollectionRecordValue(record: VaultRecord, column: string) {
	return getVaultRecordValue(record, column);
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
	const normalizedQuery = query.trim().toLowerCase();

	if (!normalizedQuery) {
		return records;
	}

	return records.filter((record) =>
		['title', 'path', ...columns].some((column) =>
			formatCollectionRecordValue(record, column).toLowerCase().includes(normalizedQuery)
		)
	);
}

function getCollectionColumns(definition: CollectionDefinition, view: CollectionView) {
	const columns = view.columns.length ? view.columns : ['title', ...definition.schema.map((field) => field.name)];
	const uniqueColumns = [...new Set(columns)];

	return uniqueColumns.length ? uniqueColumns : ['title', 'path'];
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
		files: toStringList(source.files),
		folders: toStringList(source.folders ?? source.folder),
		match: parseMatch(source.match),
		tags: toStringList(source.tags ?? source.tag).map((tag) => tag.replace(/^#/u, ''))
	};
}

function parseSchema(value: SimpleYamlValue | undefined) {
	const schema = asRecord(value);

	return Object.entries(schema).map(([name, field]) => {
		if (isRecord(field)) {
			return {
				name,
				type: toStringValue(field.type) || 'text'
			};
		}

		return {
			name,
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

		return {
			columns: toStringList(record.columns),
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
		.map((item) => normalizePath(item.trim()))
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
