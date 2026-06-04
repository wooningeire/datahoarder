<script lang="ts">
import type { VaultIndex } from '../../vault/index.js';

type VaultRecord = VaultIndex['records'][number];

type Props = {
	pinnedNotes: VaultRecord[];
	recentNotes: VaultRecord[];
	selectedPath: string;
	openStoredNoteRecord: (record: VaultRecord) => void;
	togglePinnedPath: (path: string) => void;
};

let { pinnedNotes, recentNotes, selectedPath, openStoredNoteRecord, togglePinnedPath }: Props = $props();
</script>

{#if pinnedNotes.length || recentNotes.length}
	<div class="quick-notes" aria-label="Quick notes">
		{#if pinnedNotes.length}
			<section class="quick-note-section" aria-labelledby="pinned-notes-heading">
				<h2 id="pinned-notes-heading">Pinned</h2>
				<ul>
					{#each pinnedNotes as record (record.path)}
						<li class:active-quick-note={record.path === selectedPath}>
							<button
								type="button"
								class="quick-note-link"
								onclick={() => openStoredNoteRecord(record)}
							>
								<strong>{record.title}</strong>
								<span>{record.path}</span>
							</button>
							<button
								type="button"
								class="quick-note-pin"
								aria-label={`Unpin ${record.title}`}
								aria-pressed={true}
								onclick={() => togglePinnedPath(record.path)}
							>
								Unpin
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if recentNotes.length}
			<section class="quick-note-section" aria-labelledby="recent-notes-heading">
				<h2 id="recent-notes-heading">Recent</h2>
				<ul>
					{#each recentNotes as record (record.path)}
						<li class:active-quick-note={record.path === selectedPath}>
							<button
								type="button"
								class="quick-note-link"
								onclick={() => openStoredNoteRecord(record)}
							>
								<strong>{record.title}</strong>
								<span>{record.path}</span>
							</button>
							<button
								type="button"
								class="quick-note-pin"
								aria-label={`Pin ${record.title}`}
								aria-pressed={false}
								onclick={() => togglePinnedPath(record.path)}
							>
								Pin
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
{/if}

<style lang="scss">
.quick-notes {
	display: grid;
	gap: 0.65rem;
	max-height: 15rem;
	padding-right: 0.15rem;
	overflow: auto;
}

.quick-note-section {
	display: grid;
	gap: 0.3rem;

	h2 {
		margin: 0;

		color: oklch(0.42 0.06 255);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	ul {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding: 0;

		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.3rem;
		align-items: stretch;
		min-width: 0;

		&:hover .quick-note-link,
		&.active-quick-note .quick-note-link {
			background: oklch(0.88 0.05 205);
		}
	}
}

.quick-note-link,
.quick-note-pin {
	min-height: 1.9rem;
}

.quick-note-link {
	display: grid;
	gap: 0.05rem;
	min-width: 0;
	padding: 0.28rem 0.45rem;

	text-align: left;

	background: oklch(0.955 0.018 235);

	strong,
	span {
		min-width: 0;
		overflow: hidden;

		text-overflow: ellipsis;
		white-space: nowrap;
	}

	strong {
		color: oklch(0.25 0.055 245);
		font-size: 0.84rem;
	}

	span {
		color: oklch(0.42 0.035 245);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}
}

.quick-note-pin {
	padding: 0 0.42rem;

	color: oklch(0.34 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.68rem;
	font-weight: 700;
	text-transform: uppercase;
}
</style>
