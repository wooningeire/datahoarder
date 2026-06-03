import { readFile } from 'node:fs/promises';
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

test('markdown opens before slow full-vault indexing finishes', async ({ page }) => {
	await page.addInitScript(() => {
		const state = window as unknown as { __slowIndexReadsCompleted: number };
		state.__slowIndexReadsCompleted = 0;
		const originalPut = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (...args) {
			const [_value, key] = args;

			if (key === 'vault-directory-handle') {
				const request = { result: undefined } as IDBRequest;
				setTimeout(() => request.onsuccess?.call(request, new Event('success')), 0);

				return request;
			}

			return originalPut.apply(this, args);
		};

		const delay = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
		const createFileHandle = (name: string, content: string, slowIndexedRead = false) => {
			let reads = 0;

			return {
				kind: 'file' as const,
				name,
				getFile: async () => {
					reads += 1;

					if (slowIndexedRead && reads > 1) {
						await delay(2000);
						state.__slowIndexReadsCompleted += 1;
					}

					return new File([content], name, { lastModified: 1, type: 'text/markdown' });
				}
			};
		};

		const handles = [
			['A.md', createFileHandle('A.md', '# A\n\nThis should render quickly.')],
			...Array.from({ length: 8 }, (_item, index) => [
				`Slow-${index}.md`,
				createFileHandle(`Slow-${index}.md`, `# Slow ${index}\n\nstatus:: Indexed`, true)
			])
		] as const;

		window.showDirectoryPicker = async () => ({
			kind: 'directory' as const,
			name: 'datahoarder-e2e-slow-index',
			entries: async function* () {
				for (const handle of handles) {
					yield handle;
				}
			}
		});
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'A' })).toBeVisible({ timeout: 1000 });

	expect(await page.evaluate(() => (window as unknown as { __slowIndexReadsCompleted: number }).__slowIndexReadsCompleted)).toBeLessThan(8);
	await expect(page.getByText(/notes parsed/u)).toBeVisible({ timeout: 10000 });
	expect(await page.evaluate(() => (window as unknown as { __slowIndexReadsCompleted: number }).__slowIndexReadsCompleted)).toBe(8);
});

test('global search opens matching vault notes', async ({ page }) => {
	await page.addInitScript(() => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle('datahoarder-e2e-search-vault', { create: true });

			const writeFile = async (name: string, content: string) => {
				const file = await directory.getFileHandle(name, { create: true });
				const writable = await file.createWritable();

				await writable.write(content);
				await writable.close();
			};

			await writeFile(
				'application-sankey.md',
				'---\ntags: applications, visual\n---\n# Sankey Tracker\n\nJob application flow data.'
			);
			await writeFile('aaa-garden.md', '# Garden Notes\n\nWater the cloud sage.');

			return directory;
		};
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.getByRole('searchbox', { name: 'Search vault' }).fill('#visual sankey');

	const searchResults = page.locator('.search-results');
	const result = searchResults.getByRole('button', { name: /Sankey Tracker/ });
	await expect(result).toBeVisible();
	await expect(page.getByText('1 results')).toBeVisible();

	await result.dispatchEvent('click');
	await expect(page.getByRole('heading', { name: 'application-sankey' })).toBeVisible();
	await expect(page.getByLabel('Preview').getByText('Job application flow data.')).toBeVisible();
});

test('command palette opens notes and runs quick capture actions', async ({ page }) => {
	const vaultName = `datahoarder-e2e-command-palette-${Date.now()}`;

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

			await writeFile('Alpha.md', '# Alpha\n\nFirst note.');
			await writeFile('Projects/Beta.md', '# Beta\n\nSecond note.');

			return directory;
		};
	}, vaultName);

	const promptResponses = ['Inbox/Capture.md'];

	page.on('dialog', async (dialog) => {
		if (dialog.type() === 'prompt') {
			await dialog.accept(promptResponses.shift() ?? '');
			return;
		}

		await dialog.accept();
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	await page.keyboard.press('Control+K');
	const palette = page.getByRole('dialog', { name: 'Jump or act' });
	await expect(palette).toBeVisible();
	await palette.getByRole('searchbox', { name: 'Command palette' }).fill('beta');
	await palette.locator('.command-palette-results button', { hasText: 'Open Note: Beta' }).click();

	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'Beta' })).toBeVisible();
	await expect(page.getByLabel('Editor').getByText('Projects/Beta.md')).toBeVisible();

	await page.keyboard.press('Control+K');
	await expect(palette).toBeVisible();
	await palette.getByRole('searchbox', { name: 'Command palette' }).fill('new note');
	await palette.locator('.command-palette-results button', { hasText: 'New Note' }).click();

	await expect(page.getByText('Created Inbox/Capture.md')).toBeVisible();
	await expect(page.getByLabel('Editor').getByText('Inbox/Capture.md')).toBeVisible();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'Capture' })).toBeVisible();

	const createdContent = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const inbox = await directory.getDirectoryHandle('Inbox');
		const file = await inbox.getFileHandle('Capture.md');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(createdContent).toContain('# Capture');
});

test('global searches can be saved as vault files and reapplied', async ({ page }) => {
	const vaultName = `datahoarder-e2e-saved-search-${Date.now()}`;

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

			await writeFile(
				'application-sankey.md',
				'---\ntags: applications, visual\n---\n# Sankey Tracker\n\nJob application flow data.'
			);
			await writeFile('garden.md', '# Garden Notes\n\nWater the cloud sage.');

			return directory;
		};
	}, vaultName);

	page.on('dialog', async (dialog) => {
		if (dialog.type() === 'prompt') {
			await dialog.accept('Visual Sankey');
			return;
		}

		await dialog.accept();
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	const searchBox = page.getByRole('searchbox', { name: 'Search vault' });
	await searchBox.fill('#visual sankey');
	await page.locator('.vault-search').getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved search Visual Sankey.')).toBeVisible();

	const savedSearch = page.getByLabel('Saved searches').locator('.saved-search-apply', { hasText: 'Visual Sankey' });
	await expect(savedSearch).toBeVisible();

	const savedSearchContent = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const savedSearchesDirectory = await directory.getDirectoryHandle('Saved Searches');
		const file = await savedSearchesDirectory.getFileHandle('visual-sankey.dhsearch.json');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(JSON.parse(savedSearchContent)).toEqual({
		name: 'Visual Sankey',
		query: '#visual sankey'
	});

	await searchBox.fill('');
	await savedSearch.click();
	await expect(searchBox).toHaveValue('#visual sankey');
	await expect(page.getByText('1 results')).toBeVisible();
	await expect(page.locator('.search-results').getByRole('button', { name: /Sankey Tracker/u })).toBeVisible();

	await page.getByLabel('Saved searches').getByRole('button', { name: 'Delete saved search Visual Sankey' }).click();
	await expect(page.getByText('Deleted saved search Visual Sankey.')).toBeVisible();
	await expect(page.getByLabel('Saved searches')).toHaveCount(0);
});

test('backlinks show notes that point to the selected note', async ({ page }) => {
	const vaultName = `datahoarder-e2e-backlinks-${Date.now()}`;

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

			await writeFile('Target.md', '# Target\n\nDestination note.');
			await writeFile('Parent.md', '# Parent\n\nLinks to [[Target|the target]] and [Target file](Target.md#details).');
			await writeFile('Other.md', '# Other\n\nNo matching link.');

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.locator('.note-columns').getByRole('button', { name: 'Target.md' }).dispatchEvent('click');

	const backlinks = page.getByLabel('Backlinks');
	await expect(backlinks.getByRole('heading', { name: 'Backlinks' })).toBeVisible();
	await expect(backlinks.getByRole('button', { name: /Parent/u })).toHaveCount(1);
	await expect(backlinks.getByText('the target')).toBeVisible();
	await expect(backlinks.getByText('Target file')).toBeVisible();
	await expect(backlinks.getByText('Other.md')).toHaveCount(0);

	await backlinks.getByRole('button', { name: /Parent/u }).first().click();
	await expect(page.getByLabel('Editor').getByText('Parent.md')).toBeVisible();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'Parent' })).toBeVisible();
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
	await expect(page.getByLabel('Editor').getByText('Target.md')).toBeVisible();
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
	await expect(page.getByLabel('Editor').getByText('Application Flow.md')).toBeVisible();

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
	await expect(page.getByLabel('Editor').getByText('Application Metrics.md')).toBeVisible();

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

	const noteColumns = page.locator('.note-columns');
	await noteColumns.getByRole('button', { name: 'beta.md' }).click();
	await noteColumns.getByRole('button', { name: 'gamma.md' }).click();
	await page.locator('.topbar').getByRole('button', { name: 'Pin' }).click();

	const quickNotes = page.getByLabel('Quick notes');
	await expect(quickNotes.getByRole('heading', { name: 'Pinned' })).toBeVisible();
	await expect(quickNotes.locator('.quick-note-link', { hasText: 'Gamma' })).toBeVisible();
	await expect(quickNotes.getByRole('heading', { name: 'Recent' })).toBeVisible();
	await expect(quickNotes.locator('.quick-note-link', { hasText: 'Beta' })).toBeVisible();
	await expect(quickNotes.locator('.quick-note-link', { hasText: 'Gamma' })).toHaveCount(1);

	await quickNotes.locator('.quick-note-link', { hasText: 'Beta' }).dispatchEvent('click');
	await expect(page.getByLabel('Editor').getByText('beta.md')).toBeVisible();

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

test('new drawing creates an Excalidraw starter note', async ({ page }) => {
	const vaultName = `datahoarder-e2e-new-drawing-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();

			return root.getDirectoryHandle(name, { create: true });
		};
	}, vaultName);

	page.on('dialog', async (dialog) => {
		await dialog.accept('Sketches/Launch Map.md');
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.locator('.sidebar-summary').getByText('0 notes', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'New Drawing' }).click();
	await expect(page.getByText('Created drawing Sketches/Launch Map.md')).toBeVisible();
	await expect(page.getByLabel('Editor').getByText('Sketches/Launch Map.md')).toBeVisible();
	await expect(page.getByLabel('Preview').locator('.excalidraw-preview-svg')).toBeVisible();
	await expect(page.getByLabel('Excalidraw drawing preview').getByText('Launch Map')).toBeVisible();
	await expect(page.getByLabel('Editor').getByText('excalidraw-plugin: parsed')).toBeVisible();
});

test('drawing notes can append canvas elements', async ({ page }) => {
	const vaultName = `datahoarder-e2e-add-canvas-element-${Date.now()}`;
	const promptResponses = ['rectangle', 'Milestone <risk> & reward'];

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const file = await directory.getFileHandle('canvas.md', { create: true });
			const writable = await file.createWritable();

			await writable.write(
				[
					'---',
					'excalidraw-plugin: parsed',
					'tags: [drawing]',
					'---',
					'# Canvas',
					'',
					'## Drawing',
					'```json',
					JSON.stringify({
						type: 'excalidraw',
						version: 2,
						source: 'datahoarder',
						elements: [
							{
								id: 'start',
								type: 'text',
								x: 20,
								y: 40,
								width: 80,
								height: 32,
								strokeColor: '#111827',
								text: 'Start'
							}
						],
						appState: { viewBackgroundColor: '#ffffff' },
						files: {}
					}),
					'```'
				].join('\n')
			);
			await writable.close();

			return directory;
		};
	}, vaultName);

	page.on('dialog', async (dialog) => {
		await dialog.accept(promptResponses.shift() ?? '');
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.getByRole('button', { name: 'Add Canvas Element' }).click();

	await expect(page.getByText('Added rectangle to canvas.md')).toBeVisible();
	await expect(page.getByLabel('Excalidraw drawing preview').getByText('Milestone <risk> & reward')).toBeVisible();

	const savedDrawingContent = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const file = await directory.getFileHandle('canvas.md');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(savedDrawingContent).toContain('"type": "rectangle"');
	expect(savedDrawingContent).toContain('"Milestone <risk> & reward"');

	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlContent).toContain('Milestone &lt;risk&gt; &amp; reward');
	expect(htmlContent).not.toContain('Milestone <risk> & reward');
});

test('new from template creates a note with rendered placeholders', async ({ page }) => {
	const vaultName = `datahoarder-e2e-template-${Date.now()}`;
	const promptResponses = ['Templates/Project.template.md', 'Projects/Launch Map.md'];

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

	page.on('dialog', async (dialog) => {
		await dialog.accept(promptResponses.shift() ?? '');
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.getByRole('button', { name: 'New From Template' }).click();

	await expect(page.getByText('Created Projects/Launch Map.md from Templates/Project.template.md')).toBeVisible();
	await expect(page.getByLabel('Editor').locator('.file-header').getByText('Projects/Launch Map.md')).toBeVisible();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'Launch Map' })).toBeVisible();
	await expect(page.getByLabel('Preview').getByText('path:: Projects/Launch Map.md')).toBeVisible();
	await expect(page.getByLabel('Preview').getByText('slug:: launch-map')).toBeVisible();
	await expect(page.getByLabel('Preview').getByText(/created:: \d{4}-\d{2}-\d{2}/u)).toBeVisible();
});

test('set field updates inline note properties', async ({ page }) => {
	const vaultName = `datahoarder-e2e-set-field-${Date.now()}`;
	const promptResponses = ['status', 'Interview'];

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

	page.on('dialog', async (dialog) => {
		await dialog.accept(promptResponses.shift() ?? '');
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.getByLabel('Preview').getByText('status:: Applied')).toBeVisible();

	await page.getByRole('button', { name: 'Set Field' }).click();
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

test('public notes can be published as a static vault subset', async ({ page }) => {
	const vaultName = `datahoarder-e2e-public-publish-${Date.now()}`;

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
				'Shared Note.md',
				[
					'# Shared Note',
					'',
					'public:: true',
					'',
					'See [[Projects/Target Note|the target]].',
					'',
					'![[Projects/Target Note#Reusable Part|Target Embed]]',
					'',
					'![[Private Note]]'
				].join('\n')
			);
			await writeFile(
				'Projects/Target Note.md',
				[
					'# Target Note',
					'',
					'#public',
					'',
					'Back to [[Shared Note]].',
					'',
					'## Reusable Part',
					'Target reusable body.',
					'',
					'![[Private Note]]',
					'',
					'## Later',
					'Other public target content.'
				].join('\n')
			);
			await writeFile('Private Note.md', '# Private Note\n\nSecret only.');

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.getByRole('button', { name: 'Publish Public' }).click();
	await expect(page.getByText('Published 2 public notes to public/.')).toBeVisible();

	const published = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const publicDirectory = await directory.getDirectoryHandle('public');

		const readPublishedFile = async (filePath: string) => {
			const segments = filePath.split('/');
			const fileName = segments.pop();
			let parent = publicDirectory;

			for (const segment of segments) {
				parent = await parent.getDirectoryHandle(segment);
			}

			const file = await parent.getFileHandle(fileName ?? 'index.html');
			const blob = await file.getFile();

			return blob.text();
		};

		return {
			index: await readPublishedFile('index.html'),
			shared: await readPublishedFile('shared-note.html'),
			target: await readPublishedFile('projects/target-note.html')
		};
	}, vaultName);

	expect(published.index).toContain('Shared Note');
	expect(published.index).toContain('Target Note');
	expect(published.index).not.toContain('Private Note');
	expect(published.shared).toContain('<h1>Shared Note</h1>');
	expect(published.shared).toContain('href="projects/target-note.html"');
	expect(published.shared).toContain('Target reusable body.');
	expect(published.shared).toContain('Embedded note unavailable.');
	expect(published.shared).not.toContain('Secret only');
	expect(published.shared).not.toContain('Private Note');
	expect(published.target).toContain('href="../shared-note.html"');
	expect(published.target).toContain('Embedded note unavailable.');
	expect(published.target).not.toContain('Secret only');
});

test('public publishing sees inline field updates without a full vault reload', async ({ page }) => {
	const vaultName = `datahoarder-e2e-publish-after-field-${Date.now()}`;
	const promptResponses = ['public', 'true'];

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const file = await directory.getFileHandle('Draft.md', { create: true });
			const writable = await file.createWritable();

			await writable.write('# Draft\n\nPrivate until marked public.');
			await writable.close();

			return directory;
		};
	}, vaultName);

	page.on('dialog', async (dialog) => {
		await dialog.accept(promptResponses.shift() ?? '');
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'Draft' })).toBeVisible();

	await page.getByRole('button', { name: 'Set Field' }).click();
	await expect(page.getByText('Updated public on Draft.md')).toBeVisible();
	await page.getByRole('button', { name: 'Publish Public' }).click();
	await expect(page.getByText('Published 1 public notes to public/.')).toBeVisible();

	const publishedDraft = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const publicDirectory = await directory.getDirectoryHandle('public');
		const file = await publicDirectory.getFileHandle('draft.html');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(publishedDraft).toContain('<h1>Draft</h1>');
	expect(publishedDraft).toContain('Private until marked public.');
});

test('public publish profiles export selected profile subsets', async ({ page }) => {
	const vaultName = `datahoarder-e2e-public-profiles-${Date.now()}`;

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
				'Portfolio.dhpublish.yaml',
				[
					'name: Portfolio',
					'outputDirectory: public/portfolio',
					'source:',
					'  match:',
					'    publish:',
					'      includes: portfolio'
				].join('\n')
			);
			await writeFile(
				'Roadmap.dhpublish.yaml',
				[
					'name: Roadmap',
					'outputDirectory: public/roadmap',
					'source:',
					'  match:',
					'    publish:',
					'      includes: roadmap'
				].join('\n')
			);
			await writeFile(
				'Portfolio Note.md',
				[
					'# Portfolio Note',
					'',
					'publish:: [portfolio]',
					'',
					'See [[Shared Note]] and [[Roadmap Note]].',
					'',
					'![[Shared Note]]',
					'',
					'![[Roadmap Note]]'
				].join('\n')
			);
			await writeFile('Shared Note.md', '# Shared Note\n\npublish:: [portfolio]\n\nShared body.');
			await writeFile('Roadmap Note.md', '# Roadmap Note\n\npublish:: [roadmap]\n\nPrivate roadmap body.');
			await writeFile('Public Only.md', '# Public Only\n\npublic:: true\n\nDefault public body.');

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	const profileSelect = page.getByRole('combobox', { name: 'Publish profile' });
	await expect(profileSelect).toBeVisible();
	await profileSelect.selectOption({ label: 'Portfolio' });
	await page.getByRole('button', { name: 'Publish Public' }).click();
	await expect(page.getByText('Published 2 Portfolio notes to public/portfolio/.')).toBeVisible();

	const published = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const publicDirectory = await directory.getDirectoryHandle('public');
		const portfolioDirectory = await publicDirectory.getDirectoryHandle('portfolio');

		const readPublishedFile = async (fileName: string) => {
			const file = await portfolioDirectory.getFileHandle(fileName);
			const blob = await file.getFile();

			return blob.text();
		};

		return {
			index: await readPublishedFile('index.html'),
			portfolio: await readPublishedFile('portfolio-note.html'),
			shared: await readPublishedFile('shared-note.html')
		};
	}, vaultName);

	expect(published.index).toContain('Portfolio Note');
	expect(published.index).toContain('Shared Note');
	expect(published.index).not.toContain('Roadmap Note');
	expect(published.index).not.toContain('Public Only');
	expect(published.portfolio).toContain('href="shared-note.html"');
	expect(published.portfolio).toContain('Shared body.');
	expect(published.portfolio).toContain('Embedded note unavailable.');
	expect(published.portfolio).not.toContain('Private roadmap body.');
	expect(published.portfolio).not.toContain('Default public body.');
	expect(published.shared).toContain('<h1>Shared Note</h1>');
});

test('kanban collection views group filter and export records', async ({ page }) => {
	const vaultName = `datahoarder-e2e-kanban-${Date.now()}`;
	const promptResponses = ['owner', 'text'];

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const collectionFile = await directory.getFileHandle('Applications.dhbase.yaml', { create: true });
			const writable = await collectionFile.createWritable();

			await writable.write(
				[
					'name: Applications',
					'schema:',
					'  company: text',
					'  status: text',
					'source:',
					'  folders: [applications]',
					'summaries:',
					'  - name: Total',
					'    type: count',
					'  - name: By Status',
					'    type: countBy',
					'    field: status',
					'views:',
					'  - type: table',
					'    name: Applications',
					'    columns: [title, company, status]',
					'  - type: kanban',
					'    name: Pipeline',
					'    groupBy: status',
					'    columns: [title, company, status]'
				].join('\n')
			);
			await writable.close();

			const applicationsDirectory = await directory.getDirectoryHandle('applications', { create: true });
			const writeApplication = async (fileName: string, content: string) => {
				const file = await applicationsDirectory.getFileHandle(fileName, { create: true });
				const applicationWritable = await file.createWritable();

				await applicationWritable.write(content);
				await applicationWritable.close();
			};

			await writeApplication('acme.md', '# Acme Labs\n\ncompany:: Acme\nstatus:: Applied\n');
			await writeApplication('nimbus.md', '# Nimbus Works\n\ncompany:: Nimbus\nstatus:: Interview\n');
			await writeApplication('blank.md', '# Blank Co\n\ncompany:: Blank\n');

			return directory;
		};
	}, vaultName);

	page.on('dialog', async (dialog) => {
		await dialog.accept(promptResponses.shift() ?? '');
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();

	const preview = page.getByLabel('Preview');
	await expect(preview.getByText('table collection')).toBeVisible();
	await expect(preview.getByRole('button', { name: /Applications table/u })).toHaveAttribute('aria-pressed', 'true');
	await preview.getByRole('button', { name: /Pipeline kanban/u }).click();
	await expect(preview.getByText('kanban collection')).toBeVisible();
	await expect(preview.getByRole('button', { name: /Pipeline kanban/u })).toHaveAttribute('aria-pressed', 'true');
	await expect(preview.getByLabel('Applied lane')).toBeVisible();
	await expect(preview.getByLabel('Interview lane')).toBeVisible();
	await expect(preview.getByLabel('Unassigned lane')).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Acme Labs', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Nimbus Works', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Blank Co', exact: true })).toBeVisible();
	const summaries = preview.getByLabel('Collection summaries');
	await expect(summaries.locator('.collection-summary', { hasText: 'Total' }).getByText('3', { exact: true })).toBeVisible();
	await expect(
		summaries.locator('.collection-summary', { hasText: 'By Status' }).getByText('Applied', { exact: true })
	).toBeVisible();
	await expect(
		summaries.locator('.collection-summary', { hasText: 'By Status' }).getByText('Unassigned', { exact: true })
	).toBeVisible();

	await preview.getByRole('searchbox', { name: 'Filter collection records' }).fill('nimbus');
	await expect(preview.getByLabel('Interview lane')).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Nimbus Works', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Acme Labs', exact: true })).toHaveCount(0);
	await expect(summaries.locator('.collection-summary', { hasText: 'Total' }).getByText('1', { exact: true })).toBeVisible();
	await expect(
		summaries.locator('.collection-summary', { hasText: 'By Status' }).getByText('Interview', { exact: true })
	).toBeVisible();
	await expect(
		summaries.locator('.collection-summary', { hasText: 'By Status' }).getByText('Applied', { exact: true })
	).toHaveCount(0);

	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlDownload.suggestedFilename()).toBe('applications-pipeline.html');
	expect(htmlContent).toContain('class="collection-summary-grid"');
	expect(htmlContent).toContain('By Status');
	expect(htmlContent).toContain('class="kanban-board"');
	expect(htmlContent).toContain('Interview');
	expect(htmlContent).toContain('Nimbus Works');
	expect(htmlContent).not.toContain('<table>');
	expect(htmlContent).not.toContain('Acme Labs');

	const csvDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export CSV' }).click();
	const csvDownload = await csvDownloadPromise;
	const csvPath = await csvDownload.path();
	expect(csvPath).toBeTruthy();
	const csvContent = await readFile(csvPath ?? '', 'utf8');

	expect(csvDownload.suggestedFilename()).toBe('applications-pipeline.csv');
	expect(csvContent).toContain('title,company,status');
	expect(csvContent).toContain('Nimbus Works,Nimbus,Interview');
	expect(csvContent).not.toContain('Acme Labs');

	await page.getByRole('button', { name: 'Add Field' }).click();
	await expect(page.getByText('Added owner field to Applications.dhbase.yaml')).toBeVisible();

	const editedCollectionContent = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const file = await directory.getFileHandle('Applications.dhbase.yaml');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(editedCollectionContent.split(/\r?\n/u).filter((line) => line.includes('columns:'))).toEqual([
		'    columns: [title, company, status]',
		'    columns: [title, company, status, owner]'
	]);
});

test('collection views apply configured filter and sort presets', async ({ page }) => {
	const vaultName = `datahoarder-e2e-view-presets-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const collectionFile = await directory.getFileHandle('Applications.dhbase.yaml', { create: true });
			const writable = await collectionFile.createWritable();

			await writable.write(
				[
					'name: Applications',
					'schema:',
					'  company: text',
					'  status: text',
					'  rating: number',
					'source:',
					'  folders: [applications]',
					'views:',
					'  - type: table',
					'    name: All',
					'    columns: [title, company, status, rating]',
					'  - type: table',
					'    name: Interviews',
					'    filter: Interview',
					'    sortBy: rating',
					'    sortDirection: desc',
					'    columns: [title, company, status, rating]'
				].join('\n')
			);
			await writable.close();

			const applicationsDirectory = await directory.getDirectoryHandle('applications', { create: true });
			const writeApplication = async (fileName: string, content: string) => {
				const file = await applicationsDirectory.getFileHandle(fileName, { create: true });
				const applicationWritable = await file.createWritable();

				await applicationWritable.write(content);
				await applicationWritable.close();
			};

			await writeApplication('acme.md', '# Acme Labs\n\ncompany:: Acme\nstatus:: Interview\nrating:: 5\n');
			await writeApplication('nimbus.md', '# Nimbus Works\n\ncompany:: Nimbus\nstatus:: Interview\nrating:: 3\n');
			await writeApplication('blank.md', '# Blank Co\n\ncompany:: Blank\nstatus:: Applied\nrating:: 4\n');

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.locator('.note-columns').getByRole('button', { name: 'Applications.dhbase.yaml' }).click();

	const preview = page.getByLabel('Preview');
	await expect(preview.getByRole('button', { name: /All table/u })).toHaveAttribute('aria-pressed', 'true');
	await expect(preview.getByRole('button', { name: 'Blank Co', exact: true })).toBeVisible();

	await preview.getByRole('button', { name: /Interviews table/u }).click();
	await expect(preview.getByRole('button', { name: /Interviews table/u })).toHaveAttribute('aria-pressed', 'true');
	await expect(preview.getByRole('searchbox', { name: 'Filter collection records' })).toHaveValue('Interview');
	await expect(preview.getByRole('button', { name: 'Sort by Rating' })).toContainText('desc');
	await expect(preview.getByRole('button', { name: 'Blank Co', exact: true })).toHaveCount(0);
	expect(await preview.locator('tbody .record-link').allTextContents()).toEqual(['Acme Labs', 'Nimbus Works']);

	await preview.getByRole('button', { name: /All table/u }).click();
	await expect(preview.getByRole('searchbox', { name: 'Filter collection records' })).toHaveValue('');
	await expect(preview.getByRole('button', { name: 'Blank Co', exact: true })).toBeVisible();

	await preview.getByRole('button', { name: /Interviews table/u }).click();
	const csvDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export CSV' }).click();
	const csvDownload = await csvDownloadPromise;
	const csvPath = await csvDownload.path();
	expect(csvPath).toBeTruthy();
	const csvContent = await readFile(csvPath ?? '', 'utf8');

	expect(csvDownload.suggestedFilename()).toBe('applications-interviews.csv');
	expect(csvContent).toContain('title,company,status,rating');
	expect(csvContent).toContain('Acme Labs,Acme,Interview,5');
	expect(csvContent).toContain('Nimbus Works,Nimbus,Interview,3');
	expect(csvContent).not.toContain('Blank Co');
});

test('timeline collection views sort filter and export records', async ({ page }) => {
	const vaultName = `datahoarder-e2e-timeline-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const collectionFile = await directory.getFileHandle('Timeline.dhbase.yaml', { create: true });
			const writable = await collectionFile.createWritable();

			await writable.write(
				[
					'name: Commission Timeline',
					'schema:',
					'  stage: text',
					'  worked: date',
					'source:',
					'  folders: [commissions]',
					'views:',
					'  - type: timeline',
					'    name: Work Log',
					'    dateField: worked',
					'    columns: [title, worked, stage]'
				].join('\n')
			);
			await writable.close();

			const commissionsDirectory = await directory.getDirectoryHandle('commissions', { create: true });
			const writeCommission = async (fileName: string, content: string) => {
				const file = await commissionsDirectory.getFileHandle(fileName, { create: true });
				const commissionWritable = await file.createWritable();

				await commissionWritable.write(content);
				await commissionWritable.close();
			};

			await writeCommission('sketch.md', '# Sketch\n\nworked:: 2026-01-05\nstage:: Sketching\n');
			await writeCommission('polish.md', '# Polish\n\nworked:: 2026-01-02\nstage:: Polish\n');
			await writeCommission('backlog.md', '# Backlog\n\nstage:: Backlog\n');

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.locator('.note-columns').getByRole('button', { name: 'Timeline.dhbase.yaml' }).click();

	const preview = page.getByLabel('Preview');
	await expect(preview.getByText('timeline collection')).toBeVisible();
	await expect(preview.getByLabel('Commission Timeline timeline')).toBeVisible();
	await expect(preview.getByText('Undated')).toBeVisible();
	expect(await preview.locator('.collection-timeline-card .record-link').allTextContents()).toEqual([
		'Polish',
		'Sketch',
		'Backlog'
	]);

	await preview.getByRole('searchbox', { name: 'Filter collection records' }).fill('sketch');
	await expect(preview.getByRole('button', { name: 'Sketch', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Polish', exact: true })).toHaveCount(0);

	const htmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const htmlDownload = await htmlDownloadPromise;
	const htmlPath = await htmlDownload.path();
	expect(htmlPath).toBeTruthy();
	const htmlContent = await readFile(htmlPath ?? '', 'utf8');

	expect(htmlDownload.suggestedFilename()).toBe('commission-timeline-work-log.html');
	expect(htmlContent).toContain('class="timeline-list"');
	expect(htmlContent).toContain('2026-01-05');
	expect(htmlContent).toContain('Sketch');
	expect(htmlContent).not.toContain('<table>');
	expect(htmlContent).not.toContain('Polish');

	const csvDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export CSV' }).click();
	const csvDownload = await csvDownloadPromise;
	const csvPath = await csvDownload.path();
	expect(csvPath).toBeTruthy();
	const csvContent = await readFile(csvPath ?? '', 'utf8');

	expect(csvDownload.suggestedFilename()).toBe('commission-timeline-work-log.csv');
	expect(csvContent).toContain('title,worked,stage');
	expect(csvContent).toContain('Sketch,2026-01-05,Sketching');
	expect(csvContent).not.toContain('Polish');
});

test('collection formula fields derive filter summarize and export values', async ({ page }) => {
	const vaultName = `datahoarder-e2e-formula-fields-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const collectionFile = await directory.getFileHandle('Applications.dhbase.yaml', { create: true });
			const writable = await collectionFile.createWritable();

			await writable.write(
				[
					'name: Applications',
					'schema:',
					'  rating: number',
					'  weight: number',
					'  score:',
					'    formula: rating * weight + 1',
					'  label:',
					'    formula: "{title}: {score}"',
					'source:',
					'  folders: [applications]',
					'summaries:',
					'  - name: Score Sum',
					'    type: sum',
					'    field: score',
					'views:',
					'  - type: table',
					'    name: Table',
					'    columns: [title, rating, weight, score, label]'
				].join('\n')
			);
			await writable.close();

			const applicationsDirectory = await directory.getDirectoryHandle('applications', { create: true });
			const writeApplication = async (fileName: string, content: string) => {
				const file = await applicationsDirectory.getFileHandle(fileName, { create: true });
				const applicationWritable = await file.createWritable();

				await applicationWritable.write(content);
				await applicationWritable.close();
			};

			await writeApplication('acme.md', '# Acme\n\nrating:: 4\nweight:: 2\n');
			await writeApplication('nimbus.md', '# Nimbus\n\nrating:: 3\nweight:: 3\n');

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.locator('.note-columns').getByRole('button', { name: 'Applications.dhbase.yaml' }).click();

	const preview = page.getByLabel('Preview');
	await expect(preview.getByRole('cell', { name: '9', exact: true })).toBeVisible();
	await expect(preview.getByRole('cell', { name: '10', exact: true })).toBeVisible();
	await expect(preview.getByRole('cell', { name: 'Acme: 9', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: /Edit Score/u })).toHaveCount(0);

	const summaries = preview.getByLabel('Collection summaries');
	await expect(summaries.locator('.collection-summary', { hasText: 'Score Sum' }).getByText('19', { exact: true })).toBeVisible();

	await preview.getByRole('searchbox', { name: 'Filter collection records' }).fill('Acme: 9');
	await expect(preview.getByRole('button', { name: 'Acme', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Nimbus', exact: true })).toHaveCount(0);

	const csvDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export CSV' }).click();
	const csvDownload = await csvDownloadPromise;
	const csvPath = await csvDownload.path();
	expect(csvPath).toBeTruthy();
	const csvContent = await readFile(csvPath ?? '', 'utf8');

	expect(csvDownload.suggestedFilename()).toBe('applications-table.csv');
	expect(csvContent).toContain('title,rating,weight,score,label');
	expect(csvContent).toContain('Acme,4,2,9,Acme: 9');
	expect(csvContent).not.toContain('Nimbus');
});

test('collection fields can be bulk updated across visible filtered records', async ({ page }) => {
	const vaultName = `datahoarder-e2e-bulk-field-${Date.now()}`;
	const dialogResponses = ['status', 'Done', ''];

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const collectionFile = await directory.getFileHandle('Tasks.dhbase.yaml', { create: true });
			const writable = await collectionFile.createWritable();

			await writable.write(
				[
					'name: Tasks',
					'schema:',
					'  status: text',
					'  owner: text',
					'source:',
					'  folders: [tasks]',
					'views:',
					'  - type: table',
					'    name: Table',
					'    columns: [title, status, owner]'
				].join('\n')
			);
			await writable.close();

			const tasksDirectory = await directory.getDirectoryHandle('tasks', { create: true });
			const writeTask = async (fileName: string, content: string) => {
				const file = await tasksDirectory.getFileHandle(fileName, { create: true });
				const taskWritable = await file.createWritable();

				await taskWritable.write(content);
				await taskWritable.close();
			};

			await writeTask('alpha.md', '# Alpha\n\nstatus:: Todo\nowner:: V\n');
			await writeTask('beta.md', '# Beta\n\nstatus:: Todo\nowner:: V\n');
			await writeTask('gamma.md', '# Gamma\n\nstatus:: Todo\nowner:: Z\n');

			return directory;
		};
	}, vaultName);

	page.on('dialog', async (dialog) => {
		await dialog.accept(dialogResponses.shift() ?? '');
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.locator('.note-columns').getByRole('button', { name: 'Tasks.dhbase.yaml' }).click();

	const preview = page.getByLabel('Preview');
	await preview.getByRole('searchbox', { name: 'Filter collection records' }).fill('V');
	await expect(preview.getByRole('button', { name: 'Alpha', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Beta', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Gamma', exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: 'Bulk Set Field' }).click();
	await expect(page.getByText('Updated status on 2 visible records.')).toBeVisible();
	await expect(preview.locator('.collection-cell-edit', { hasText: 'Done' })).toHaveCount(2);

	const taskFiles = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const tasksDirectory = await directory.getDirectoryHandle('tasks');
		const readTask = async (fileName: string) => {
			const file = await tasksDirectory.getFileHandle(fileName);
			const blob = await file.getFile();

			return blob.text();
		};

		return {
			alpha: await readTask('alpha.md'),
			beta: await readTask('beta.md'),
			gamma: await readTask('gamma.md')
		};
	}, vaultName);

	expect(taskFiles.alpha).toContain('status:: Done');
	expect(taskFiles.beta).toContain('status:: Done');
	expect(taskFiles.gamma).toContain('status:: Todo');
});

test('collection cells use typed inline editors from schema metadata', async ({ page }) => {
	const vaultName = `datahoarder-e2e-typed-cell-editors-${Date.now()}`;

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const collectionFile = await directory.getFileHandle('Applications.dhbase.yaml', { create: true });
			const writable = await collectionFile.createWritable();

			await writable.write(
				[
					'name: Applications',
					'schema:',
					'  status:',
					'    type: enum',
					'    options: [Applied, Interview, Offer]',
					'  rating: number',
					'  applied: date',
					'source:',
					'  folders: [applications]',
					'views:',
					'  - type: table',
					'    name: Table',
					'    columns: [title, status, rating, applied]'
				].join('\n')
			);
			await writable.close();

			const applicationsDirectory = await directory.getDirectoryHandle('applications', { create: true });
			const file = await applicationsDirectory.getFileHandle('acme.md', { create: true });
			const noteWritable = await file.createWritable();

			await noteWritable.write('# Acme\n\nstatus:: Applied\nrating:: 3\napplied:: 2026-01-01\n');
			await noteWritable.close();

			return directory;
		};
	}, vaultName);

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await page.locator('.note-columns').getByRole('button', { name: 'Applications.dhbase.yaml' }).click();

	const preview = page.getByLabel('Preview');
	await preview.getByRole('button', { name: /Edit Status for Acme/u }).click();
	const statusSelect = preview.getByRole('combobox', { name: 'Status for Acme' });
	await expect(statusSelect).toHaveValue('Applied');
	await statusSelect.selectOption('Interview');
	await preview.getByRole('button', { name: 'Save Status for Acme' }).click();
	await expect(page.getByText('Updated status on applications/acme.md')).toBeVisible();

	await preview.getByRole('button', { name: /Edit Rating for Acme/u }).click();
	const ratingInput = preview.getByRole('spinbutton', { name: 'Rating for Acme' });
	await expect(ratingInput).toHaveAttribute('type', 'number');
	await ratingInput.fill('5');
	await preview.getByRole('button', { name: 'Save Rating for Acme' }).click();
	await expect(page.getByText('Updated rating on applications/acme.md')).toBeVisible();

	await preview.getByRole('button', { name: /Edit Applied for Acme/u }).click();
	const appliedInput = preview.locator('input[type="date"][aria-label="Applied for Acme"]');
	await expect(appliedInput).toHaveAttribute('type', 'date');
	await appliedInput.fill('2026-02-03');
	await preview.getByRole('button', { name: 'Save Applied for Acme' }).click();
	await expect(page.getByText('Updated applied on applications/acme.md')).toBeVisible();

	const editedRecordContent = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const applicationsDirectory = await directory.getDirectoryHandle('applications');
		const file = await applicationsDirectory.getFileHandle('acme.md');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(editedRecordContent).toContain('status:: Interview');
	expect(editedRecordContent).toContain('rating:: 5');
	expect(editedRecordContent).toContain('applied:: 2026-02-03');
});

test('collection records can be scaffolded from the selected collection', async ({ page }) => {
	const vaultName = `datahoarder-e2e-collection-record-${Date.now()}`;
	const dialogResponses = ['priority', 'text', 'Acme Labs'];

	await page.addInitScript((name) => {
		window.showDirectoryPicker = async () => {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle(name, { create: true });
			const collectionFile = await directory.getFileHandle('Applications.dhbase.yaml', { create: true });
			const writable = await collectionFile.createWritable();

			await writable.write(
				[
					'name: Applications',
					'schema:',
					'  company: text',
					'  role: text',
					'  status: text',
					'source:',
					'  folders: [applications]',
					'  tags: [jobs]',
					'  match:',
					'    status:',
					'      includes: Applied',
					'views:',
					'  - type: table',
					'    name: Table',
					'    columns: [title, company, status, tags]'
				].join('\n')
			);
			await writable.close();

			const applicationsDirectory = await directory.getDirectoryHandle('applications', { create: true });
			const nimbusFile = await applicationsDirectory.getFileHandle('nimbus.md', { create: true });
			const nimbusWritable = await nimbusFile.createWritable();

			await nimbusWritable.write('# Nimbus Works\n\ncompany:: Nimbus\nstatus:: Applied\ntags:: [jobs]\n');
			await nimbusWritable.close();

			return directory;
		};
	}, vaultName);

	page.on('dialog', async (dialog) => {
		await dialog.accept(dialogResponses.shift() ?? '');
	});

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'Applications' })).toBeVisible();

	await page.getByRole('button', { name: 'Add Field' }).click();
	await expect(page.getByText('Added priority field to Applications.dhbase.yaml')).toBeVisible();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'Applications' })).toBeVisible();
	await expect(page.getByLabel('Editor').getByRole('heading', { name: 'Applications.dhbase.yaml' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sort by Priority' })).toBeVisible();

	const editedCollectionContent = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const file = await directory.getFileHandle('Applications.dhbase.yaml');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(editedCollectionContent).toContain('  priority: text');
	expect(editedCollectionContent).toContain('columns: [title, company, status, tags, priority]');

	await page.getByRole('button', { name: 'New Record' }).click();
	await expect(page.getByText('Created collection record applications/acme-labs.md')).toBeVisible();
	await expect(page.getByLabel('Editor').getByText('applications/acme-labs.md')).toBeVisible();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'Acme Labs' })).toBeVisible();

	const noteHtmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const noteHtmlDownload = await noteHtmlDownloadPromise;
	const noteHtmlPath = await noteHtmlDownload.path();
	expect(noteHtmlPath).toBeTruthy();
	const noteHtmlContent = await readFile(noteHtmlPath ?? '', 'utf8');

	expect(noteHtmlDownload.suggestedFilename()).toBe('acme-labs.html');
	expect(noteHtmlContent).toContain('<p>Datahoarder note export</p>');
	expect(noteHtmlContent).toContain('<title>Acme Labs</title>');
	expect(noteHtmlContent).toContain('<h1>Acme Labs</h1>');
	expect(noteHtmlContent).toContain('<article><h1>Acme Labs</h1>');
	await expect(page.getByText('Exported applications/acme-labs.md as HTML.')).toBeVisible();

	await page.locator('.note-columns').getByRole('button', { name: 'Applications.dhbase.yaml' }).click();
	const preview = page.getByLabel('Preview');

	await expect(preview.getByRole('button', { name: 'Acme Labs', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Nimbus Works', exact: true })).toBeVisible();
	await expect(preview.getByRole('cell', { name: 'Applied' })).toHaveCount(2);
	await expect(preview.getByRole('cell', { name: 'jobs' })).toHaveCount(2);

	await preview.getByRole('button', { name: /Edit Priority for Acme Labs/u }).click();
	await preview.getByRole('textbox', { name: 'Priority for Acme Labs' }).fill('High');
	await preview.getByRole('button', { name: 'Save Priority for Acme Labs' }).click();
	await expect(page.getByText('Updated priority on applications/acme-labs.md')).toBeVisible();
	await expect(preview.locator('.collection-cell-edit', { hasText: 'High' })).toBeVisible();

	await preview.getByRole('button', { name: /Edit Company for Acme Labs/u }).click();
	await preview.getByRole('textbox', { name: 'Company for Acme Labs' }).fill('Acme Labs LLC');
	await preview.getByRole('button', { name: 'Save Company for Acme Labs' }).click();
	await expect(page.getByText('Updated company on applications/acme-labs.md')).toBeVisible();
	await expect(preview.locator('.collection-cell-edit', { hasText: 'Acme Labs LLC' })).toBeVisible();

	const editedRecordContent = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const applicationsDirectory = await directory.getDirectoryHandle('applications');
		const file = await applicationsDirectory.getFileHandle('acme-labs.md');
		const blob = await file.getFile();

		return blob.text();
	}, vaultName);

	expect(editedRecordContent).toContain('company:: Acme Labs LLC');
	expect(editedRecordContent).toContain('priority:: High');

	await preview.getByRole('searchbox', { name: 'Filter collection records' }).fill('acme');
	await expect(preview.getByRole('button', { name: 'Acme Labs', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Nimbus Works', exact: true })).toHaveCount(0);

	const csvDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export CSV' }).click();
	const csvDownload = await csvDownloadPromise;
	const csvPath = await csvDownload.path();
	expect(csvPath).toBeTruthy();
	const csvContent = await readFile(csvPath ?? '', 'utf8');

	expect(csvDownload.suggestedFilename()).toBe('applications-table.csv');
	expect(csvContent).toContain('title,company,status,tags,priority');
	expect(csvContent).toContain('Acme Labs,Acme Labs LLC,Applied,jobs,High');
	expect(csvContent).not.toContain('Nimbus Works');
	await expect(page.getByText('Exported 1 collection records as CSV.')).toBeVisible();

	const jsonDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export JSON' }).click();
	const jsonDownload = await jsonDownloadPromise;
	const jsonPath = await jsonDownload.path();
	expect(jsonPath).toBeTruthy();
	const jsonContent = await readFile(jsonPath ?? '', 'utf8');

	expect(jsonDownload.suggestedFilename()).toBe('applications-table.json');
	expect(JSON.parse(jsonContent)).toEqual([
		{
			title: 'Acme Labs',
			company: 'Acme Labs LLC',
			status: 'Applied',
			tags: ['jobs'],
			priority: 'High'
		}
	]);
	await expect(page.getByText('Exported 1 collection records as JSON.')).toBeVisible();

	const collectionHtmlDownloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export HTML' }).click();
	const collectionHtmlDownload = await collectionHtmlDownloadPromise;
	const collectionHtmlPath = await collectionHtmlDownload.path();
	expect(collectionHtmlPath).toBeTruthy();
	const collectionHtmlContent = await readFile(collectionHtmlPath ?? '', 'utf8');

	expect(collectionHtmlDownload.suggestedFilename()).toBe('applications-table.html');
	expect(collectionHtmlContent).toContain('<p>Table collection view</p>');
	expect(collectionHtmlContent).toContain('<title>Applications</title>');
	expect(collectionHtmlContent).toContain('<td>Acme Labs</td>');
	expect(collectionHtmlContent).toContain('<td>Acme Labs LLC</td>');
	expect(collectionHtmlContent).toContain('<td>High</td>');
	expect(collectionHtmlContent).not.toContain('Nimbus Works');
	await expect(page.getByText('Exported Applications.dhbase.yaml as HTML.')).toBeVisible();
});

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
