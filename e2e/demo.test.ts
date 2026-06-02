import { expect, test } from '@playwright/test';

test('home page has expected h1', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});

test('Monaco editor shows a cursor after opening a local vault', async ({ page }) => {
	await page.addInitScript(() => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle('datahoarder-e2e-vault', { create: true });
			const file = await directory.getFileHandle('cursor-test.md', { create: true });
			const writable = await file.createWritable();

			await writable.write('# Cursor Test\n\nType here.');
			await writable.close();

			return directory;
		};
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	const editor = page.locator('.monaco-editor');
	await expect(editor).toBeVisible();
	await editor.click();
	await page.keyboard.type('!');

	const cursor = page.locator('.monaco-editor .cursors-layer .cursor');
	await expect(cursor).toBeVisible();

	const cursorBox = await cursor.boundingBox();
	expect(cursorBox?.height).toBeGreaterThan(0);
	expect(cursorBox?.width).toBeGreaterThan(0);
});
