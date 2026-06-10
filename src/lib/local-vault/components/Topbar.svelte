<script lang="ts">
import type { LocalVaultShellStore } from "../shell/Store.svelte.js";

type Props = {
    store: LocalVaultShellStore,
};

let { store }: Props = $props();

function handlePublicPublishProfileChange(event: Event) {
    store.interactionActions.selectPublicPublishProfile((event.currentTarget as HTMLSelectElement).value);
}
</script>

<header class="topbar">
	<div>
		<p>Datahoarder</p>
		<h1>Local Vault</h1>
	</div>

	<div class="actions">
		<button
			type="button"
			class="command-button"
			onclick={() => store.interactionActions.openCommandPalette()}
			aria-keyshortcuts="Control+K Meta+K"
		>
			Command
		</button>
		<button type="button" onclick={store.vaultActions.chooseFolder} disabled={!store.supported || store.loading}>
			Open Folder
		</button>
		<button
			type="button"
			onclick={store.vaultActions.reopenStoredFolder}
			disabled={!store.supported || store.loading || !store.vaultHandle}
		>
			Reopen
		</button>
		<button
			type="button"
			onclick={store.vaultActions.refreshVault}
			disabled={!store.supported || store.loading || !store.vaultHandle}
		>
			Refresh
		</button>
		<button
			type="button"
			onclick={store.noteActions.addCanvasElement}
			disabled={store.loading || store.saving || !store.selectedExcalidrawNote}
		>
			Add Canvas Element
		</button>
		<button
			type="button"
			onclick={store.vaultActions.renameSelectedFile}
			disabled={store.loading || !store.selectedFile}
		>
			Rename
		</button>
		<button
			type="button"
			onclick={store.toggleSelectedPin}
			disabled={store.loading || !store.selectedRecord}
			aria-pressed={store.selectedFilePinned}
		>
			{store.selectedFilePinned ? 'Unpin' : 'Pin'}
		</button>
		<button
			type="button"
			onclick={store.noteActions.setSelectedInlineField}
			disabled={store.loading || !store.selectedRecord || store.saving}
		>
			Set Field
		</button>
		<button
			type="button"
			onclick={store.vaultActions.deleteSelectedFile}
			disabled={store.loading || !store.selectedFile}
		>
			Delete
		</button>
		<button
			type="button"
			onclick={store.publishActions.downloadSelectedHtmlExport}
			disabled={store.loading || !store.selectedFile}
		>
			Export HTML
		</button>
		{#if store.publicPublishProfiles.length}
			<select
				class="publish-profile-select"
				value={store.selectedPublicPublishProfilePath}
				aria-label="Publish profile"
				disabled={!store.supported || store.loading || !store.vaultHandle || store.saving}
				onchange={handlePublicPublishProfileChange}
			>
				<option value="">Public markers</option>
				{#each store.publicPublishProfiles as profile (profile.path)}
					<option value={profile.path}>{profile.name}</option>
				{/each}
			</select>
		{/if}
		<button
			type="button"
			onclick={store.publishActions.publishPublicNotes}
			disabled={!store.supported || store.loading || !store.vaultHandle || store.saving}
			title={store.publicRecords.length ? `Publish ${store.publicRecords.length} notes` : 'No publishable notes found'}
		>
			Publish Public
		</button>
		<button type="button" class="primary" onclick={store.vaultActions.saveSelectedFile} disabled={!store.dirty || store.saving}>
			{store.saving ? 'Saving' : 'Save'}
		</button>
	</div>
</header>

<style lang="scss">
.topbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.85rem 1rem;
	border-bottom: 1px solid oklch(0.78 0.03 235);
	background: oklch(0.99 0.01 235);
}

.topbar p,
.topbar h1 {
	margin: 0;
}

.topbar p {
	color: oklch(0.42 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
}

.topbar h1 {
	font-size: 1.2rem;
	line-height: 1.1;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	justify-content: flex-end;
}

.command-button {
	color: oklch(0.25 0.06 245);
	background: oklch(0.93 0.035 155);
	border-color: oklch(0.66 0.11 155);
}

.publish-profile-select {
	max-width: 12rem;
	min-height: 2rem;
	padding: 0.25rem 0.5rem;
	color: inherit;
	font: inherit;
	background: oklch(0.985 0.006 235);
	border: 1px solid oklch(0.73 0.04 235);
	border-radius: 0.35rem;
}

.publish-profile-select:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 2px;
}

.publish-profile-select:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}

@media (max-width: 760px) {
	.topbar {
		align-items: stretch;
		flex-direction: column;
	}

	.actions {
		justify-content: stretch;
	}

	.actions button {
		flex: 1 1 7rem;
	}
}
</style>
