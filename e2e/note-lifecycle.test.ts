import { expect, test, type Page } from '@playwright/test';
import { fillInlineFileCreate, fillRequestText } from './request-dialog.js';

async function clickColumnNewItem(page: Page, columnName: string, itemName: string) {
	const column = page
		.locator('.note-column')
		.filter({ has: page.getByRole('heading', { name: columnName, exact: true }) });

	await column.getByRole('button', { name: 'New', exact: true }).click();
	await page.getByRole('menu', { name: 'New options' }).getByRole('menuitem', { name: itemName }).click();
}

test('note lifecycle actions create rename and delete notes', async ({ page }) => {
	const vaultName = `datahoarder-e2e-lifecycle-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();

			return root.getDirectoryHandle(name, { create: true });
		};
	}, vaultName);

	page.on('dialog', async (dialog) => {
		await dialog.accept();
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.locator('.sidebar-summary').getByText('0 notes', { exact: true })).toBeVisible();

	await clickColumnNewItem(page, 'Files', 'New Note');
	await fillInlineFileCreate(page, 'New note name', 'capture');
	await expect(page.getByText('Created capture.md')).toBeVisible();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'capture' })).toBeVisible();

	await page.getByRole('button', { name: 'Rename' }).click();
	await fillRequestText(page, 'Rename Or Move File', 'File Path', 'archive/capture-renamed.md', 'Rename File');
	await expect(page.getByText('Renamed capture.md to archive/capture-renamed.md')).toBeVisible();
	await expect(page.getByLabel('Editor').getByText('archive/capture-renamed.md')).toBeVisible();

	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('Deleted archive/capture-renamed.md')).toBeVisible();
	await expect(page.locator('.sidebar-summary').getByText('0 notes', { exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'No File Selected' })).toBeVisible();
});

test('column new menu creates notes in the selected folder', async ({ page }) => {
	const vaultName = `datahoarder-e2e-column-new-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const projects = await directory.getDirectoryHandle('Projects', { create: true });
			const seed = await projects.getFileHandle('Seed.md', { create: true });
			const writable = await seed.createWritable();

			await writable.write('# Seed\n\nExisting project note.');
			await writable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.getByText('Loading Monaco editor.')).toHaveCount(0);
	await page.locator('.note-columns').getByRole('button', { name: 'Projects' }).click();
	const projectsColumn = page
		.locator('.note-column')
		.filter({ has: page.getByRole('heading', { name: 'Projects', exact: true }) });
	const projectsNewButton = projectsColumn.getByRole('button', { name: 'New', exact: true });
	const noteColumns = page.locator('.note-columns');
	const initialScrollTop = await noteColumns.evaluate((node) => node.scrollTop);
	const newButtonBox = await projectsNewButton.boundingBox();
	expect(newButtonBox).not.toBeNull();
	const clickPoint = {
		x: newButtonBox!.x + newButtonBox!.width / 2,
		y: newButtonBox!.y + newButtonBox!.height / 2
	};
	const clickHitsNewTrigger = await page.evaluate(
		({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.new-menu-trigger')),
		clickPoint
	);
	expect(clickHitsNewTrigger).toBe(true);
	await page.mouse.click(clickPoint.x, clickPoint.y);
	const newMenu = page.getByRole('menu', { name: 'New options' });
	await expect(newMenu).toBeVisible();
	const openedNewButtonBox = await projectsNewButton.boundingBox();
	const newMenuBox = await newMenu.boundingBox();
	expect(openedNewButtonBox).not.toBeNull();
	expect(newMenuBox).not.toBeNull();
	expect(Math.abs(openedNewButtonBox!.y - newButtonBox!.y)).toBeLessThan(2);
	expect(Math.abs(openedNewButtonBox!.height - newButtonBox!.height)).toBeLessThan(2);
	expect(newMenuBox!.y + newMenuBox!.height).toBeLessThanOrEqual(openedNewButtonBox!.y + 1);
	await expect.poll(async () => noteColumns.evaluate((node) => node.scrollTop)).toBe(initialScrollTop);
	await newMenu.getByRole('menuitem', { name: 'New Note' }).click();
	const noteNameInput = page.getByRole('textbox', { name: 'New note name' });
	const pendingCreate = page.locator('.pending-file-create');

	await expect(noteNameInput).toHaveValue('Untitled');
	await expect(pendingCreate.getByText('.md')).toBeVisible();
	await noteNameInput.press('Enter');
	await expect(page.getByText('Created Projects/Untitled.md')).toBeVisible();
	await expect(page.getByLabel('Editor').getByText('Projects/Untitled.md')).toBeVisible();
});
