import {
	serializeCollectionRecordsAsCsv,
	serializeCollectionRecordsAsJson,
	type CollectionSummaryResult,
	type ResolvedCollection
} from '../collection.js';
import { createStandaloneHtmlDocument } from '../html-export.js';
import type { LocalDirectoryHandle, LocalVaultFile } from '../local-vault.js';
import { getNoteTitle } from '../paths.js';
import {
	createPublicPublishBundle,
	getPublicPublishRecords,
	type PublicPublishProfile
} from '../public-publish.js';
import type { VaultIndex, VaultRecord } from '../vault-index.js';
import { downloadTextFile, slugifyDownloadName } from './downloads.js';
import { writeOrCreateLocalTextFile } from './file-output.js';
import {
	renderPublicRecordBodyHtml,
	renderSelectedExportBodyHtml
} from './rendering.js';

type PublishActionContext = {
	collectionRecords: VaultRecord[];
	collectionSummaries: CollectionSummaryResult[];
	dirty: boolean;
	errorMessage: string;
	files: LocalVaultFile[];
	loading: boolean;
	previewHtml: string;
	saving: boolean;
	selectedCollection: ResolvedCollection | null;
	selectedContent: string;
	selectedFile: LocalVaultFile | null;
	selectedPath: string;
	selectedPublicPublishProfile: PublicPublishProfile | null;
	selectedRecord: VaultRecord | null;
	status: string;
	vaultHandle: LocalDirectoryHandle | null;
	vaultIndex: VaultIndex;
	canMutateVault: () => Promise<boolean>;
	getErrorMessage: (error: unknown) => string;
	reloadVaultAfterFileOperation: (nextStatus: string, preferredPath?: string) => Promise<void>;
	saveSelectedFile: () => Promise<void>;
};

export type PublishActions = ReturnType<typeof createPublishActions>;

export function createPublishActions(context: PublishActionContext) {
	return {
		downloadCollectionExport,
		downloadSelectedHtmlExport,
		publishPublicNotes
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

	async function publishPublicNotes() {
		if (!context.vaultHandle || context.loading || context.saving || !(await context.canMutateVault())) {
			return;
		}

		if (context.dirty) {
			if (!window.confirm('Save current edits before publishing public notes?')) {
				return;
			}

			await context.saveSelectedFile();

			if (context.dirty) {
				return;
			}
		}

		const profile = context.selectedPublicPublishProfile;
		const nextPublicRecords = getPublicPublishRecords(context.vaultIndex.records, profile);

		if (!nextPublicRecords.length) {
			context.status = profile
				? `No notes matched publish profile ${profile.name}.`
				: 'No public notes found. Add public:: true, share:: public, or #public.';
			return;
		}

		context.saving = true;
		context.errorMessage = '';

		try {
			const bundle = createPublicPublishBundle(
				context.vaultIndex.records,
				(record, entry, entries) => renderPublicRecordBodyHtml(record, entry, entries, context.vaultIndex),
				{
					profile,
					subtitle: profile?.subtitle || 'Datahoarder public vault'
				}
			);

			for (const file of bundle.files) {
				await writeOrCreateLocalTextFile(context.vaultHandle, context.files, file.path, file.content, '.html');
			}

			await context.reloadVaultAfterFileOperation(
				`Published ${bundle.entries.length} ${profile ? `${profile.name} ` : 'public '}notes to ${bundle.outputDirectory}/.`,
				context.selectedPath
			);
		} catch (error) {
			context.errorMessage = context.getErrorMessage(error);
		} finally {
			context.saving = false;
		}
	}
}
