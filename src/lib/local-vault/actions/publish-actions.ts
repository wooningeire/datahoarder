import {
	serializeCollectionRecordsAsCsv,
	serializeCollectionRecordsAsJson,
	type CollectionSummaryResult,
	type ResolvedCollection
} from '../../collections/index.js';
import { createStandaloneHtmlDocument } from '../../publishing/html-export.js';
import type { LocalVaultFile } from '../../vault/local-files.js';
import { getNoteTitle } from '../../vault/paths.js';
import type { VaultIndex, VaultRecord } from '../../vault/index.js';
import { downloadTextFile, slugifyDownloadName } from '../shared/downloads.js';
import { renderSelectedExportBodyHtml } from '../preview/rendering.js';

type PublishActionContext = {
	collectionRecords: VaultRecord[];
	collectionSummaries: CollectionSummaryResult[];
	files: LocalVaultFile[];
	previewHtml: string;
	selectedCollection: ResolvedCollection | null;
	selectedContent: string;
	selectedFile: LocalVaultFile | null;
	selectedRecord: VaultRecord | null;
	status: string;
	vaultIndex: VaultIndex;
};

export type PublishActions = ReturnType<typeof createPublishActions>;

export function createPublishActions(context: PublishActionContext) {
	return {
		downloadCollectionExport,
		downloadSelectedHtmlExport
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

	function downloadSelectedHtmlExport() {
		if (!context.selectedFile) {
			return;
		}

		const title =
			context.selectedCollection?.definition.name ??
			context.selectedRecord?.title ??
			getNoteTitle(context.selectedFile.path);
		const bodyHtml = renderSelectedExportBodyHtml({
			collectionRecords: context.collectionRecords,
			collectionSummaries: context.collectionSummaries,
			files: context.files,
			previewHtml: context.previewHtml,
			selectedCollection: context.selectedCollection,
			selectedContent: context.selectedContent,
			selectedFile: context.selectedFile,
			vaultIndex: context.vaultIndex
		});
		const html = createStandaloneHtmlDocument({
			bodyHtml,
			sourcePath: context.selectedFile.path,
			subtitle: context.selectedCollection
				? `${context.selectedCollection.view.name} collection view`
				: 'Datahoarder note export',
			title
		});
		const fileName = context.selectedCollection
			? `${slugifyDownloadName(context.selectedCollection.definition.name)}-${slugifyDownloadName(
				context.selectedCollection.view.name
			)}.html`
			: `${slugifyDownloadName(title)}.html`;

		downloadTextFile(fileName, html, 'text/html;charset=utf-8');
		context.status = `Exported ${context.selectedFile.path} as HTML.`;
	}
}
