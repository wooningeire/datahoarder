import {
	formatVaultValue,
	getVaultRecordValue,
	type VaultPropertyValue,
	type VaultRecord
} from './vault-index.js';
import type {
	CollectionSummaryDefinition,
	CollectionSummaryItem,
	CollectionSummaryResult
} from './collection-types.js';

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
	const value = getVaultRecordValue(record, field);

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
	return records.flatMap((record) => getNumericValues(getVaultRecordValue(record, field)));
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

function capitalize(value: string) {
	return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
