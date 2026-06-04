import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { fillInlineFileCreate, fillRequestFields } from './request-dialog.js';

test('kanban collection views group filter and export records', async ({ page }) => {
	const vaultName = `datahoarder-e2e-kanban-${Date.now()}`;

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
	await fillRequestFields(
		page,
		'New Collection Field',
		{
			'Field Name': 'owner',
			'Field Type': 'text'
		},
		'Add Field'
	);
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
		await dialog.accept();
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
	await fillRequestFields(
		page,
		'Bulk Set Collection Field',
		{
			Field: 'status',
			Value: 'Done'
		},
		'Review Update'
	);
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

	await page.goto('/');
	await page.getByRole('button', { name: 'Open Folder' }).click();
	await expect(page.getByLabel('Preview').getByRole('heading', { name: 'Applications' })).toBeVisible();

	await page.getByRole('button', { name: 'Add Field' }).click();
	await fillRequestFields(
		page,
		'New Collection Field',
		{
			'Field Name': 'priority',
			'Field Type': 'text'
		},
		'Add Field'
	);
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
	await fillInlineFileCreate(page, 'New record file name', 'Acme Labs');
	await expect(page.getByText('Created collection record applications/Acme Labs.md')).toBeVisible();
	await expect(page.getByLabel('Editor').getByText('applications/Acme Labs.md')).toBeVisible();
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
	await expect(page.getByText('Exported applications/Acme Labs.md as HTML.')).toBeVisible();

	await page.locator('.note-columns').getByRole('button', { name: 'Applications.dhbase.yaml' }).click();
	const preview = page.getByLabel('Preview');

	await expect(preview.getByRole('button', { name: 'Acme Labs', exact: true })).toBeVisible();
	await expect(preview.getByRole('button', { name: 'Nimbus Works', exact: true })).toBeVisible();
	await expect(preview.getByRole('cell', { name: 'Applied' })).toHaveCount(2);
	await expect(preview.getByRole('cell', { name: 'jobs' })).toHaveCount(2);

	await preview.getByRole('button', { name: /Edit Priority for Acme Labs/u }).click();
	await preview.getByRole('textbox', { name: 'Priority for Acme Labs' }).fill('High');
	await preview.getByRole('button', { name: 'Save Priority for Acme Labs' }).click();
	await expect(page.getByText('Updated priority on applications/Acme Labs.md')).toBeVisible();
	await expect(preview.locator('.collection-cell-edit', { hasText: 'High' })).toBeVisible();

	await preview.getByRole('button', { name: /Edit Company for Acme Labs/u }).click();
	await preview.getByRole('textbox', { name: 'Company for Acme Labs' }).fill('Acme Labs LLC');
	await preview.getByRole('button', { name: 'Save Company for Acme Labs' }).click();
	await expect(page.getByText('Updated company on applications/Acme Labs.md')).toBeVisible();
	await expect(preview.locator('.collection-cell-edit', { hasText: 'Acme Labs LLC' })).toBeVisible();

	const editedRecordContent = await page.evaluate(async (name) => {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(name);
		const applicationsDirectory = await directory.getDirectoryHandle('applications');
		const file = await applicationsDirectory.getFileHandle('Acme Labs.md');
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
