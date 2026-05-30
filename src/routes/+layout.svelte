<script lang="ts">
	import "./index.css";

	import { afterNavigate } from '$app/navigation';
	import { onMount, tick } from 'svelte';

	let { children } = $props();

	type MathJaxApi = {
		startup?: {
			promise?: Promise<void>;
		};
		typesetPromise?: (elements?: Element[]) => Promise<void>;
	};

	type MathJaxWindow = Window & {
		MathJax?: MathJaxApi;
	};

	let typesetQueued = false;

	function queueMathTypeset() {
		if (typesetQueued) {
			return;
		}

		typesetQueued = true;

		void tick().then(async () => {
			typesetQueued = false;
			const mathJax = (window as MathJaxWindow).MathJax;

			if (!mathJax?.typesetPromise) {
				return;
			}

			await mathJax.startup?.promise;
			await mathJax.typesetPromise([document.body]);
		});
	}

	onMount(() => {
		queueMathTypeset();
	});

	afterNavigate(() => {
		queueMathTypeset();
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" />
	<script>
		window.MathJax = {
			loader: {
				load: ['[tex]/ams']
			},
			tex: {
				packages: { '[+]': ['ams'] },
				inlineMath: [['$', '$'], ['\\(', '\\)']],
				displayMath: [['$$', '$$'], ['\\[', '\\]']],
				processEscapes: true,
				processEnvironments: true
			},
			svg: {
				fontCache: 'global'
			},
			options: {
				skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
			}
		};
	</script>
	<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
</svelte:head>

{@render children()}