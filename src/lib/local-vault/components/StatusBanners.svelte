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
