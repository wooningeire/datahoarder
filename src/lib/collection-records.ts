import {
	formatVaultValue,
	getVaultRecordValue,
	type VaultPropertyValue,
	type VaultRecord
} from './vault-index.js';
import {
	getCollectionVaultQueryFields,
	matchVaultRecordQuery,
	parseVaultQuery
} from './vault-query.js';
import type { CollectionExportRow } from './collection-types.js';

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

function escapeCsvCell(value: string) {
	return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}
