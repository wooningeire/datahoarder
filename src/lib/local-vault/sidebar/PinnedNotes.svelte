<script lang="ts">
import type { VaultIndex } from "../../vault/index.js";

type VaultRecord = VaultIndex["records"][number];

type Props = {
    pinnedNotes: VaultRecord[],
    selectedPath: string,
    openStoredNoteRecord: (record: VaultRecord) => void,
    togglePinnedPath: (path: string) => void,
};

let {
    pinnedNotes,
    selectedPath,
    openStoredNoteRecord,
    togglePinnedPath,
}: Props = $props();
</script>

{#if pinnedNotes.length}
    <section class="pinned-notes" aria-label="Pinned notes">
        <h2>Pinned</h2>
        <ul>
            {#each pinnedNotes as record (record.path)}
                <li class:active-pinned-note={record.path === selectedPath}>
                    <button
                        type="button"
                        class="pinned-note-link"
                        onclick={() => openStoredNoteRecord(record)}
                    >
                        <strong>{record.title}</strong>
                        <span>{record.path}</span>
                    </button>
                    <button
                        type="button"
                        class="pinned-note-remove"
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

<style lang="scss">
.pinned-notes {
    display: grid;
    gap: 0.3rem;
    max-height: 15rem;
    padding-right: 0.15rem;
    overflow: auto;

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

        &:hover .pinned-note-link,
        &.active-pinned-note .pinned-note-link {
            background: oklch(0.88 0.05 205);
        }
    }
}

.pinned-note-link,
.pinned-note-remove {
    min-height: 1.9rem;
}

.pinned-note-link {
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

.pinned-note-remove {
    padding: 0 0.42rem;

    color: oklch(0.34 0.08 180);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
}
</style>
