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
