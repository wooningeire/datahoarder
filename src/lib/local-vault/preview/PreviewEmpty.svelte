<script lang="ts">
type Props = {
	description: string;
	title: string;
	variant?: 'default' | 'collection';
};

let { description, title, variant = 'default' }: Props = $props();
</script>

<div class:collection-empty={variant === 'collection'} class="preview-empty">
	<h2>{title}</h2>
	<p>{description}</p>
</div>

<style lang="scss">
.preview-empty {
	display: grid;
	align-content: center;
	gap: 0.5rem;
	height: 100%;
	padding: 1rem;

	text-align: center;

	p,
	h2 {
		margin: 0;
	}

	p {
		color: oklch(0.42 0.035 245);
	}

	&.collection-empty {
		min-height: 12rem;

		border: 1px dashed oklch(0.78 0.04 100);
		border-radius: 0.35rem;
	}
}
</style>
