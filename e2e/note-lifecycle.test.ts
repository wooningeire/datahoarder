import { expect, test } from '@playwright/test';

test('note lifecycle actions create rename and delete notes', async ({ page }) => {
	const vaultName = `datahoarder-e2e-lifecycle-${Date.now()}`;
	const promptResponses = ['inbox/capture.md', 'archive/capture-renamed.md'];

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();

			return root.getDirectoryHandle(name, { create: true });
		};
	}, vaultName);

	page.on('dialog', async (dialog) => {
		if (dialog.type() === 'prompt') {
			await dialog.accept(promptResponses.shift() ?? '');
			return;
		}

		await dialog.accept();
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.locator('.sidebar-summary').getByText('0 notes', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'New Note' }).click();
	await expect(page.getByText('Created inbox/capture.md')).toBeVisible();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'capture' })).toBeVisible();

	await page.getByRole('button', { name: 'Rename' }).click();
	await expect(page.getByText('Renamed inbox/capture.md to archive/capture-renamed.md')).toBeVisible();
	await expect(page.getByLabel('Editor').getByText('archive/capture-renamed.md')).toBeVisible();

	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('Deleted archive/capture-renamed.md')).toBeVisible();
	await expect(page.locator('.sidebar-summary').getByText('0 notes', { exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'No File Selected' })).toBeVisible();
});
