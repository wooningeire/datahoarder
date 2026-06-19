import { expect, test, type Page } from '@playwright/test';
import { expectSelectedFilePath } from "./local-vault-ui.js";
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
	await expectSelectedFilePath(page, "capture.md");
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'capture' })).toBeVisible();

	await page.getByRole('button', { name: 'Rename' }).click();
	await fillRequestText(page, 'Rename Or Move File', 'File Path', 'archive/capture-renamed', 'Rename File');
	await expectSelectedFilePath(page, "archive/capture-renamed");
	await expect(page.locator('.sidebar-summary').getByText('1 files', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.locator('.sidebar-summary').getByText('0 files', { exact: true })).toBeVisible();
	await expect(page.locator('.sidebar-summary').getByText('0 notes', { exact: true })).toBeVisible();
	await expect(
		page.getByRole('region', { name: 'Editor' }).getByRole('heading', { name: 'No File Selected', exact: true })
	).toBeVisible();
});

test("new menu creates empty folders and notes inside them", async ({ page }) => {
	const vaultName = `datahoarder-e2e-folder-create-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();

			return root.getDirectoryHandle(name, { create: true });
		};
	}, vaultName);

	await page.goto("/");
	await page.getByRole("button", { name: "Open Folder" }).click();
	await expect(page.locator(".sidebar-summary").getByText("0 notes", { exact: true })).toBeVisible();

	await clickColumnNewItem(page, "Files", "New Folder");
	await fillInlineFileCreate(page, "New folder name", "Projects");
	await expect(page.locator(".note-columns").getByRole("button", { name: "Projects" })).toBeVisible();

	await page.locator(".note-columns").getByRole("button", { name: "Projects" }).click();
	await clickColumnNewItem(page, "Projects", "New Note");
	await fillInlineFileCreate(page, "New note name", "Kickoff");
	await expectSelectedFilePath(page, "Projects/Kickoff.md");
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

			for (let index = 0; index < 56; index++) {
				const file = await projects.getFileHandle(`Overflow ${String(index + 1).padStart(2, '0')}.md`, {
					create: true
				});
				const overflowWritable = await file.createWritable();

				await overflowWritable.write(`# Overflow ${index + 1}\n\nTall project note.`);
				await overflowWritable.close();
			}

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.getByText('Loading Monaco editor.')).toHaveCount(0);
	const projectsColumn = page
		.locator('.note-column')
		.filter({ has: page.getByRole('heading', { name: 'Projects', exact: true }) });

	try {
		await expect(projectsColumn).toBeVisible({ timeout: 1000 });
	} catch {
		await page.locator('.note-columns').getByRole('button', { name: 'Projects' }).click();
	}

	await expect(projectsColumn).toBeVisible();

	const projectsNewButton = projectsColumn.getByRole('button', { name: 'New', exact: true });
	const newMenuContainer = projectsColumn.locator(".new-menu");
	const projectsItems = projectsColumn.locator('.note-column-items');
	const noteColumns = page.locator('.note-columns');
	const initialScrollTop = await noteColumns.evaluate((node) => node.scrollTop);
	const columnsBox = await noteColumns.boundingBox();
	const newButtonBox = await projectsNewButton.boundingBox();
	const listHasVerticalOverflow = await projectsItems.evaluate((node) => node.scrollHeight > node.clientHeight);

	expect(columnsBox).not.toBeNull();
	expect(newButtonBox).not.toBeNull();
	expect(listHasVerticalOverflow).toBe(true);
	expect(newButtonBox!.y).toBeGreaterThanOrEqual(columnsBox!.y);
	expect(newButtonBox!.y + newButtonBox!.height).toBeLessThanOrEqual(columnsBox!.y + columnsBox!.height);
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
	const menuStyle = await newMenu.evaluate((node) => {
		const style = window.getComputedStyle(node);

		return {
			animationTimingFunction: style.animationTimingFunction,
			position: style.position,
		};
	});

	expect(menuStyle.position).toBe("absolute");
	expect(menuStyle.animationTimingFunction).toBe("cubic-bezier(0, 1, 0.5, 1)");
	await page.getByRole("button", { name: "Open Folder" }).focus();
	await expect(newMenu).toHaveCount(0);
	await page.mouse.click(clickPoint.x, clickPoint.y);
	await expect(newMenu).toBeVisible();
	const openedNewButtonBox = await projectsNewButton.boundingBox();
	const newMenuContainerBox = await newMenuContainer.boundingBox();
	const newMenuBox = await newMenu.boundingBox();
	expect(openedNewButtonBox).not.toBeNull();
	expect(newMenuContainerBox).not.toBeNull();
	expect(newMenuBox).not.toBeNull();
	expect(Math.abs(openedNewButtonBox!.y - newButtonBox!.y)).toBeLessThan(2);
	expect(Math.abs(openedNewButtonBox!.height - newButtonBox!.height)).toBeLessThan(2);
	expect(Math.abs(newMenuBox!.x - newMenuContainerBox!.x)).toBeLessThan(1);
	expect(Math.abs(newMenuBox!.width - newMenuContainerBox!.width)).toBeLessThan(1);
	expect(newMenuBox!.y + newMenuBox!.height).toBeLessThanOrEqual(openedNewButtonBox!.y + 1);
	await expect.poll(async () => noteColumns.evaluate((node) => node.scrollTop)).toBe(initialScrollTop);
	await newMenu.getByRole('menuitem', { name: 'New Note' }).click();
	const noteNameInput = page.getByRole('textbox', { name: 'New note name' });
	const pendingCreate = page.locator('.pending-file-create');

	await expect(noteNameInput).toHaveValue('Untitled');
	await expect(pendingCreate.getByText('.md')).toBeVisible();
	await noteNameInput.press('Enter');
	await expectSelectedFilePath(page, "Projects/Untitled.md");
});
