<script lang="ts">
type Props = {
	dirty: boolean;
	errorMessage: string;
	monacoState: 'fallback' | 'idle' | 'loading' | 'ready';
	status: string;
};

let { dirty, errorMessage, monacoState, status }: Props = $props();
</script>

<div class="bottom-banners">
	{#if errorMessage}
		<p class="error-message">{errorMessage}</p>
	{/if}

	{#if status || monacoState === 'fallback' || monacoState === 'loading' || dirty}
		<section class="status-row" aria-live="polite">
			{#if status}
				<span>{status}</span>
			{/if}
			{#if monacoState === 'fallback'}
				<span>Textarea fallback active.</span>
			{:else if monacoState === 'loading'}
				<span>Loading Monaco editor.</span>
			{/if}
			{#if dirty}
				<strong>Unsaved</strong>
			{/if}
		</section>
	{/if}
</div>

<style lang="scss">
.bottom-banners {
	grid-row: 3;
	grid-column: 1;
	min-height: 0;
	max-height: min(45vh, 14rem);
	overflow: auto;
}

.status-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.55rem;
	align-items: center;
	min-height: 2.15rem;
	padding: 0.35rem 1rem calc(0.35rem + env(safe-area-inset-bottom));
	color: oklch(0.34 0.04 245);
	font-family: var(--font-mono);
	font-size: 0.78rem;
	background: oklch(0.99 0.01 235);
	border-top: 1px solid oklch(0.82 0.025 235);
}

.status-row strong {
	color: oklch(0.47 0.14 55);
}

.error-message {
	margin: 0;
	padding: 0.55rem 1rem;
	color: oklch(0.34 0.13 30);
	background: oklch(0.94 0.07 45);
	border-top: 1px solid oklch(0.8 0.08 45);
}
</style>
