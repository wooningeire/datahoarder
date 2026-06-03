import { describe, expect, it } from 'vitest';
import type { LocalVaultFile } from './local-vault.js';
import { buildLocalVaultIndex } from './vault-index.js';
import {
	createCollectionRecordDraft,
	evaluateCollectionFormula,
	filterCollectionRecords,
	getCollectionField,
	formatCollectionRecordValue,
	getCollectionTimelineItems,
	getCollectionViewDateField,
	getCollectionViewGroupBy,
	groupCollectionRecordsForKanban,
	isComputedCollectionColumn,
	parseDatahoarderCollection,
	resolveDatahoarderCollection,
	serializeCollectionRecordsAsCsv,
	serializeCollectionRecordsAsJson,
	sortCollectionRecords,
	summarizeCollectionRecords
} from './collection.js';

describe('resolveDatahoarderCollection', () => {
	it('uses inline note fields for collection matches columns filters and sorting', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile(
				'applications/acme.md',
				['# Acme', 'company:: Acme Labs', 'status:: Applied', 'status:: Interview', 'stage:: Screen'].join('\n')
			),
			createLocalVaultFile(
				'applications/nimbus.md',
				['# Nimbus', 'company:: Nimbus Works', 'status:: Applied', 'stage:: Offer'].join('\n')
			),
			createLocalVaultFile('applications/empty-status.md', ['# Empty Status', 'company:: Blank Co', 'status::'].join('\n'))
		]);
		const collection = resolveDatahoarderCollection(
			[
				'name: Applications',
				'schema:',
				'  company: text',
				'  status: text',
				'  stage: text',
				'source:',
				'  match:',
				'    status:',
				'      includes: Applied',
				'views:',
				'  - type: table',
				'    columns: [title, company, status, stage]'
			].join('\n'),
			'applications.dhbase.yaml',
			index
		);

		expect(collection.records.map((record) => record.path)).toEqual([
			'applications/acme.md',
			'applications/nimbus.md'
		]);
		expect(formatCollectionRecordValue(collection.records[0], 'company')).toBe('Acme Labs');
		expect(filterCollectionRecords(collection.records, 'nimbus', collection.columns)).toHaveLength(1);
		expect(filterCollectionRecords(collection.records, 'status:Interview', collection.columns).map((record) => record.path)).toEqual([
			'applications/acme.md'
		]);
		expect(sortCollectionRecords(collection.records, 'stage', 'desc').map((record) => record.path)).toEqual([
			'applications/acme.md',
			'applications/nimbus.md'
		]);
	});

	it('parses and groups kanban collection views', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile('applications/acme.md', '# Acme\n\ncompany:: Acme Labs\nstatus:: Applied\n'),
			createLocalVaultFile('applications/nimbus.md', '# Nimbus\n\ncompany:: Nimbus Works\nstatus:: Interview\n'),
			createLocalVaultFile('applications/blank.md', '# Blank\n\ncompany:: Blank Co\n')
		]);
		const collection = resolveDatahoarderCollection(
			[
				'name: Applications',
				'schema:',
				'  company: text',
				'  status: text',
				'source:',
				'  folders: [applications]',
				'views:',
				'  - type: kanban',
				'    name: Pipeline',
				'    groupBy: status',
				'    columns: [title, company, status]'
			].join('\n'),
			'applications.dhbase.yaml',
			index
		);
		const groups = groupCollectionRecordsForKanban(collection.records, getCollectionViewGroupBy(collection.view));

		expect(collection.view).toMatchObject({
			type: 'kanban',
			groupBy: 'status'
		});
		expect(groups.map((group) => [group.label, group.records.map((record) => record.title)])).toEqual([
			['Applied', ['Acme']],
			['Interview', ['Nimbus']],
			['Unassigned', ['Blank']]
		]);
	});

	it('resolves an indexed collection view when multiple views are configured', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile('applications/acme.md', '# Acme\n\ncompany:: Acme Labs\nstatus:: Applied\n')
		]);
		const content = [
			'name: Applications',
			'schema:',
			'  company: text',
			'  status: text',
			'source:',
			'  folders: [applications]',
			'views:',
			'  - type: table',
			'    name: Duplicate',
			'    columns: [title, company]',
			'  - type: kanban',
			'    name: Duplicate',
			'    groupBy: status',
			'    columns: [title, company, status]'
		].join('\n');

		const collection = resolveDatahoarderCollection(content, 'applications.dhbase.yaml', index, 1);
		const fallbackCollection = resolveDatahoarderCollection(content, 'applications.dhbase.yaml', index, 99);

		expect(collection).toMatchObject({
			viewIndex: 1
		});
		expect(collection.view).toMatchObject({
			groupBy: 'status',
			name: 'Duplicate',
			type: 'kanban'
		});
		expect(fallbackCollection).toMatchObject({
			viewIndex: 0
		});
		expect(fallbackCollection.view).toMatchObject({
			name: 'Duplicate',
			type: 'table'
		});
	});

	it('parses collection view filter and sort presets', () => {
		const definition = parseDatahoarderCollection(
			[
				'views:',
				'  - type: table',
				'    name: Hot Leads',
				'    filter: Interview',
				'    sortBy: rating',
				'    sortDirection: desc',
				'  - type: table',
				'    name: Compact Sort',
				'    query: Acme',
				'    sort: status ascending',
				'  - type: table',
				'    name: Record Sort',
				'    search: Applied',
				'    sort:',
				'      field: company',
				'      direction: sideways',
				'  - type: table',
				'    name: Order Alias',
				'    orderBy: updatedAt',
				'    order: descending'
			].join('\n')
		);

		expect(definition.views).toMatchObject([
			{
				filter: 'Interview',
				name: 'Hot Leads',
				sortColumn: 'rating',
				sortDirection: 'desc'
			},
			{
				filter: 'Acme',
				name: 'Compact Sort',
				sortColumn: 'status',
				sortDirection: 'asc'
			},
			{
				filter: 'Applied',
				name: 'Record Sort',
				sortColumn: 'company',
				sortDirection: 'asc'
			},
			{
				filter: '',
				name: 'Order Alias',
				sortColumn: 'updatedAt',
				sortDirection: 'desc'
			}
		]);
		expect(parseDatahoarderCollection('').views[0]).toEqual({
			columns: [],
			dateField: '',
			filter: '',
			groupBy: '',
			name: 'Table',
			sortColumn: '',
			sortDirection: 'asc',
			type: 'table'
		});
	});

	it('parses and sorts timeline collection views', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile('logs/sketch.md', '# Sketch\n\nworked:: 2026-01-05\nstage:: Sketching\n'),
			createLocalVaultFile('logs/polish.md', '# Polish\n\nworked:: 2026-01-02\nstage:: Polish\n'),
			createLocalVaultFile('logs/repeated.md', '# Repeat\n\nworked:: TBD\nworked:: 2026-01-01\nstage:: Repeat\n'),
			createLocalVaultFile('logs/invalid.md', '# Review\n\nworked:: soon\nstage:: Review\n'),
			createLocalVaultFile('logs/backlog.md', '# Backlog\n\nstage:: Backlog\n')
		]);
		const collection = resolveDatahoarderCollection(
			[
				'name: Work Log',
				'schema:',
				'  worked: date',
				'  stage: text',
				'source:',
				'  folders: [logs]',
				'views:',
				'  - type: timeline',
				'    name: Timeline',
				'    dateBy: worked',
				'    columns: [title, worked, stage]'
			].join('\n'),
			'logs.dhbase.yaml',
			index
		);
		const items = getCollectionTimelineItems(collection.records, getCollectionViewDateField(collection.view));

		expect(collection.view).toMatchObject({
			dateField: 'worked',
			type: 'timeline'
		});
		expect(items.map((item) => [item.dateLabel, item.record.title])).toEqual([
			['2026-01-01', 'Repeat'],
			['2026-01-02', 'Polish'],
			['2026-01-05', 'Sketch'],
			['Undated', 'Review'],
			['Undated', 'Backlog']
		]);
		expect(parseDatahoarderCollection('views:\n  - type: timeline\n    dateField: due').views[0].dateField).toBe(
			'due'
		);
		expect(parseDatahoarderCollection('views:\n  - type: timeline\n    date: start').views[0].dateField).toBe(
			'start'
		);
		expect(getCollectionViewDateField(parseDatahoarderCollection('views:\n  - type: timeline').views[0])).toBe(
			'date'
		);
	});

	it('parses and computes collection summaries from current records', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile('applications/acme.md', '# Acme\n\nstatus:: Applied\nrating:: 5\ntags:: [jobs, remote]\n'),
			createLocalVaultFile('applications/nimbus.md', '# Nimbus\n\nstatus:: Interview\nrating:: 3\ntags:: [jobs]\n'),
			createLocalVaultFile('applications/blank.md', '# Blank\n\nrating:: not yet\n')
		]);
		const collection = resolveDatahoarderCollection(
			[
				'name: Applications',
				'schema:',
				'  status: text',
				'  rating: number',
				'source:',
				'  folders: [applications]',
				'summaries:',
				'  - name: Total',
				'    type: count',
				'  - name: By Status',
				'    type: countBy',
				'    field: status',
				'  - name: Rating Sum',
				'    type: sum',
				'    field: rating',
				'  - name: Average Rating',
				'    type: average',
				'    field: rating'
			].join('\n'),
			'applications.dhbase.yaml',
			index
		);

		expect(collection.definition.summaries).toEqual([
			{ field: '', name: 'Total', type: 'count' },
			{ field: 'status', name: 'By Status', type: 'countBy' },
			{ field: 'rating', name: 'Rating Sum', type: 'sum' },
			{ field: 'rating', name: 'Average Rating', type: 'average' }
		]);
		expect(summarizeCollectionRecords(collection.records, collection.definition.summaries)).toEqual([
			{ items: [], label: 'Total', type: 'count', value: '3' },
			{
				items: [
					{ label: 'Applied', value: '1' },
					{ label: 'Interview', value: '1' },
					{ label: 'Unassigned', value: '1' }
				],
				label: 'By Status',
				type: 'countBy',
				value: 'Applied: 1, Interview: 1, Unassigned: 1'
			},
			{ items: [], label: 'Rating Sum', type: 'sum', value: '8' },
			{ items: [], label: 'Average Rating', type: 'average', value: '4' }
		]);
	});

	it('resolves formula fields for derived columns summaries filters and exports', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile('applications/acme.md', '# Acme\n\nrating:: 4\nweight:: 2\n'),
			createLocalVaultFile('applications/nimbus.md', '# Nimbus\n\nrating:: 3\nweight:: 3\n')
		]);
		const content = [
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
			'    columns: [title, rating, weight, score, label]'
		].join('\n');
		const collection = resolveDatahoarderCollection(content, 'applications.dhbase.yaml', index);
		const [acme, nimbus] = collection.records;

		expect(collection.definition.schema.find((field) => field.name === 'score')).toEqual({
			formula: 'rating * weight + 1',
			name: 'score',
			options: [],
			type: 'formula'
		});
		expect(isComputedCollectionColumn(collection.definition, 'score')).toBe(true);
		expect(isComputedCollectionColumn(collection.definition, 'rating')).toBe(false);
		expect(formatCollectionRecordValue(acme, 'score')).toBe('9');
		expect(formatCollectionRecordValue(nimbus, 'score')).toBe('10');
		expect(formatCollectionRecordValue(acme, 'label')).toBe('Acme: 9');
		expect(filterCollectionRecords(collection.records, 'Acme: 9', collection.columns).map((record) => record.path)).toEqual([
			'applications/acme.md'
		]);
		expect(filterCollectionRecords(collection.records, 'score:9', collection.columns).map((record) => record.path)).toEqual([
			'applications/acme.md'
		]);
		expect(sortCollectionRecords(collection.records, 'score', 'desc').map((record) => record.title)).toEqual([
			'Nimbus',
			'Acme'
		]);
		expect(summarizeCollectionRecords(collection.records, collection.definition.summaries)).toEqual([
			{ items: [], label: 'Score Sum', type: 'sum', value: '19' }
		]);
		expect(serializeCollectionRecordsAsCsv(collection.records, collection.columns)).toContain(
			'Acme,4,2,9,Acme: 9'
		);
		expect(JSON.parse(serializeCollectionRecordsAsJson([acme], collection.columns))).toEqual([
			{
				title: 'Acme',
				rating: 4,
				weight: 2,
				score: 9,
				label: 'Acme: 9'
			}
		]);
		expect(createCollectionRecordDraft(collection.definition, 'Draft').content).not.toContain('score::');
		expect(evaluateCollectionFormula(acme, 'missing + 1')).toBe('');
	});

	it('parses field options for typed collection editors', () => {
		const definition = parseDatahoarderCollection(
			[
				'schema:',
				'  status:',
				'    type: enum',
				'    options: [Applied, Interview, Offer]',
				'  owner:',
				'    type: select',
				'    choices:',
				'      - V',
				'      - Team'
			].join('\n'),
			'applications.dhbase.yaml'
		);

		expect(getCollectionField(definition, 'status')).toEqual({
			formula: '',
			name: 'status',
			options: ['Applied', 'Interview', 'Offer'],
			type: 'enum'
		});
		expect(getCollectionField(definition, 'owner')?.options).toEqual(['V', 'Team']);
		expect(getCollectionField(definition, 'missing')).toBeNull();
	});

	it('scaffolds a new matching record from collection source rules and schema', async () => {
		const content = [
			'name: Applications',
			'schema:',
			'  company: text',
			'  role: text',
			'  status: text',
			'  tags: text',
			'source:',
			'  folders: [applications]',
			'  tags: [jobs]',
			'  match:',
			'    status:',
			'      includes: Applied',
			'    tags:',
			'      includes: tracked',
			'views:',
			'  - type: table',
			'    columns: [title, company, status, tags]'
		].join('\n');
		const definition = parseDatahoarderCollection(content, 'applications.dhbase.yaml');
		const draft = createCollectionRecordDraft(definition, 'Acme Labs');
		const index = await buildLocalVaultIndex([createLocalVaultFile(draft.path, draft.content)]);
		const collection = resolveDatahoarderCollection(content, 'applications.dhbase.yaml', index);

		expect(draft.path).toBe('applications/acme-labs.md');
		expect(draft.content).toContain('# Acme Labs');
		expect(draft.content).toContain('status:: Applied');
		expect(draft.content).toContain('tags:: [tracked, jobs]');
		expect(draft.content).toContain('company::');
		expect(draft.content).toContain('role::');
		expect(collection.records.map((record) => record.path)).toEqual(['applications/acme-labs.md']);
		expect(formatCollectionRecordValue(collection.records[0], 'status')).toBe('Applied');
		expect(formatCollectionRecordValue(collection.records[0], 'tags')).toBe('jobs, tracked');
	});

	it('resolves new record folders like collection sources do', () => {
		const relativeDefinition = parseDatahoarderCollection(
			['source:', '  folders: [records]', 'schema:', '  status: text'].join('\n'),
			'collections/applications.dhbase.yaml'
		);
		const rootDefinition = parseDatahoarderCollection(
			['source:', '  folders: [/records]', 'schema:', '  status: text'].join('\n'),
			'collections/applications.dhbase.yaml'
		);

		expect(createCollectionRecordDraft(relativeDefinition, 'Acme Labs').path).toBe(
			'collections/records/acme-labs.md'
		);
		expect(createCollectionRecordDraft(rootDefinition, 'Acme Labs').path).toBe('records/acme-labs.md');
	});

	it('scaffolds tags-only collections beside the collection file', async () => {
		const content = ['source:', '  tags: [jobs]', 'schema:', '  company: text'].join('\n');
		const definition = parseDatahoarderCollection(content, 'collections/applications.dhbase.yaml');
		const draft = createCollectionRecordDraft(definition, 'Acme Labs');
		const index = await buildLocalVaultIndex([createLocalVaultFile(draft.path, draft.content)]);
		const collection = resolveDatahoarderCollection(content, 'collections/applications.dhbase.yaml', index);

		expect(draft.path).toBe('collections/acme-labs.md');
		expect(collection.records.map((record) => record.path)).toEqual(['collections/acme-labs.md']);
	});

	it('validates title match rules against the requested record title', () => {
		const definition = parseDatahoarderCollection(
			['source:', '  match:', '    title:', '      equals: Acme Labs'].join('\n'),
			'applications.dhbase.yaml'
		);

		expect(createCollectionRecordDraft(definition, 'Acme Labs').content).toContain('# Acme Labs');
		expect(() => createCollectionRecordDraft(definition, 'Nimbus Works')).toThrow(
			'Collection record scaffold cannot satisfy match rule for "title".'
		);
	});

	it('rejects sources that cannot be satisfied by a new arbitrary note', () => {
		const noSourceDefinition = parseDatahoarderCollection(['schema:', '  status: text'].join('\n'), 'empty.dhbase.yaml');
		const updatedAtDefinition = parseDatahoarderCollection(
			['source:', '  match:', '    updatedAt:', '      exists: true'].join('\n'),
			'dated.dhbase.yaml'
		);
		const conflictingDefinition = parseDatahoarderCollection(
			['source:', '  tags: [jobs]', '  match:', '    tags:', '      exists: false'].join('\n'),
			'conflict.dhbase.yaml'
		);

		expect(() => createCollectionRecordDraft(noSourceDefinition, 'Acme Labs')).toThrow(
			'Add a collection source before creating records.'
		);
		expect(() => createCollectionRecordDraft(updatedAtDefinition, 'Acme Labs')).toThrow(
			'Cannot create records for a collection that matches built-in field "updatedAt".'
		);
		expect(() => createCollectionRecordDraft(conflictingDefinition, 'Acme Labs')).toThrow(
			'Collection record scaffold cannot satisfy match rule for "tags".'
		);
	});

	it('does not scaffold arbitrary records for exact-file sources', () => {
		const definition = parseDatahoarderCollection(
			['source:', '  files: [tracked/acme.md]', 'schema:', '  status: text'].join('\n'),
			'applications.dhbase.yaml'
		);

		expect(() => createCollectionRecordDraft(definition, 'Acme Labs')).toThrow(
			'Collections with exact file sources cannot create matching records.'
		);
	});

	it('serializes collection rows as CSV and raw JSON values', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile(
				'applications/acme.md',
				[
					'# Acme',
					'company:: Acme, Inc.',
					'status:: Applied',
					'rating:: 5',
					'remote:: true',
					'note:: Needs "portfolio" follow-up',
					'tags:: [jobs, tracked]'
				].join('\n')
			)
		]);
		const columns = ['title', 'company', 'rating', 'remote', 'note', 'tags'];
		const record = index.records[0];

		expect(serializeCollectionRecordsAsCsv([record], columns)).toBe(
			[
				'title,company,rating,remote,note,tags',
				'Acme,"Acme, Inc.",5,true,"Needs ""portfolio"" follow-up","jobs, tracked"'
			].join('\r\n')
		);
		expect(JSON.parse(serializeCollectionRecordsAsJson([record], columns))).toEqual([
			{
				title: 'Acme',
				company: 'Acme, Inc.',
				rating: 5,
				remote: true,
				note: 'Needs "portfolio" follow-up',
				tags: ['jobs', 'tracked']
			}
		]);
	});
});

function createLocalVaultFile(path: string, content: string): LocalVaultFile {
	const name = path.split('/').at(-1) ?? path;

	return {
		extension: '.md',
		handle: {
			kind: 'file',
			name,
			getFile: async () =>
				({
					size: content.length,
					lastModified: 0,
					text: async () => content
				}) as File
		},
		path,
		routePath: path.replace(/\.(md|svx)$/iu, ''),
		size: content.length,
		updatedAt: 0
	};
}
