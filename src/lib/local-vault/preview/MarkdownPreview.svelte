<script lang="ts">
import MarkdownBoardStyles from './MarkdownBoardStyles.svelte';
import MarkdownDataStyles from './MarkdownDataStyles.svelte';

type PreviewAction = (node: HTMLElement) => {
	destroy?: () => void;
};

type Props = {
	html: string;
	host?: HTMLElement;
	previewLinkNavigation: PreviewAction;
};

let { html, host = $bindable<HTMLElement | undefined>(), previewLinkNavigation }: Props = $props();
</script>

<article
	class="markdown-preview"
	bind:this={host}
	use:previewLinkNavigation
>
	{@html html}
</article>

<MarkdownDataStyles />
<MarkdownBoardStyles />

<style lang="scss">
:global {
	.markdown-preview {
		display: grid;
		gap: 0.75rem;

		line-height: 1.45;

		h1,
		h2,
		h3,
		p,
		ul,
		ol,
		blockquote,
		.note-embed,
		.markdown-table-wrapper,
		.whiteboard-preview-svg,
		.datahoarder-board,
		.datahoarder-metrics,
		pre {
			margin: 0;
		}

		h1 {
			font-size: 2rem;
			line-height: 1.05;
		}

		h2 {
			font-size: 1.35rem;
			line-height: 1.1;
		}

		blockquote {
			padding-left: 0.75rem;

			color: oklch(0.35 0.045 245);

			border-left: 3px solid oklch(0.7 0.07 190);
		}

		code,
		pre {
			font-family: var(--font-mono);
		}

		pre {
			padding: 0.7rem;

			background: oklch(0.94 0.018 235);
			border-radius: 0.35rem;
		}

		.markdown-table-wrapper {
			max-width: 100%;
			overflow: auto;

			border: 1px solid oklch(0.82 0.025 100);
			border-radius: 0.35rem;
		}

		.markdown-table {
			min-width: min(32rem, 100%);

			border: 0;

			th,
			td {
				border-bottom: 1px solid oklch(0.86 0.025 100);
			}

			th {
				position: static;
				top: auto;
				z-index: auto;

				background: oklch(0.96 0.025 105);
			}

			tr:last-child td {
				border-bottom: 0;
			}

			[data-align='center'] {
				text-align: center;
			}

			[data-align='right'] {
				text-align: right;
			}
		}

		.task-list-item {
			display: flex;
			gap: 0.45rem;
			align-items: flex-start;

			list-style: none;

			input {
				flex: 0 0 auto;
				width: 1rem;
				height: 1rem;
				margin: 0.22rem 0 0;

				accent-color: oklch(0.62 0.15 220);
			}

			span {
				min-width: 0;
			}
		}

		.note-embed {
			display: grid;
			gap: 0.65rem;
			padding: 0.75rem;

			background: oklch(0.985 0.012 95);
			border: 1px solid oklch(0.78 0.04 100);
			border-left: 4px solid oklch(0.63 0.12 155);
			border-radius: 0.35rem;

			header {
				display: flex;
				margin: 0;
				padding: 0;

				border: 0;

				a {
					color: oklch(0.28 0.08 155);
					font-size: 0.82rem;
					font-weight: 700;
					text-decoration: none;
				}
			}
		}

		.note-embed-body {
			display: grid;
			gap: 0.65rem;
		}

		.note-embed-missing {
			color: oklch(0.42 0.055 25);

			background: oklch(0.98 0.018 45);
			border-left-color: oklch(0.66 0.12 35);
		}

		.excalidraw-preview-svg,
		.whiteboard-preview-svg {
			width: 100%;
			max-height: 42rem;

			background: oklch(0.995 0.006 95);
			border: 1px solid oklch(0.78 0.04 100);
			border-radius: 0.35rem;
		}

		.server-vite-preview-frame {
			display: block;
			width: 100%;
			min-height: min(72vh, 48rem);

			background: white;
			border: 1px solid oklch(0.78 0.04 100);
			border-radius: 0.35rem;
		}

		.math-display,
		mjx-container[display="true"] {
			max-width: 100%;
			overflow-x: auto;
			overflow-y: hidden;
		}

		.math-display {
			display: block;
			margin: 1rem 0;

			text-align: center;
		}

		mjx-container[display="true"] {
			padding-block: 0.125rem;
		}
	}
}
</style>
