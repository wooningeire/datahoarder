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
