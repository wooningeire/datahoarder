<style lang="scss">
:global {
	.markdown-preview {
		.datahoarder-sankey {
			display: grid;
			gap: 0.45rem;
			padding: 0.75rem;

			background: oklch(0.995 0.006 95);
			border: 1px solid oklch(0.78 0.04 100);
			border-radius: 0.35rem;

			figcaption {
				color: oklch(0.42 0.045 245);
				font-family: var(--font-mono);
				font-size: 0.78rem;
			}
		}

		.datahoarder-sankey-svg {
			width: 100%;
			height: auto;
			min-height: 14rem;
		}

		.datahoarder-sankey-link {
			stroke: oklch(0.62 0.15 220);
			stroke-linecap: round;
			stroke-opacity: 0.36;

			&-1 {
				stroke: oklch(0.62 0.13 155);
			}

			&-2 {
				stroke: oklch(0.72 0.15 80);
			}

			&-3 {
				stroke: oklch(0.62 0.16 35);
			}

			&-4 {
				stroke: oklch(0.58 0.17 300);
			}

			&-5 {
				stroke: oklch(0.64 0.13 190);
			}

			&-6 {
				stroke: oklch(0.63 0.17 345);
			}

			&-7 {
				stroke: oklch(0.5 0.05 245);
			}
		}

		.datahoarder-sankey-node {
			rect {
				fill: oklch(0.32 0.06 245);
			}
		}

		.datahoarder-sankey-label {
			fill: oklch(0.22 0.05 245);
			font-size: 0.82rem;
			font-weight: 700;
		}

		.datahoarder-sankey-value,
		.datahoarder-sankey-empty {
			fill: oklch(0.42 0.045 245);
			color: oklch(0.42 0.045 245);
			font-family: var(--font-mono);
			font-size: 0.72rem;
		}

		.datahoarder-metrics {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
			gap: 0.6rem;
		}

		.datahoarder-metric {
			display: grid;
			gap: 0.35rem;
			min-width: 0;
			padding: 0.75rem;

			background: oklch(0.995 0.006 95);
			border: 1px solid oklch(0.78 0.04 100);
			border-left: 4px solid oklch(0.52 0.07 245);
			border-radius: 0.35rem;

			&-good {
				border-left-color: oklch(0.62 0.13 155);
			}

			&-warning {
				border-left-color: oklch(0.72 0.15 80);
			}

			&-bad {
				border-left-color: oklch(0.62 0.16 35);
			}

			&-info {
				border-left-color: oklch(0.62 0.15 220);
			}
		}

		.datahoarder-metric-label,
		.datahoarder-metrics-empty {
			color: oklch(0.42 0.045 245);
			font-family: var(--font-mono);
			font-size: 0.72rem;
			font-weight: 700;
			text-transform: uppercase;

			overflow-wrap: anywhere;
		}

		.datahoarder-metric-value {
			color: oklch(0.2 0.055 245);
			font-size: 1.35rem;
			line-height: 1.1;

			overflow-wrap: anywhere;
		}

		.datahoarder-metric-detail {
			color: oklch(0.36 0.045 245);
			font-size: 0.82rem;

			overflow-wrap: anywhere;
		}
	}
}
</style>
