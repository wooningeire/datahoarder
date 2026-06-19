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

test('markdown preview renders continuous blockquotes and callouts', async ({ page }) => {
	const vaultName = `datahoarder-e2e-markdown-callouts-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const file = await directory.getFileHandle('Callouts.md', { create: true });
			const writable = await file.createWritable();

			await writable.write(
				[
					'# Callouts',
					'',
					'> First quoted line',
					'> second quoted line',
					'>',
					'> [Quote source](https://example.test/source)',
					'',
					'> [!info] EIRTEL - Choose Your Own Adventure (Fan Friday)',
					'> 24.',
					'> [Reddit thread](https://reddit.example/thread)'
				].join('\n')
			);
			await writable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	const preview = page.getByLabel('Preview');
	await expect(preview.getByRole('heading', { name: 'Callouts' })).toBeVisible();

	const quote = preview.locator('blockquote');
	await expect(quote).toHaveCount(1);
	await expect(quote).toContainText('First quoted line');
	await expect(quote).toContainText('second quoted line');
	await expect(quote.getByRole('link', { name: 'Quote source' })).toHaveAttribute(
		'href',
		/^https:\/\/example\.test\/source$/u
	);

	const quoteBorderWidth = await quote.evaluate((node) => getComputedStyle(node).borderLeftWidth);
	expect(parseFloat(quoteBorderWidth)).toBeGreaterThan(0);

	const callout = preview.locator('.markdown-callout');
	await expect(callout).toBeVisible();
	await expect(callout).toHaveAttribute('data-callout', 'info');
	await expect(callout.locator('.markdown-callout-title')).toHaveText(
		'EIRTEL - Choose Your Own Adventure (Fan Friday)'
	);
	await expect(callout).toContainText('24.');
	await expect(callout.getByRole('link', { name: 'Reddit thread' })).toHaveAttribute(
		'href',
		/^https:\/\/reddit\.example\/thread$/u
	);
	await expect(preview.getByText('[!info]')).toHaveCount(0);

	const calloutDisplay = await callout.evaluate((node) => getComputedStyle(node).display);
	expect(calloutDisplay).toBe('grid');

	const previewMetrics = await preview.evaluate((node) => ({
		clientWidth: node.clientWidth,
		scrollWidth: node.scrollWidth
	}));
	expect(previewMetrics.scrollWidth).toBeLessThanOrEqual(previewMetrics.clientWidth + 1);
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

test('markdown tables render in preview and exports', async ({ page }) => {
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
});

test('datahoarder board files render linked exports', async ({ page }) => {
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

			await writeFile('Target.md', '# Target\n\nDestination note.');
			await writeFile('Private.md', '# Private\n\nSecret note.');
			await writeFile(
				'Boards/Launch.dhboard.json',
				JSON.stringify({
					title: 'Launch Board',
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
});

test('custom Sankey diagrams render in preview and exports', async ({ page }) => {
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
});

test('custom metric grids render in preview and exports', async ({ page }) => {
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
});

test("pinned notes stay stable without recent notes or the bottom status bar", async ({ page }) => {
    const vaultName = `datahoarder-e2e-pinned-notes-${Date.now()}`;

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

            await writeFile("alpha.md", "# Alpha\n\nFirst note.");
            await writeFile("beta.md", "# Beta\n\nSecond note.");
            await writeFile("gamma.md", "# Gamma\n\nThird note.");

            return directory;
        };
    }, vaultName);

    await page.goto("/");
    await page.getByRole("button", { name: "Open Folder" }).click();

    const noteColumns = page.locator(".note-columns");
    const workspace = page.locator(".workspace");
    const statusRow = page.locator(".status-row");
    await expect(noteColumns).toBeVisible();
    await expect(statusRow).toHaveCount(0);
    const workspaceBox = await workspace.boundingBox();
    const viewport = page.viewportSize();
    expect(workspaceBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(Math.abs(workspaceBox!.y + workspaceBox!.height - viewport!.height)).toBeLessThan(2);
    const initialNoteColumnsBox = await noteColumns.boundingBox();
    expect(initialNoteColumnsBox).not.toBeNull();
    const initialNoteColumnsTop = initialNoteColumnsBox!.y;

    const expectWorkspaceToFillAvailableHeight = async () => {
        const nextWorkspaceBox = await workspace.boundingBox();
        const nextViewport = page.viewportSize();

        await expect(statusRow).toHaveCount(0);
        expect(nextWorkspaceBox).not.toBeNull();
        expect(nextViewport).not.toBeNull();
        expect(Math.abs(nextWorkspaceBox!.y - workspaceBox!.y)).toBeLessThan(2);
        expect(Math.abs(nextWorkspaceBox!.y + nextWorkspaceBox!.height - nextViewport!.height)).toBeLessThan(2);
    };
    const expectNoteColumnsTopToStayPut = async () => {
        await expectWorkspaceToFillAvailableHeight();
        const noteColumnsBox = await noteColumns.boundingBox();

        expect(noteColumnsBox).not.toBeNull();
        expect(Math.abs(noteColumnsBox!.y - initialNoteColumnsTop)).toBeLessThan(2);
    };

    await noteColumns.getByRole("button", { name: "beta.md" }).click();
    await expectNoteColumnsTopToStayPut();
    await noteColumns.getByRole("button", { name: "gamma.md" }).click();
    await expectNoteColumnsTopToStayPut();
    await page.locator(".topbar").getByRole("button", { name: "Pin" }).click();
    await expectNoteColumnsTopToStayPut();

    const pinnedNotes = page.getByLabel("Pinned notes");
    await expect(pinnedNotes).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Recent" })).toHaveCount(0);

    await noteColumns.getByRole("button", { name: "beta.md" }).click();
    await expectNoteColumnsTopToStayPut();
    await expectSelectedFilePath(page, "beta.md");
    await expect(pinnedNotes).toBeVisible();
    await expect(pinnedNotes.getByRole("heading", { name: "Pinned" })).toBeVisible();
    await expect(pinnedNotes.locator(".pinned-note-link", { hasText: "Gamma" })).toBeVisible();
    await expect(pinnedNotes.locator(".pinned-note-link", { hasText: "Beta" })).toHaveCount(0);

    await pinnedNotes.locator(".pinned-note-link", { hasText: "Gamma" }).click();
    await expectNoteColumnsTopToStayPut();
    await expectSelectedFilePath(page, "gamma.md");
    await expect(page.getByLabel("Pinned notes")).toHaveCount(0);

    const storedLists = await page.evaluate((name) => {
        const pinned = window.localStorage.getItem(`datahoarder-local-vault-pinned-notes:${name}`);
        const recent = window.localStorage.getItem(`datahoarder-local-vault-recent-notes:${name}`);

        return {
            pinned: pinned ? JSON.parse(pinned) : [],
            recent,
        };
    }, vaultName);

    expect(storedLists.pinned).toEqual(["gamma.md"]);
    expect(storedLists.recent).toBeNull();
});
