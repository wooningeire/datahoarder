<script lang="ts">
type Props = {
	filesCount: number;
	noteCount: number;
};

let { filesCount, noteCount }: Props = $props();
</script>

<div class="sidebar-summary">
	<span>{filesCount} files</span>
	<span>{noteCount} notes</span>
</div>

<style lang="scss">
.sidebar-summary {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;

	span {
		padding: 0.3rem 0.45rem;

		font-family: var(--font-mono);
		font-size: 0.74rem;

		background: oklch(0.92 0.035 205);
		border: 1px solid oklch(0.75 0.045 210);
		border-radius: 0.35rem;
	}
}
</style>
