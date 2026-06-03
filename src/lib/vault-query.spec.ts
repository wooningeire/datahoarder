import { describe, expect, it } from 'vitest';
import {
	getCollectionVaultQueryFields,
	matchVaultRecordQuery,
	parseVaultQuery
} from './vault-query.js';
import type { VaultRecord } from './vault-index.js';

describe('vault query', () => {
	it('parses portable text tag and field clauses', () => {
		expect(parseVaultQuery('status:Interview #jobs -draft title:"Acme Labs"')).toEqual({
			clauses: [
				{
					excluded: false,
					field: 'status',
					operator: 'includes',
					type: 'field',
					value: 'Interview'
				},
				{
					excluded: false,
					type: 'tag',
					value: 'jobs'
				},
				{
					excluded: true,
					type: 'text',
					value: 'draft'
				},
				{
					excluded: false,
					field: 'title',
					operator: 'includes',
					type: 'field',
					value: 'Acme Labs'
				}
			]
		});
	});

	it('matches fields tags text exclusions and exists clauses', () => {
		const record = createRecord({
			content: '# Acme Labs\n\nInterview pipeline note.',
			path: 'applications/acme.md',
			properties: {
				company: 'Acme Labs',
				status: ['Applied', 'Interview']
			},
			tags: ['jobs', 'tracked'],
			title: 'Acme Labs'
		});

		expect(matchVaultRecordQuery(record, '#jobs status:interview acme')).toBe(true);
		expect(matchVaultRecordQuery(record, 'status=Interview company:"Acme Labs"')).toBe(true);
		expect(matchVaultRecordQuery(record, 'status:* -rejected')).toBe(true);
		expect(matchVaultRecordQuery(record, 'status=Offer')).toBe(false);
		expect(matchVaultRecordQuery(record, '-interview')).toBe(false);
	});

	it('keeps colon text with spaced values usable for collection labels', () => {
		const record = createRecord({
			properties: {
				label: 'Acme: 9',
				score: 9
			},
			title: 'Acme'
		});

		expect(
			matchVaultRecordQuery(record, 'Acme: 9', {
				textFields: getCollectionVaultQueryFields(record, ['title', 'label', 'score'])
			})
		).toBe(true);
		expect(
			matchVaultRecordQuery(record, 'score:9', {
				textFields: getCollectionVaultQueryFields(record, ['title', 'label', 'score'])
			})
		).toBe(true);
	});
});

function createRecord(overrides: Partial<VaultRecord> = {}): VaultRecord {
	const path = overrides.path ?? 'note.md';
	const routePath = overrides.routePath ?? path.replace(/\.(md|svx)$/iu, '');
	const title = overrides.title ?? routePath.split('/').at(-1) ?? routePath;
	const content = overrides.content ?? `# ${title}`;

	return {
		basename: path.split('/').at(-1)?.replace(/\.(md|svx)$/iu, '') ?? path,
		content,
		extension: '.md',
		folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
		links: [],
		path,
		preview: title,
		properties: {},
		routePath,
		size: content.length,
		tags: [],
		title,
		updatedAt: 0,
		...overrides
	};
}
