import {
	getVaultRecordValue,
	type VaultPropertyValue,
	type VaultRecord
} from './vault-index.js';
import type { CollectionTimelineItem } from './collection-types.js';

export function getCollectionTimelineItems(records: VaultRecord[], dateField: string): CollectionTimelineItem[] {
	return sortCollectionRecordsForTimeline(records, dateField).map((record) => {
		const date = getCollectionTimelineDate(getVaultRecordValue(record, dateField));

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
			timestamp: getCollectionTimelineDate(getVaultRecordValue(record, dateField))?.timestamp ?? null
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
