import type {
	VaultPropertyValue,
	VaultRecord
} from '../vault/index.js';

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

export const collectionFilePattern = /\.(?:dhbase|collection)\.ya?ml$/iu;
