<script lang="ts">
	import "./index.css";
	import "$lib/local-vault/styles/layout.css";
	import "$lib/local-vault/styles/collection.css";
	import "$lib/local-vault/styles/markdown.css";
	import "$lib/local-vault/styles/responsive.css";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" />
</svelte:head>

{@render children()}
