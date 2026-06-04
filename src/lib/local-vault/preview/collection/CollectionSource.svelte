<script lang="ts">
type Props = {
	content: string;
};

let { content }: Props = $props();
</script>

<details class="collection-source">
	<summary>Source</summary>
	<pre>{content}</pre>
</details>

<style lang="scss">
.collection-source {
	display: grid;
	gap: 0.55rem;

	summary {
		width: fit-content;

		color: oklch(0.3 0.05 245);
		font-weight: 700;

		cursor: pointer;
	}

	pre {
		max-width: 100%;
		margin: 0;
		overflow: auto;

		white-space: pre-wrap;
	}
}
</style>
