<style lang="scss">
:global {
	.markdown-preview {
		.datahoarder-board {
			display: grid;
			gap: 0.55rem;

			figcaption {
				color: oklch(0.28 0.06 245);
				font-size: 0.9rem;
				font-weight: 700;
			}

			&-empty {
				color: oklch(0.42 0.045 245);
				font-family: var(--font-mono);
				font-size: 0.78rem;
			}
		}

		.datahoarder-board-canvas {
			display: block;
			width: 100%;
			height: auto;
			min-height: 18rem;
			max-height: 42rem;

			background: oklch(0.985 0.01 235);
			border: 1px solid oklch(0.78 0.04 100);
			border-radius: 0.35rem;
		}

		.datahoarder-board-edges {
			pointer-events: none;

			marker path {
				fill: oklch(0.45 0.08 220);
			}
		}

		.datahoarder-board-edge {
			path {
				fill: none;
				stroke: oklch(0.45 0.08 220);
				stroke-width: 2.5;
				stroke-linecap: round;
				stroke-opacity: 0.58;
				marker-end: url(#datahoarder-board-arrow);
			}

			text {
				fill: oklch(0.32 0.06 245);
				font-family: var(--font-mono);
				font-size: 0.75rem;
				font-weight: 700;
				paint-order: stroke;
				stroke: oklch(0.985 0.01 235);
				stroke-width: 4;
			}
		}

		.datahoarder-board-node-shell {
			overflow: visible;
		}

		.datahoarder-board-node {
			display: grid;
			align-content: start;
			gap: 0.35rem;
			box-sizing: border-box;
			width: 100%;
			height: 100%;
			min-width: 7rem;
			padding: 0.55rem 0.65rem;
			overflow: hidden;

			background: oklch(0.995 0.006 95);
			border: 1px solid oklch(0.76 0.04 100);
			border-left: 4px solid oklch(0.52 0.06 245);
			border-radius: 0.35rem;
			box-shadow: 0 0.45rem 1rem oklch(0.28 0.05 245 / 0.12);

			h3,
			p {
				min-width: 0;
				margin: 0;

				overflow-wrap: anywhere;
			}

			h3 {
				font-size: 0.92rem;
				line-height: 1.15;

				a {
					color: oklch(0.3 0.1 190);
					text-decoration-thickness: 1px;
					text-underline-offset: 0.16em;
				}
			}

			p {
				color: oklch(0.36 0.045 245);
				font-size: 0.78rem;

				white-space: pre-wrap;
			}

			&-blue {
				border-left-color: oklch(0.62 0.15 220);
			}

			&-green {
				border-left-color: oklch(0.62 0.13 155);
			}

			&-yellow {
				border-left-color: oklch(0.72 0.15 80);
			}

			&-red {
				border-left-color: oklch(0.62 0.16 35);
			}

			&-purple {
				border-left-color: oklch(0.58 0.17 300);
			}
		}
	}
}
</style>
