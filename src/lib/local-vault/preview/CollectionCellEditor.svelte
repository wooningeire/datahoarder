<script lang="ts">
type Props = {
	inputKind: string;
	label: string;
	options: string[];
	recordTitle: string;
	saving: boolean;
	value: string;
	cancel: () => void;
	save: () => void;
	updateValue: (value: string) => void;
};

let {
	inputKind,
	label,
	options,
	recordTitle,
	saving,
	value,
	cancel,
	save,
	updateValue
}: Props = $props();

function handleSubmit(event: SubmitEvent) {
	event.preventDefault();
	save();
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		event.preventDefault();
		cancel();
	}
}

function handleValueInput(event: Event) {
	updateValue((event.currentTarget as HTMLInputElement | HTMLSelectElement).value);
}
</script>

<form class="collection-cell-form" onsubmit={handleSubmit}>
	{#if inputKind === 'select'}
		<select
			{value}
			onchange={handleValueInput}
			onkeydown={handleKeydown}
			aria-label={`${label} for ${recordTitle}`}
		>
			<option value="">No value</option>
			{#each options as option (option)}
				<option value={option}>{option}</option>
			{/each}
		</select>
	{:else if inputKind === 'boolean'}
		<select
			{value}
			onchange={handleValueInput}
			onkeydown={handleKeydown}
			aria-label={`${label} for ${recordTitle}`}
		>
			<option value="">No value</option>
			<option value="true">true</option>
			<option value="false">false</option>
		</select>
	{:else}
		<input
			type={inputKind}
			{value}
			oninput={handleValueInput}
			onkeydown={handleKeydown}
			aria-label={`${label} for ${recordTitle}`}
		/>
	{/if}
	<button type="submit" disabled={saving} aria-label={`Save ${label} for ${recordTitle}`}>
		Save
	</button>
	<button type="button" onclick={cancel} aria-label={`Cancel ${label} for ${recordTitle}`}>
		Cancel
	</button>
</form>

<style lang="scss">
.collection-cell-form {
	display: grid;
	grid-template-columns: minmax(8rem, 1fr) auto auto;
	gap: 0.35rem;
	align-items: center;
	min-width: min(100%, 16rem);
}

.collection-cell-form input,
.collection-cell-form select {
	min-width: 0;
	min-height: 1.9rem;
	padding: 0.25rem 0.4rem;
	color: inherit;
	background: oklch(0.99 0.006 95);
	border: 1px solid oklch(0.7 0.06 105);
	border-radius: 0.3rem;
}

.collection-cell-form input:focus-visible,
.collection-cell-form select:focus-visible {
	outline: 2px solid oklch(0.55 0.13 205);
	outline-offset: 1px;
}

.collection-cell-form button {
	min-height: 1.9rem;
	padding: 0.25rem 0.45rem;
	font-size: 0.78rem;
}
</style>
