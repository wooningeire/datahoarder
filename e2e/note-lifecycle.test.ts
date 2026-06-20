import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectSelectedFilePath } from "./local-vault-ui.js";
import { fillInlineFileCreate, fillRequestText } from './request-dialog.js';

async function clickColumnNewItem(page: Page, columnName: string, itemName: string) {
	const column = page
		.locator('.note-column')
		.filter({ has: page.getByRole('heading', { name: columnName, exact: true }) });

	await column.getByRole('button', { name: 'New', exact: true }).click();
	await page.getByRole('menu', { name: 'New options' }).getByRole('menuitem', { name: itemName }).click();
}

async function dragToAndReadTargetCursor(page: Page, source: Locator, target: Locator) {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();

    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    if (!sourceBox || !targetBox) {
        throw new Error("Drag source or target is not visible.");
    }

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();

    try {
        await page.mouse.move(
            sourceBox.x + sourceBox.width / 2 + 8,
            sourceBox.y + sourceBox.height / 2 + 8,
            { steps: 2 },
        );
        await page.mouse.move(
            targetBox.x + targetBox.width / 2,
            targetBox.y + targetBox.height / 2,
            { steps: 8 },
        );

        await expect(page.locator(".note-columns")).toHaveClass(/tree-dragging/);
        await expect.poll(async () => target.evaluate((node) => getComputedStyle(node).cursor)).toBe("grabbing");

        const cursor = await target.evaluate((node) => getComputedStyle(node).cursor);

        return cursor;
    } finally {
        await page.mouse.up();
    }
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

test("dragging files and folders moves them between tree targets", async ({ page }) => {
    const vaultName = `datahoarder-e2e-drag-move-${Date.now()}`;

    await page.addInitScript((name) => {
        window.showDirectoryPicker = async () => {
            const root = await navigator.storage.getDirectory();
            const directory = await root.getDirectoryHandle(name, { create: true });
            const archive = await directory.getDirectoryHandle("Archive", { create: true });
            const file = await directory.getFileHandle("Capture.md", { create: true });
            const writable = await file.createWritable();

            await archive.getDirectoryHandle("Nested", { create: true });
            await directory.getDirectoryHandle("Projects", { create: true });
            await writable.write("# Capture\n\nDrag me.");
            await writable.close();

            return directory;
        };
    }, vaultName);

    await page.goto("/");
    await page.getByRole("button", { name: "Open Folder" }).click();
    await expectSelectedFilePath(page, "Capture.md");

    const noteColumns = page.locator(".note-columns");
    const rootColumn = page
        .locator(".note-column")
        .filter({ has: page.getByRole("heading", { name: "Files", exact: true }) });
    const sourceFile = rootColumn.getByRole("button", { name: "Capture.md" });
    const archiveFolder = rootColumn.getByRole("button", { name: "Archive" });
    const projectsFolder = rootColumn.getByRole("button", { name: "Projects" });
    const beforeBox = await noteColumns.boundingBox();

    expect(beforeBox).not.toBeNull();
    await expect(sourceFile).toHaveClass(/drag-enabled/);
    await expect(archiveFolder).toHaveClass(/drag-enabled/);
    await expect(projectsFolder).toHaveClass(/drag-enabled/);

    const fileTargetCursor = await dragToAndReadTargetCursor(page, sourceFile, archiveFolder);

    expect(fileTargetCursor).toBe("grabbing");
    await expectSelectedFilePath(page, "Archive/Capture.md");
    await expect(sourceFile).toHaveCount(0);

    const folderTargetCursor = await dragToAndReadTargetCursor(page, archiveFolder, projectsFolder);

    expect(folderTargetCursor).toBe("grabbing");
    await expectSelectedFilePath(page, "Projects/Archive/Capture.md");
    await expect(archiveFolder).toHaveCount(0);

    const projectsColumn = page
        .locator(".note-column")
        .filter({ has: page.getByRole("heading", { name: "Projects", exact: true }) });
    const archiveColumn = page
        .locator(".note-column")
        .filter({ has: page.getByRole("heading", { name: "Archive", exact: true }) });

    await expect(projectsColumn.getByRole("button", { name: "Archive" })).toBeVisible();
    await expect(archiveColumn.getByRole("button", { name: "Capture.md" })).toBeVisible();

    const projectsHeading = projectsColumn.getByRole("heading", { name: "Projects", exact: true });
    const columnTargetCursor = await dragToAndReadTargetCursor(
        page,
        archiveColumn.getByRole("button", { name: "Capture.md" }),
        projectsHeading,
    );

    expect(columnTargetCursor).toBe("grabbing");
    await expect(page.locator(".topbar").getByRole("heading", { name: /^Projects\/Capture\.md$/u })).toBeVisible();

    const storedFile = await page.evaluate(async (name) => {
        const root = await navigator.storage.getDirectory();
        const directory = await root.getDirectoryHandle(name);
        const projects = await directory.getDirectoryHandle("Projects");
        const projectsArchive = await projects.getDirectoryHandle("Archive");
        const movedFile = await projects.getFileHandle("Capture.md");
        const movedText = await (await movedFile.getFile()).text();
        let projectsArchiveFileExists = true;
        let rootArchiveExists = true;

        try {
            await projectsArchive.getFileHandle("Capture.md");
        } catch {
            projectsArchiveFileExists = false;
        }

        try {
            await directory.getDirectoryHandle("Archive");
        } catch {
            rootArchiveExists = false;
        }

        return {
            movedText,
            projectsArchiveFileExists,
            rootArchiveExists,
        };
    }, vaultName);

    expect(storedFile.movedText).toBe("# Capture\n\nDrag me.");
    expect(storedFile.projectsArchiveFileExists).toBe(false);
    expect(storedFile.rootArchiveExists).toBe(false);

    const afterBox = await noteColumns.boundingBox();

    expect(afterBox).not.toBeNull();
    expect(afterBox!.width).toBe(beforeBox!.width);
    expect(afterBox!.height).toBe(beforeBox!.height);
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
