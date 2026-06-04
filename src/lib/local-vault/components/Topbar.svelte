<script lang="ts">
import type { PublicPublishProfile } from '../../publishing/public-publish.js';

type Props = {
	dirty: boolean;
	hasSelectedExcalidrawNote: boolean;
	hasSelectedFile: boolean;
	hasSelectedRecord: boolean;
	hasVault: boolean;
	loading: boolean;
	publicPublishProfiles: PublicPublishProfile[];
	publicRecordsCount: number;
	saving: boolean;
	selectedFilePinned: boolean;
	selectedPublicPublishProfilePath: string;
	supported: boolean;
	addCanvasElement: () => void;
	chooseFolder: () => void;
	deleteSelectedFile: () => void;
	downloadSelectedHtmlExport: () => void;
	openCommandPalette: () => void;
	publishPublicNotes: () => void;
	refreshVault: () => void;
	renameSelectedFile: () => void;
	reopenStoredFolder: () => void;
	saveSelectedFile: () => void;
	selectPublicPublishProfile: (path: string) => void;
	setSelectedInlineField: () => void;
	toggleSelectedPin: () => void;
};

let {
	dirty,
	hasSelectedExcalidrawNote,
	hasSelectedFile,
	hasSelectedRecord,
	hasVault,
	loading,
	publicPublishProfiles,
	publicRecordsCount,
	saving,
	selectedFilePinned,
	selectedPublicPublishProfilePath,
	supported,
	addCanvasElement,
	chooseFolder,
	deleteSelectedFile,
	downloadSelectedHtmlExport,
	openCommandPalette,
	publishPublicNotes,
	refreshVault,
	renameSelectedFile,
	reopenStoredFolder,
	saveSelectedFile,
	selectPublicPublishProfile,
	setSelectedInlineField,
	toggleSelectedPin
}: Props = $props();

function handlePublicPublishProfileChange(event: Event) {
	selectPublicPublishProfile((event.currentTarget as HTMLSelectElement).value);
}
</script>

<header class="topbar">
	<div>
		<p>Datahoarder</p>
		<h1>Local Vault</h1>
	</div>

	<div class="actions">
		<button type="button" class="command-button" onclick={openCommandPalette} aria-keyshortcuts="Control+K Meta+K">
			Command
		</button>
		<button type="button" onclick={chooseFolder} disabled={!supported || loading}>
			Open Folder
		</button>
		<button type="button" onclick={reopenStoredFolder} disabled={!supported || loading || !hasVault}>
			Reopen
		</button>
		<button type="button" onclick={refreshVault} disabled={!supported || loading || !hasVault}>
			Refresh
		</button>
		<button type="button" onclick={addCanvasElement} disabled={loading || saving || !hasSelectedExcalidrawNote}>
			Add Canvas Element
		</button>
		<button type="button" onclick={renameSelectedFile} disabled={loading || !hasSelectedFile}>
			Rename
		</button>
		<button
			type="button"
			onclick={toggleSelectedPin}
			disabled={loading || !hasSelectedRecord}
			aria-pressed={selectedFilePinned}
		>
			{selectedFilePinned ? 'Unpin' : 'Pin'}
		</button>
		<button type="button" onclick={setSelectedInlineField} disabled={loading || !hasSelectedRecord || saving}>
			Set Field
		</button>
		<button type="button" onclick={deleteSelectedFile} disabled={loading || !hasSelectedFile}>
			Delete
		</button>
		<button type="button" onclick={downloadSelectedHtmlExport} disabled={loading || !hasSelectedFile}>
			Export HTML
		</button>
		{#if publicPublishProfiles.length}
			<select
				class="publish-profile-select"
				value={selectedPublicPublishProfilePath}
				aria-label="Publish profile"
				disabled={!supported || loading || !hasVault || saving}
				onchange={handlePublicPublishProfileChange}
			>
				<option value="">Public markers</option>
				{#each publicPublishProfiles as profile (profile.path)}
					<option value={profile.path}>{profile.name}</option>
				{/each}
			</select>
		{/if}
		<button
			type="button"
			onclick={publishPublicNotes}
			disabled={!supported || loading || !hasVault || saving}
			title={publicRecordsCount ? `Publish ${publicRecordsCount} notes` : 'No publishable notes found'}
		>
			Publish Public
		</button>
		<button type="button" class="primary" onclick={saveSelectedFile} disabled={!dirty || saving}>
			{saving ? 'Saving' : 'Save'}
		</button>
	</div>
</header>
