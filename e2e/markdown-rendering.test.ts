import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { expectSelectedFilePath } from "./local-vault-ui.js";

test('markdown preview preserves soft line breaks and repeated paragraph gaps', async ({ page }) => {
	const vaultName = `datahoarder-e2e-markdown-spacing-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const file = await directory.getFileHandle('Line Spacing.md', { create: true });
			const writable = await file.createWritable();

			await writable.write(
				[
					'# Line Spacing',
					'',
					'First line',
					'second line',
					'',
					'Next paragraph',
					'',
					'',
					'Final paragraph'
				].join('\n')
			);
			await writable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	const preview = page.getByLabel('Preview');
	await expect(preview.getByRole('heading', { name: 'Line Spacing' })).toBeVisible();

	const paragraphs = preview.locator('.datahoarder-markdown-note p');
	await expect(paragraphs).toHaveCount(3);
	await expect(preview.locator('.markdown-blank-line')).toHaveCount(1);
	await expect(paragraphs.nth(0)).toHaveJSProperty('textContent', 'First line\nsecond line');

	const whiteSpace = await paragraphs.nth(0).evaluate((node) => getComputedStyle(node).whiteSpace);
	expect(whiteSpace).toBe('pre-wrap');

	const boxes = await paragraphs.evaluateAll((nodes) =>
		nodes.map((node) => {
			const rect = node.getBoundingClientRect();

			return {
				bottom: rect.bottom,
				top: rect.top
			};
		})
	);
	expect(boxes).toHaveLength(3);
	const [firstParagraph, secondParagraph, thirdParagraph] = boxes;
	const singleBlankGap = secondParagraph!.top - firstParagraph!.bottom;
	const repeatedBlankGap = thirdParagraph!.top - secondParagraph!.bottom;

	expect(singleBlankGap).toBeGreaterThan(4);
	expect(repeatedBlankGap).toBeGreaterThan(singleBlankGap + 4);
});

test('markdown task lists render toggle and export safely', async ({ page }) => {
	const vaultName = `datahoarder-e2e-task-lists-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const file = await directory.getFileHandle('Tasks.md', { create: true });
			const writable = await file.createWritable();

			await writable.write(
				[
					'# Tasks',
					'',
					'- [ ] Call <client>',
					'- [x] Ship **draft**',
					'- regular item'
				].join('\n')
			);
			await writable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	const preview = page.getByLabel('Preview');
	const taskInputs = preview.locator('.task-list-item input[type="checkbox"]');
	await expect(taskInputs).toHaveCount(2);
	await expect(taskInputs.nth(0)).toBeEnabled();
	await expect(taskInputs.nth(1)).toBeEnabled();
	await expect(taskInputs.nth(0)).not.toBeChecked();
	await expect(taskInputs.nth(1)).toBeChecked();
	await expect(preview.getByText('Call <client>')).toBeVisible();
	await expect(preview.locator('.task-list-item strong')).toHaveText('draft');
	await expect(preview.getByText('regular item')).toBeVisible();

	await taskInputs.nth(0).check();
	await expect(page.getByText('Completed task 1 in Tasks.md')).toBeVisible();
	await expect(taskInputs.nth(0)).toBeChecked();
	await expect(page.getByLabel('Editor').getByText('- [x] Call <client>')).toBeVisible();

	const taskSource = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const file = await directory.getFileHandle('Tasks.md');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(taskSource).toContain('- [x] Call <client>');

	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlDownload.suggestedFilename()).toBe('tasks.html');
	expect(htmlContent).toContain('class="task-list-item"');
	expect(htmlContent).toContain('<input type="checkbox" disabled checked>');
	expect(htmlContent).toContain('Call &lt;client&gt;');
	expect(htmlContent).toContain('Ship <strong>draft</strong>');
	expect(htmlContent).toContain('.task-list-item input');
	expect(htmlContent).not.toContain('Call <client>');
});

test('markdown tables render in preview exports and public notes', async ({ page }) => {
	const vaultName = `datahoarder-e2e-markdown-tables-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const file = await directory.getFileHandle('Application Table.md', { create: true });
			const writable = await file.createWritable();

			await writable.write(
				[
					'# Application Table',
					'',
					'public:: true',
					'',
					'| Company | Status | Count |',
					'| --- | :---: | ---: |',
					'| Acme <Labs> | **Open** | 3 |',
					'| Escaped \\| pipe | [Site](https://example.test) | `A|B` |',
					'',
					'Plain | pipe'
				].join('\n')
			);
			await writable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	const preview = page.getByLabel('Preview');
	await expect(preview.locator('.markdown-table-wrapper')).toBeVisible();
	await expect(preview.locator('.markdown-table')).toBeVisible();
	await expect(preview.getByRole('columnheader', { name: 'Status' })).toHaveAttribute('data-align', 'center');
	await expect(preview.getByRole('columnheader', { name: 'Count' })).toHaveAttribute('data-align', 'right');
	await expect(preview.getByText('Acme <Labs>', { exact: true })).toBeVisible();
	await expect(preview.locator('.markdown-table strong')).toHaveText('Open');
	await expect(preview.getByText('Escaped | pipe', { exact: true })).toBeVisible();
	await expect(preview.getByRole('link', { name: 'Site' })).toHaveAttribute('href', /^https:\/\/example\.test\/?$/u);
	await expect(preview.locator('.markdown-table code')).toHaveText('A|B');
	await expect(preview.getByText('Plain | pipe', { exact: true })).toBeVisible();

	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlDownload.suggestedFilename()).toBe('application-table.html');
	expect(htmlContent).toContain('class="markdown-table-wrapper"');
	expect(htmlContent).toContain('<th data-align="center">Status</th>');
	expect(htmlContent).toContain('<td data-align="right"><code>A|B</code></td>');
	expect(htmlContent).toContain('Acme &lt;Labs&gt;');
	expect(htmlContent).toContain('Escaped | pipe');
	expect(htmlContent).toContain('.markdown-table-wrapper');
	expect(htmlContent).not.toContain('Acme <Labs>');

	await page.getByRole('button', { name: 'Publish Public' }).click();
	await expect(page.getByText('Published 1 public notes to public/.')).toBeVisible();

	const publishedHtml = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const publicDirectory = await directory.getDirectoryHandle('public');
		const file = await publicDirectory.getFileHandle('application-table.html');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(publishedHtml).toContain('class="markdown-table-wrapper"');
	expect(publishedHtml).toContain('Acme &lt;Labs&gt;');
	expect(publishedHtml).toContain('Escaped | pipe');
	expect(publishedHtml).toContain('.markdown-table-wrapper');
	expect(publishedHtml).not.toContain('Acme <Labs>');
});

test('datahoarder board files render link export and publish', async ({ page }) => {
	const vaultName = `datahoarder-e2e-boards-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });

			const writeFile = async (fileName: string, content: string) => {
				const segments = fileName.split('/');
				const leafName = segments.pop() ?? fileName;
				let parent = directory;

				for (const segment of segments) {
					parent = await parent.getDirectoryHandle(segment, { create: true });
				}

				const file = await parent.getFileHandle(leafName, { create: true });
				const writable = await file.createWritable();

				await writable.write(content);
				await writable.close();
			};

			await writeFile('Target.md', '# Target\n\npublic:: true\n\nDestination note.');
			await writeFile('Private.md', '# Private\n\nSecret note.');
			await writeFile(
				'Boards/Launch.dhboard.json',
				JSON.stringify({
					title: 'Launch Board',
					public: true,
					tags: ['visual'],
					width: 820,
					height: 420,
					nodes: [
						{
							color: 'green',
							id: 'idea',
							note: 'Target.md',
							text: 'Plan <fast> launch flow.',
							title: 'Idea <One>',
							x: 40,
							y: 55
						},
						{
							color: 'purple',
							id: 'private',
							note: 'Private.md',
							text: 'Private reference.',
							title: 'Private Card',
							x: 340,
							y: 150
						}
					],
					edges: [{ from: 'idea', label: 'next <step>', to: 'private' }]
				})
			);

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.locator('.note-columns').getByRole('button', { name: 'Launch.dhboard.json' }).dispatchEvent('click');

	const preview = page.getByLabel('Preview');
	await expect(preview.locator('.datahoarder-board')).toBeVisible();
	await expect(preview.locator('.datahoarder-board-edge text')).toHaveText('next <step>');
	await expect(preview.getByText('Idea <One>', { exact: true })).toBeVisible();
	await expect(preview.getByText('Plan <fast> launch flow.', { exact: true })).toBeVisible();
	await expect(preview.getByRole('link', { name: 'Idea <One>' })).toHaveAttribute('data-note-path', 'Target.md');

	await preview.getByRole('link', { name: 'Idea <One>' }).click();
	await expectSelectedFilePath(page, "Target.md");
	const boardBacklink = page.getByLabel('Backlinks').getByRole('button', { name: /Launch Board/u });
	await expect(boardBacklink).toBeVisible();

	await boardBacklink.dispatchEvent('click');
	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlDownload.suggestedFilename()).toBe('launch-board.html');
	expect(htmlContent).toContain('class="datahoarder-board"');
	expect(htmlContent).toContain('Idea &lt;One&gt;');
	expect(htmlContent).toContain('Plan &lt;fast&gt; launch flow.');
	expect(htmlContent).toContain('next &lt;step&gt;');
	expect(htmlContent).toContain('.datahoarder-board-node');
	expect(htmlContent).not.toContain('Idea <One>');

	await page.getByRole('button', { name: 'Publish Public' }).click();
	await expect(page.getByText('Published 2 public notes to public/.')).toBeVisible();

	const published = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const publicDirectory = await directory.getDirectoryHandle('public');

		const readPublishedFile = async (fileName: string) => {
			const segments = fileName.split('/');
			const leafName = segments.pop() ?? fileName;
			let parent = publicDirectory;

			for (const segment of segments) {
				parent = await parent.getDirectoryHandle(segment);
			}

			const file = await parent.getFileHandle(leafName);
			const blob = await file.getFile();

			return blob.text();
		};

		return {
			board: await readPublishedFile('boards/launch-dhboard-json.html'),
			target: await readPublishedFile('target.html')
		};
	}, vaultName);

	expect(published.board).toContain('class="datahoarder-board"');
	expect(published.board).toContain('href="../target.html"');
	expect(published.board).toContain('Private Card');
	expect(published.board).not.toContain('href="../private.html"');
	expect(published.target).toContain('Destination note.');
});

test('custom Sankey diagrams render in preview exports and public notes', async ({ page }) => {
	const vaultName = `datahoarder-e2e-sankey-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const file = await directory.getFileHandle('Application Flow.md', { create: true });
			const writable = await file.createWritable();

			await writable.write(
				[
					'# Application Flow',
					'',
					'public:: true',
					'',
					'```datahoarder-sankey',
					'Applied -> Interview: 12',
					'Interview -> Offer <signed>: 3',
					'Applied -> Rejected: 4',
					'```'
				].join('\n')
			);
			await writable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expectSelectedFilePath(page, "Application Flow.md");

	const preview = page.getByLabel('Preview');
	await expect(preview.locator('.datahoarder-sankey-svg')).toBeVisible();
	await expect(preview.getByText('Applied', { exact: true })).toBeVisible();
	await expect(preview.getByText('Offer <signed>', { exact: true })).toBeVisible();
	await expect(preview.locator('figcaption', { hasText: '3 flows across 4 nodes, total 19.' })).toBeVisible();

	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlDownload.suggestedFilename()).toBe('application-flow.html');
	expect(htmlContent).toContain('class="datahoarder-sankey-svg"');
	expect(htmlContent).toContain('Offer &lt;signed&gt;');
	expect(htmlContent).not.toContain('Offer <signed>');
	expect(htmlContent).not.toContain('<pre><code>Applied');

	await page.getByRole('button', { name: 'Publish Public' }).click();
	await expect(page.getByText('Published 1 public notes to public/.')).toBeVisible();

	const publishedHtml = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const publicDirectory = await directory.getDirectoryHandle('public');
		const file = await publicDirectory.getFileHandle('application-flow.html');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(publishedHtml).toContain('class="datahoarder-sankey-svg"');
	expect(publishedHtml).toContain('Offer &lt;signed&gt;');
	expect(publishedHtml).not.toContain('Offer <signed>');
});

test('custom metric grids render in preview exports and public notes', async ({ page }) => {
	const vaultName = `datahoarder-e2e-metrics-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const file = await directory.getFileHandle('Application Metrics.md', { create: true });
			const writable = await file.createWritable();

			await writable.write(
				[
					'# Application Metrics',
					'',
					'public:: true',
					'',
					'```datahoarder-metrics',
					'Applications | 42 | This week <fast> | good',
					'Response rate: 18% | warning',
					'SLO: p95 | 120ms | warning',
					'Median reply | 3 days | Waiting on **portfolio** note | info',
					'Ignored line',
					'```'
				].join('\n')
			);
			await writable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expectSelectedFilePath(page, "Application Metrics.md");

	const preview = page.getByLabel('Preview');
	await expect(preview.locator('.datahoarder-metrics')).toBeVisible();
	await expect(preview.locator('.datahoarder-metric-good').getByText('42', { exact: true })).toBeVisible();
	await expect(preview.getByText('This week <fast>', { exact: true })).toBeVisible();
	await expect(preview.getByText('Response rate', { exact: true })).toBeVisible();
	await expect(preview.getByText('SLO: p95', { exact: true })).toBeVisible();
	await expect(preview.getByText('120ms', { exact: true })).toBeVisible();
	await expect(preview.getByText('Waiting on **portfolio** note', { exact: true })).toBeVisible();
	await expect(preview.getByText('Ignored line')).toHaveCount(0);

	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlDownload.suggestedFilename()).toBe('application-metrics.html');
	expect(htmlContent).toContain('class="datahoarder-metrics"');
	expect(htmlContent).toContain('class="datahoarder-metric datahoarder-metric-good"');
	expect(htmlContent).toContain('This week &lt;fast&gt;');
	expect(htmlContent).toContain('Waiting on **portfolio** note');
	expect(htmlContent).toContain('.datahoarder-metric-value');
	expect(htmlContent).not.toContain('This week <fast>');
	expect(htmlContent).not.toContain('Ignored line');

	await page.getByRole('button', { name: 'Publish Public' }).click();
	await expect(page.getByText('Published 1 public notes to public/.')).toBeVisible();

	const publishedHtml = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const publicDirectory = await directory.getDirectoryHandle('public');
		const file = await publicDirectory.getFileHandle('application-metrics.html');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(publishedHtml).toContain('class="datahoarder-metrics"');
	expect(publishedHtml).toContain('This week &lt;fast&gt;');
	expect(publishedHtml).toContain('SLO: p95');
	expect(publishedHtml).toContain('120ms');
	expect(publishedHtml).toContain('Waiting on **portfolio** note');
	expect(publishedHtml).toContain('.datahoarder-metric-value');
	expect(publishedHtml).not.toContain('This week <fast>');
});

test('quick notes track recent and pinned local notes', async ({ page }) => {
	const vaultName = `datahoarder-e2e-quick-notes-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });

			const writeFile = async (fileName: string, content: string) => {
				const file = await directory.getFileHandle(fileName, { create: true });
				const writable = await file.createWritable();

				await writable.write(content);
				await writable.close();
			};

			await writeFile('alpha.md', '# Alpha\n\nFirst note.');
			await writeFile('beta.md', '# Beta\n\nSecond note.');
			await writeFile('gamma.md', '# Gamma\n\nThird note.');

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

    const noteColumns = page.locator(".note-columns");
    const workspace = page.locator(".workspace");
    const statusRow = page.locator(".status-row");
    await expect(noteColumns).toBeVisible();
    await expect(statusRow).toBeVisible();
    const workspaceBox = await workspace.boundingBox();
    const statusRowBox = await statusRow.boundingBox();
    const viewport = page.viewportSize();
    expect(workspaceBox).not.toBeNull();
    expect(statusRowBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(Math.abs(workspaceBox!.y + workspaceBox!.height - statusRowBox!.y)).toBeLessThan(2);
    expect(Math.abs(statusRowBox!.y + statusRowBox!.height - viewport!.height)).toBeLessThan(2);
    const initialNoteColumnsBox = await noteColumns.boundingBox();
    expect(initialNoteColumnsBox).not.toBeNull();
    const initialNoteColumnsTop = initialNoteColumnsBox!.y;
    const expectWorkspaceToUseAvailableGridSpace = async () => {
        const nextWorkspaceBox = await workspace.boundingBox();
        const nextStatusRowBox = await statusRow.count() ? await statusRow.boundingBox() : null;
        const nextViewport = page.viewportSize();

        expect(nextWorkspaceBox).not.toBeNull();
        expect(nextViewport).not.toBeNull();
        expect(Math.abs(nextWorkspaceBox!.y - workspaceBox!.y)).toBeLessThan(2);

        if (nextStatusRowBox) {
            expect(Math.abs(nextWorkspaceBox!.y + nextWorkspaceBox!.height - nextStatusRowBox.y)).toBeLessThan(2);
            expect(Math.abs(nextStatusRowBox.y + nextStatusRowBox.height - nextViewport!.height)).toBeLessThan(2);
            return;
        }

        expect(Math.abs(nextWorkspaceBox!.y + nextWorkspaceBox!.height - nextViewport!.height)).toBeLessThan(2);
    };
    const expectNoteColumnsTopToStayPut = async () => {
        await expectWorkspaceToUseAvailableGridSpace();
        const noteColumnsBox = await noteColumns.boundingBox();
        expect(noteColumnsBox).not.toBeNull();
        expect(Math.abs(noteColumnsBox!.y - initialNoteColumnsTop)).toBeLessThan(2);
    };

	await noteColumns.getByRole('button', { name: 'beta.md' }).click();
	await expectNoteColumnsTopToStayPut();
	await noteColumns.getByRole('button', { name: 'gamma.md' }).click();
	await expectNoteColumnsTopToStayPut();
	await page.locator('.topbar').getByRole('button', { name: 'Pin' }).click();
	await expectNoteColumnsTopToStayPut();

	const quickNotes = page.getByLabel('Quick notes');
	await expect(quickNotes.getByRole('heading', { name: 'Pinned' })).toHaveCount(0);
	await expect(quickNotes.locator('.quick-note-link', { hasText: 'Gamma' })).toHaveCount(0);
	await expect(quickNotes.getByRole('heading', { name: 'Recent' })).toBeVisible();
	await expect(quickNotes.locator('.quick-note-link', { hasText: 'Beta' })).toBeVisible();

	await quickNotes.locator('.quick-note-link', { hasText: 'Beta' }).dispatchEvent('click');
	await expectNoteColumnsTopToStayPut();
	await expectSelectedFilePath(page, "beta.md");
	await expect(page.getByText('Editing selected file.')).toHaveCount(0);
	await expect(page.locator('.status-row')).toHaveCount(0);
	await expect(quickNotes.getByRole('heading', { name: 'Pinned' })).toBeVisible();
	await expect(quickNotes.locator('.quick-note-link', { hasText: 'Gamma' })).toBeVisible();
	await expect(quickNotes.locator('.quick-note-link', { hasText: 'Beta' })).toHaveCount(0);

	const storedLists = await page.evaluate((name) => {
		const pinned = window.localStorage.getItem(`datahoarder-local-vault-pinned-notes:${name}`);
		const recent = window.localStorage.getItem(`datahoarder-local-vault-recent-notes:${name}`);

		return {
			pinned: pinned ? JSON.parse(pinned) : [],
			recent: recent ? JSON.parse(recent) : []
		};
	}, vaultName);

	expect(storedLists.pinned).toEqual(['gamma.md']);
	expect(storedLists.recent).toContain('beta.md');
	expect(storedLists.recent).toContain('gamma.md');
});
