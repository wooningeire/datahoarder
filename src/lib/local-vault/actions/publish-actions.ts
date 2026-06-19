import {
	serializeCollectionRecordsAsCsv,
	serializeCollectionRecordsAsJson,
	type ResolvedCollection
} from '../../collections/index.js';
import type { VaultRecord } from '../../vault/index.js';
import { downloadTextFile, slugifyDownloadName } from '../shared/downloads.js';

type PublishActionContext = {
	collectionRecords: VaultRecord[];
	selectedCollection: ResolvedCollection | null;
	status: string;
};

export type PublishActions = ReturnType<typeof createPublishActions>;

export function createPublishActions(context: PublishActionContext) {
	return {
		downloadCollectionExport
	};

	function downloadCollectionExport(format: 'csv' | 'json') {
		if (!context.selectedCollection) {
			return;
		}

		const content =
			format === 'csv'
				? serializeCollectionRecordsAsCsv(context.collectionRecords, context.selectedCollection.columns)
				: serializeCollectionRecordsAsJson(context.collectionRecords, context.selectedCollection.columns);
		const fileName = `${slugifyDownloadName(context.selectedCollection.definition.name)}-${slugifyDownloadName(
			context.selectedCollection.view.name
		)}.${format}`;
		const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';

		downloadTextFile(fileName, content, type);
		context.status = `Exported ${context.collectionRecords.length} collection records as ${format.toUpperCase()}.`;
	}
}
