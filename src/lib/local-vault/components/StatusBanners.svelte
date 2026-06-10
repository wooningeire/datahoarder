<script lang="ts">
type Props = {
    errorMessage: string,
    status?: string,
};

let { errorMessage, status = "" }: Props = $props();

let statusText = $derived(status.trim());
let errorText = $derived(errorMessage.trim());
</script>

{#if statusText || errorText}
    <section class="status-row" aria-label="Vault status">
        {#if statusText}
            <p class="status-message" role="status" aria-live="polite">{statusText}</p>
        {/if}
        {#if errorText}
            <p class="error-message" role="alert">{errorText}</p>
        {/if}
    </section>
{/if}

<style lang="scss">
.status-row {
    grid-row: 3;
    grid-column: 1;

    display: grid;
    gap: 0.35rem;
    min-width: 0;
    padding: 0.45rem 1rem;

    color: oklch(0.25 0.04 235);
    background: oklch(0.985 0.01 235);
    border-top: 1px solid oklch(0.8 0.025 235);
}

.status-message,
.error-message {
    min-width: 0;
    margin: 0;

    font-size: 0.9rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
}

.status-message {
    color: oklch(0.27 0.08 170);
}

.error-message {
    color: oklch(0.34 0.13 30);
}
</style>
