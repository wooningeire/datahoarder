<script lang="ts">
import { tick } from "svelte";
import type { InlineFileCreate } from "../local-vault/shared/types.js";

type Props = {
    inlineFileCreate: InlineFileCreate,
    cancelInlineFileCreate?: () => void,
    submitInlineFileCreate?: () => void,
    updateInlineFileCreateName?: (fileName: string) => void,
};

let {
    inlineFileCreate,
    cancelInlineFileCreate,
    submitInlineFileCreate,
    updateInlineFileCreateName,
}: Props = $props();

let inputElement: HTMLInputElement | undefined = $state();
let focusedInlineCreateId = "";

$effect(() => {
    if (!inputElement || focusedInlineCreateId === inlineFileCreate.id) {
        return;
    }

    focusedInlineCreateId = inlineFileCreate.id;
    void tick().then(() => {
        inputElement?.focus();
        inputElement?.select();
    });
});

const handleInput = (event: Event): void => {
    updateInlineFileCreateName?.((event.currentTarget as HTMLInputElement).value);
};

const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
        event.preventDefault();
        cancelInlineFileCreate?.();
    }
};

const handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    submitInlineFileCreate?.();
};
</script>

<form onsubmit={handleSubmit}>
    <span class:folder-mark={inlineFileCreate.kind === "folder"} class="file-mark" aria-hidden="true"></span>
    <input
        bind:this={inputElement}
        type="text"
        value={inlineFileCreate.fileName}
        aria-label={inlineFileCreate.inputLabel}
        required
        oninput={handleInput}
        onkeydown={handleKeydown}
    />
    <span class="pending-file-create-extension" aria-hidden="true">
        {inlineFileCreate.extension}
    </span>
    <button type="submit" class="pending-file-create-submit">
        {inlineFileCreate.submitLabel}
    </button>
    <button
        type="button"
        class="pending-file-create-cancel"
        aria-label={`Cancel ${inlineFileCreate.title}`}
        onclick={() => cancelInlineFileCreate?.()}
    >
        Cancel
    </button>
</form>

<style lang="scss">
form {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: 0.25rem;
    min-height: 1.75rem;
    padding: 0.15rem 0.2rem 0.15rem 0.45rem;

    background: oklch(0.93 0.035 155);
    border: 1px solid oklch(0.72 0.06 155);
    border-radius: 0.35rem;
}

.file-mark {
    position: relative;

    width: 1rem;
    height: 1rem;
}

.file-mark::before {
    position: absolute;
    top: 0.32rem;
    left: 0.32rem;

    width: 0.35rem;
    height: 0.35rem;

    background: oklch(0.58 0.1 180);
    border-radius: 999px;

    content: "";
}

.file-mark.folder-mark::before {
    top: 0.32rem;
    left: 0.14rem;

    width: 0.7rem;
    height: 0.45rem;

    background: oklch(0.72 0.08 85);
    border-radius: 0.12rem;
}

.file-mark.folder-mark::after {
    position: absolute;
    top: 0.22rem;
    left: 0.18rem;

    width: 0.38rem;
    height: 0.18rem;

    background: oklch(0.78 0.09 85);
    border-radius: 0.12rem 0.12rem 0 0;

    content: "";
}

input {
    min-width: 0;
    min-height: 1.45rem;
    padding: 0.1rem 0.25rem;

    color: oklch(0.22 0.055 245);
    font: inherit;

    background: oklch(0.995 0.006 235);
    border: 1px solid oklch(0.7 0.05 185);
    border-radius: 0.25rem;
}

input:focus-visible {
    outline: 2px solid oklch(0.55 0.14 250);
    outline-offset: 1px;
}

.pending-file-create-extension {
    color: oklch(0.38 0.06 245);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
}

button {
    display: block;
    width: auto;
    min-height: 1.45rem;
    padding: 0.1rem 0.28rem;

    color: oklch(0.28 0.04 255);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 700;
    text-align: center;
    text-transform: uppercase;

    background: oklch(0.98 0.012 155);
    border: 1px solid oklch(0.72 0.06 155);
    border-radius: 0.25rem;
    cursor: pointer;
    user-select: none;
}

button:hover:not(:disabled) {
    background: oklch(0.88 0.045 155);
}

button:focus-visible {
    outline: 2px solid oklch(0.55 0.14 250);
    outline-offset: 2px;
}
</style>
