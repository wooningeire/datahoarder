import { describe, expect, it } from 'vitest';
import { searchVaultRecords } from './vault-search.js';
import type { VaultRecord } from './vault-index.js';

describe('searchVaultRecords', () => {
	it('ranks title matches above body-only matches', () => {
		const results = searchVaultRecords(
			[
				createRecord('body.md', 'Body Match', 'Quiet note', 'job applications and sankey data'),
				createRecord('sankey.md', 'Sankey Tracker', 'Other note', 'job applications')
			],
			'sankey'
		);

		expect(results).toHaveLength(2);
		expect(results[0].record.title).toBe('Sankey Tracker');
		expect(results[0].matches).toContain('title');
	});

	it('matches tags and requires every token', () => {
		const results = searchVaultRecords(
			[
				createRecord('art/moodboard.md', 'Moodboard', 'Cloud colors', 'blue', ['art', 'visual']),
				createRecord('tasks/today.md', 'Today', 'Cloud errands', 'blue', ['task'])
			],
			'#art cloud'
		);

		expect(results).toHaveLength(1);
		expect(results[0].record.path).toBe('art/moodboard.md');
		expect(results[0].matches).toEqual(expect.arrayContaining(['tag', 'preview']));
	});

	it('filters by structured fields tags quoted values and exclusions', () => {
		const results = searchVaultRecords(
			[
				createRecord('applications/acme.md', 'Acme Labs', 'Interview stage', 'pipeline note', ['jobs'], {
					company: 'Acme Labs',
					status: ['Applied', 'Interview']
				}),
				createRecord('applications/nimbus.md', 'Nimbus Works', 'Offer stage', 'pipeline note', ['jobs'], {
					company: 'Nimbus Works',
					status: 'Offer'
				}),
				createRecord('archive/acme.md', 'Acme Draft', 'Rejected stage', 'draft note', ['archive'], {
					company: 'Acme Labs',
					status: 'Rejected'
				})
			],
			'#jobs company:"Acme Labs" status:Interview -draft'
		);

		expect(results.map((result) => result.record.path)).toEqual(['applications/acme.md']);
		expect(results[0].matches).toEqual(expect.arrayContaining(['tag', 'company', 'status']));
	});
});

function createRecord(
	path: string,
	title: string,
	preview: string,
	content: string,
	tags: string[] = [],
	properties: VaultRecord['properties'] = {}
): VaultRecord {
	return {
		basename: path.split('/').at(-1)?.replace(/\.(md|svx)$/iu, '') ?? path,
		content,
		extension: '.md',
		folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
		links: [],
		path,
		preview,
		properties,
		routePath: path.replace(/\.(md|svx)$/iu, ''),
		size: content.length,
		tags,
		title,
		updatedAt: 0
	};
}
