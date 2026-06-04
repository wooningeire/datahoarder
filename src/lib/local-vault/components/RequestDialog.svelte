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
