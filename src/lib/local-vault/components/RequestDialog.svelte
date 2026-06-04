<script lang="ts">
import { onMount } from 'svelte';
import type { RequestDialogConfig, RequestDialogValues } from '../shared/types.js';

type Props = {
	config: RequestDialogConfig;
	values: RequestDialogValues;
	cancel: () => void;
	submit: (values: RequestDialogValues) => void;
	updateValue: (id: string, value: string) => void;
};

let { config, values, cancel, submit, updateValue }: Props = $props();
let dialogElement: HTMLDivElement | undefined = $state();

onMount(() => {
	dialogElement?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')?.focus();
});

function handleSubmit(event: SubmitEvent) {
	event.preventDefault();
	submit(values);
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		event.preventDefault();
		cancel();
	}
}

function handleInput(event: Event, id: string) {
	updateValue(id, (event.currentTarget as HTMLInputElement | HTMLSelectElement).value);
}
</script>

<div class="request-dialog-backdrop">
	<button type="button" class="request-dialog-scrim" onclick={cancel} aria-label="Cancel"></button>
	<div
		bind:this={dialogElement}
		class="request-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="request-dialog-heading"
		tabindex="-1"
		onkeydown={handleKeydown}
	>
		<form onsubmit={handleSubmit}>
			<header>
				<div>
					<p>Action</p>
					<h2 id="request-dialog-heading">{config.title}</h2>
				</div>
				<button type="button" onclick={cancel} aria-label="Cancel">
					Cancel
				</button>
			</header>

			{#if config.description}
				<p class="request-dialog-description">{config.description}</p>
			{/if}

			<div class="request-dialog-fields">
				{#each config.fields as field (field.id)}
					<label>
						<span>{field.label}</span>
						{#if field.inputKind === 'select'}
							<select
								value={values[field.id] ?? field.value}
								required={field.required}
								onchange={(event) => handleInput(event, field.id)}
							>
								{#if !field.required}
									<option value="">No value</option>
								{/if}
								{#each field.options ?? [] as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						{:else}
							<input
								type={field.inputKind ?? 'text'}
								value={values[field.id] ?? field.value}
								placeholder={field.placeholder}
								required={field.required}
								oninput={(event) => handleInput(event, field.id)}
							/>
						{/if}
						{#if field.help}
							<small>{field.help}</small>
						{/if}
					</label>
				{/each}
			</div>

			<footer>
				<button type="button" onclick={cancel}>Cancel</button>
				<button type="submit" class="primary">{config.submitLabel ?? 'Continue'}</button>
			</footer>
		</form>
	</div>
</div>

<style lang="scss">
.request-dialog-backdrop {
	position: fixed;
	inset: 0;
	z-index: 35;
	display: grid;
	place-items: start center;
	padding: clamp(1rem, 10vh, 4rem) 1rem 1rem;
	background: oklch(0.16 0.035 245 / 0.42);
}

.request-dialog-scrim {
	position: absolute;
	inset: 0;
	min-height: 0;
	padding: 0;
	background: transparent;
	border: 0;
	border-radius: 0;
}

.request-dialog-scrim:hover:not(:disabled) {
	background: transparent;
}

.request-dialog {
	position: relative;
	z-index: 1;
	width: min(100%, 30rem);
	max-height: min(42rem, calc(100vh - 2rem));
	padding: 0.85rem;
	overflow: auto;
	background: oklch(0.99 0.008 235);
	border: 1px solid oklch(0.76 0.04 235);
	border-radius: 0.45rem;
	box-shadow: 0 1.2rem 3rem oklch(0.16 0.04 245 / 0.24);
}

.request-dialog form {
	display: grid;
	gap: 0.75rem;
}

.request-dialog header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
}

.request-dialog p,
.request-dialog h2 {
	margin: 0;
}

.request-dialog header p {
	color: oklch(0.42 0.08 180);
	font-family: var(--font-mono);
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
}

.request-dialog h2 {
	font-size: 1.15rem;
	line-height: 1.1;
}

.request-dialog-description {
	color: oklch(0.42 0.045 245);
	font-size: 0.88rem;
}

.request-dialog-fields {
	display: grid;
	gap: 0.65rem;
}

.request-dialog-fields label {
	display: grid;
	gap: 0.28rem;
}

.request-dialog-fields label > span {
	color: oklch(0.36 0.06 245);
	font-family: var(--font-mono);
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
}

.request-dialog-fields input,
.request-dialog-fields select {
	width: 100%;
	min-height: 2.35rem;
	padding: 0.42rem 0.58rem;
	color: inherit;
	font: inherit;
	background: oklch(0.995 0.006 235);
	border: 1px solid oklch(0.72 0.045 235);
	border-radius: 0.35rem;
}

.request-dialog-fields input:focus-visible,
.request-dialog-fields select:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 2px;
}

.request-dialog-fields small {
	color: oklch(0.42 0.035 245);
	font-size: 0.78rem;
}

.request-dialog footer {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 0.45rem;
}
</style>
