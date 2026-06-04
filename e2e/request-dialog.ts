import { expect, type Page } from '@playwright/test';

export async function fillRequestText(
	page: Page,
	title: string | RegExp,
	label: string,
	value: string,
	submitLabel: string
) {
	const dialog = page.getByRole('dialog', { name: title });

	await expect(dialog).toBeVisible();
	await dialog.getByRole('textbox', { name: label }).fill(value);
	await dialog.getByRole('button', { name: submitLabel }).click();
}

export async function fillRequestFields(
	page: Page,
	title: string | RegExp,
	fields: Record<string, string>,
	submitLabel: string
) {
	const dialog = page.getByRole('dialog', { name: title });

	await expect(dialog).toBeVisible();

	for (const [label, value] of Object.entries(fields)) {
		const textbox = dialog.getByRole('textbox', { name: label });
		const combobox = dialog.getByRole('combobox', { name: label });

		if (await textbox.count()) {
			await textbox.fill(value);
			continue;
		}

		await combobox.selectOption(value);
	}

	await dialog.getByRole('button', { name: submitLabel }).click();
}

export async function fillInlineFileCreate(page: Page, label: string, value: string) {
	const input = page.getByRole('textbox', { name: label });

	await expect(input).toBeVisible();
	await input.fill(value);
	await input.press('Enter');
}
