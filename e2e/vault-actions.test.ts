import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { expectSelectedFilePath } from "./local-vault-ui.js";
import { fillInlineFileCreate, fillRequestFields } from './request-dialog.js';

async function clickColumnNewItem(page: Page, columnName: string, itemName: string) {
	const column = page
		.locator('.note-column')
		.filter({ has: page.getByRole('heading', { name: columnName, exact: true }) });

	await column.getByRole('button', { name: 'New', exact: true }).click();
	await page.getByRole('menu', { name: 'New options' }).getByRole('menuitem', { name: itemName }).click();
}

test('directory columns scroll to new folders and collapse smoothly', async ({ page }) => {
	const vaultName = `datahoarder-e2e-directory-column-scroll-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });

			const writeFile = async (filePath: string, content: string) => {
				const segments = filePath.split('/');
				const fileName = segments.pop() ?? filePath;
				let parent = directory;

				for (const segment of segments) {
					parent = await parent.getDirectoryHandle(segment, { create: true });
				}

				const file = await parent.getFileHandle(fileName, { create: true });
				const writable = await file.createWritable();

				await writable.write(content);
				await writable.close();
			};

			await writeFile('alpha.md', '# Alpha\n\nRoot note.');
			await writeFile('Atlas/Beacon/Cascade/Delta/Echo/target.md', '# Target\n\nNested note.');

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	const noteColumns = page.locator('.note-columns');
	const getScrollState = () =>
		noteColumns.evaluate((node) => {
			const element = node as HTMLElement;

			return {
				left: element.scrollLeft,
				max: Math.max(0, element.scrollWidth - element.clientWidth),
				paddingRight: Number.parseFloat(window.getComputedStyle(element).paddingRight)
			};
		});

	await noteColumns.getByRole('button', { name: 'alpha.md' }).dispatchEvent('click');
	await expectSelectedFilePath(page, "alpha.md");
	await expect.poll(async () => (await getScrollState()).left).toBeLessThan(1);

	await noteColumns.getByRole('button', { name: 'Atlas' }).click();
	await noteColumns.getByRole('button', { name: 'Beacon' }).click();
	await expect.poll(async () => (await getScrollState()).left).toBeGreaterThan(80);
	const afterBeacon = await getScrollState();
	expect(afterBeacon.max).toBeGreaterThan(0);

    await noteColumns.evaluate((node) => {
        (node as HTMLElement).scrollLeft = 0;
    });
    await expect.poll(async () => (await getScrollState()).left).toBeLessThan(1);

    const itemListBox = await page.locator(".note-column-items").first().boundingBox();

    if (!itemListBox) {
        throw new Error("Expected directory column items to be available for scroll verification.");
    }

    await page.mouse.move(
        itemListBox.x + itemListBox.width / 2,
        itemListBox.y + itemListBox.height / 2,
    );
    await page.mouse.wheel(240, 0);
    await expect.poll(async () => (await getScrollState()).left).toBeGreaterThan(1);

	await noteColumns.getByRole('button', { name: 'Cascade' }).click();
	await expect.poll(async () => (await getScrollState()).left).toBeGreaterThan(afterBeacon.left + 80);

	await noteColumns.getByRole('button', { name: 'Delta' }).click();
	await expect.poll(async () => (await getScrollState()).left).toBeGreaterThan(afterBeacon.left + 160);

    const beforeCollapse = await getScrollState();
    expect(beforeCollapse.left).toBeGreaterThan(1);

    await noteColumns.getByRole('button', { name: 'Atlas' }).dispatchEvent('click');
    const collapseStart = await getScrollState();
    expect(collapseStart.left).toBeGreaterThan(1);
    expect(collapseStart.paddingRight).toBeGreaterThan(0);
    await expect
        .poll(
            async () => {
                const collapseFrame = await getScrollState();

                return (
                    collapseFrame.left > 1 &&
                    collapseFrame.left < collapseStart.left &&
                    collapseFrame.paddingRight > 0 &&
                    collapseFrame.paddingRight < collapseStart.paddingRight
                );
            },
            { intervals: [16, 32, 48, 64, 80, 120], timeout: 300 },
        )
        .toBe(true);

    await expect.poll(async () => (await getScrollState()).left).toBeLessThan(1);
    await expect.poll(async () => (await getScrollState()).paddingRight).toBeLessThan(1);

    const atlasButton = noteColumns.getByRole("button", { name: "Atlas" });

    await expect(atlasButton).toHaveAttribute("aria-expanded", "true");
    await expect(noteColumns.locator('[data-column-key="Atlas"]')).toHaveCount(1);
    await expect(noteColumns.locator(".note-column")).toHaveCount(2);
    await atlasButton.click();
    await expect(atlasButton).toHaveAttribute("aria-expanded", "true");
    await expect(noteColumns.locator('[data-column-key="Atlas"]')).toHaveCount(1);
    await expect(noteColumns.locator(".note-column")).toHaveCount(2);
});

test('Excalidraw notes render a static SVG preview', async ({ page }) => {
	const vaultName = `datahoarder-e2e-excalidraw-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const file = await directory.getFileHandle('visual-plan.md', { create: true });
			const writable = await file.createWritable();

			await writable.write(
				[
					'---',
					'excalidraw-plugin: parsed',
					'---',
					'# Visual Plan',
					'',
					'## Drawing',
					'```json',
					JSON.stringify({
						type: 'excalidraw',
						elements: [
							{
								backgroundColor: '#dcfce7',
								height: 80,
								strokeColor: '#166534',
								type: 'rectangle',
								width: 160,
								x: 10,
								y: 20
							},
							{
								fontSize: 24,
								strokeColor: '#14532d',
								text: 'Launch <fast>',
								type: 'text',
								x: 26,
								y: 44
							},
							{
								points: [
									[0, 0],
									[80, 40]
								],
								strokeColor: '#0369a1',
								type: 'arrow',
								x: 190,
								y: 55
							}
						]
					}),
					'```'
				].join('\n')
			);
			await writable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	const preview = page.getByLabel('Preview');
	await expect(preview.locator('.excalidraw-preview-svg')).toBeVisible();
	await expect(preview.getByText('Launch <fast>')).toBeVisible();

	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlDownload.suggestedFilename()).toBe('visual-plan.html');
	expect(htmlContent).toContain('class="excalidraw-preview-svg"');
	expect(htmlContent).toContain('Launch &lt;fast&gt;');
	expect(htmlContent).not.toContain('<script>');
});

test('new drawing creates a whiteboard SVX note', async ({ page }) => {
	const vaultName = `datahoarder-e2e-new-drawing-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();

			return root.getDirectoryHandle(name, { create: true });
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.locator('.sidebar-summary').getByText('0 notes', { exact: true })).toBeVisible();

	await clickColumnNewItem(page, 'Files', 'New Drawing');
	await fillInlineFileCreate(page, 'New drawing name', 'Launch Map');
	await expect(page.getByText('Created drawing Launch Map.svx')).toBeVisible();
	await expectSelectedFilePath(page, "Launch Map.svx");
	await expect(page.getByLabel('Preview').getByLabel('Launch Map whiteboard')).toBeVisible();
	await expect(page.getByLabel('Preview').getByText('Launch Map')).toBeVisible();
	await expect(page.getByLabel('Editor').getByText('InfiniteWhiteboard')).toBeVisible();
});

test('whiteboard drawing notes can append canvas elements', async ({ page }) => {
	const vaultName = `datahoarder-e2e-add-canvas-element-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();

			return root.getDirectoryHandle(name, { create: true });
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await clickColumnNewItem(page, 'Files', 'New Drawing');
	await fillInlineFileCreate(page, 'New drawing name', 'Canvas');
	await page.getByRole('button', { name: 'Add Canvas Element' }).click();
	await fillRequestFields(
		page,
		'Add Canvas Element',
		{
			'Element Type': 'rectangle',
			'Element Label': 'Milestone <risk> & reward'
		},
		'Add Element'
	);

	await expect(page.getByText('Added rectangle to Canvas.svx')).toBeVisible();
	await expect(page.getByLabel('Canvas whiteboard').getByText('Milestone <risk> & reward')).toBeVisible();

	const savedDrawingContent = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const file = await directory.getFileHandle('Canvas.svx');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(savedDrawingContent).toContain('"kind": "shape"');
	expect(savedDrawingContent).toContain('"shape": "rectangle"');
	expect(savedDrawingContent).toContain('"label": "Milestone <risk> & reward"');

	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlContent).toContain('class="whiteboard-preview-svg"');
	expect(htmlContent).toContain('Milestone &lt;risk&gt; &amp; reward');
	expect(htmlContent).not.toContain('Milestone <risk> & reward');
	expect(htmlContent).not.toContain('<script>');
});

test('new from template creates a note with rendered placeholders', async ({ page }) => {
	const vaultName = `datahoarder-e2e-template-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const templates = await directory.getDirectoryHandle('Templates', { create: true });
			const template = await templates.getFileHandle('Project.template.md', { create: true });
			const writable = await template.createWritable();

			await writable.write(
				['# {{title}}', '', 'path:: {{path}}', 'slug:: {{slug}}', 'created:: {{date}}', '', '## Next steps'].join('\n')
			);
			await writable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await clickColumnNewItem(page, 'Files', 'New From Template');
	await fillRequestFields(
		page,
		'Choose Template',
		{
			Template: 'Templates/Project.template.md'
		},
		'Use Template'
	);
	await fillInlineFileCreate(page, 'New note name', 'Launch Map');

	await expect(page.getByText('Created Launch Map.md from Templates/Project.template.md')).toBeVisible();
	await expectSelectedFilePath(page, "Launch Map.md");
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'Launch Map' })).toBeVisible();
	await expect(page.getByLabel('Preview').getByText('path:: Launch Map.md')).toBeVisible();
	await expect(page.getByLabel('Preview').getByText('slug:: launch-map')).toBeVisible();
	await expect(page.getByLabel('Preview').getByText(/created:: \d{4}-\d{2}-\d{2}/u)).toBeVisible();
});

test('set field updates inline note properties', async ({ page }) => {
	const vaultName = `datahoarder-e2e-set-field-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const file = await directory.getFileHandle('application.md', { create: true });
			const writable = await file.createWritable();

			await writable.write('# Application\n\nstatus:: Applied\ncompany:: Acme\n');
			await writable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.getByLabel('Preview').getByText('status:: Applied')).toBeVisible();

	await page.getByRole('button', { name: 'Set Field' }).click();
	await fillRequestFields(
		page,
		'Set Inline Field',
		{
			'Field Name': 'status',
			'Field Value': 'Interview'
		},
		'Update Field'
	);
	await expect(page.getByText('Updated status on application.md')).toBeVisible();
	await expect(page.getByLabel('Preview').getByText('status:: Interview')).toBeVisible();
	await expect(page.getByLabel('Preview').getByText('status:: Applied')).toHaveCount(0);
	await expect(page.getByLabel('Editor').getByText('status:: Interview')).toBeVisible();
});

test('note embeds render reusable blocks in preview and HTML exports', async ({ page }) => {
	const vaultName = `datahoarder-e2e-embeds-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });

			const writeFile = async (filePath: string, content: string) => {
				const segments = filePath.split('/');
				const fileName = segments.pop();
				let parent = directory;

				for (const segment of segments) {
					parent = await parent.getDirectoryHandle(segment, { create: true });
				}

				const file = await parent.getFileHandle(fileName ?? 'note.md', { create: true });
				const writable = await file.createWritable();

				await writable.write(content);
				await writable.close();
			};

			await writeFile(
				'Parent.md',
				'# Parent\n\n![[Components/Reusable#Summary|Reusable Card|name=Acme <Labs>|status=Interview|detail=Use **portfolio** note]]\n\nDone.'
			);
			await writeFile(
				'Components/Reusable.md',
				[
					'---',
					'title: Internal Component',
					'---',
					'# Reusable',
					'',
					'## Summary',
					'### {{name}}',
					'status:: {{STATUS}}',
					'detail:: {{detail}}',
					'',
					'## Other',
					'Hidden section.'
				].join('\n')
			);

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.locator('.note-columns').getByRole('button', { name: 'Parent.md' }).click();

	const preview = page.getByLabel('Preview');
	await expect(preview.locator('.note-embed')).toBeVisible();
	await expect(preview.getByRole('link', { name: 'Reusable Card' })).toBeVisible();
	await expect(preview.getByRole('heading', { name: 'Acme <Labs>' })).toBeVisible();
	await expect(preview.getByText('status:: Interview')).toBeVisible();
	await expect(preview.getByText('detail:: Use **portfolio** note')).toBeVisible();
	await expect(preview.getByText('Hidden section.')).toHaveCount(0);

	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlContent).toContain('class="note-embed"');
	expect(htmlContent).toContain('<h3>Acme &lt;Labs&gt;</h3>');
	expect(htmlContent).toContain('status:: Interview');
	expect(htmlContent).toContain('detail:: Use **portfolio** note');
	expect(htmlContent).not.toContain('Acme <Labs>');
	expect(htmlContent).not.toContain('Hidden section.');
});
