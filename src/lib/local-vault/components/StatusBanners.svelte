<script lang="ts">
type Props = {
	errorMessage: string;
};

let { errorMessage }: Props = $props();
</script>

<div class="bottom-banners">
	{#if errorMessage}
		<p class="error-message">{errorMessage}</p>
	{/if}
</div>

<style lang="scss">
.bottom-banners {
	position: fixed;
	inset: 0 0 auto;
	z-index: 20;
	display: grid;
	justify-items: center;
	padding: 0 1rem;
	pointer-events: none;
}

.error-message {
	width: min(100%, 52rem);
	margin: 0.75rem auto 0;
	padding: 0.55rem 1rem;
	color: oklch(0.34 0.13 30);
	background: oklch(0.94 0.07 45);
	border: 1px solid oklch(0.8 0.08 45);
	border-radius: 0.35rem;
	box-shadow: 0 0.6rem 1.6rem oklch(0.21 0.04 245 / 0.16);
	pointer-events: auto;
}
</style>
