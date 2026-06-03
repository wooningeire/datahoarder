import { describe, expect, it } from 'vitest';
import type { LocalVaultFile } from './local-vault.js';
import {
	createSavedVaultSearchContent,
	getSavedVaultSearchPath,
	parseSavedVaultSearch,
	readSavedVaultSearches
} from './saved-search.js';

describe('saved vault searches', () => {
	it('parses JSON saved search files', () => {
		expect(
			parseSavedVaultSearch('{"name":"Visual Flow","query":"#visual sankey"}', 'Saved Searches/visual-flow.dhsearch.json')
		).toEqual({
			name: 'Visual Flow',
			path: 'Saved Searches/visual-flow.dhsearch.json',
			query: '#visual sankey'
		});
	});

	it('parses YAML saved search files with fallback names', () => {
		expect(parseSavedVaultSearch('query: applied interview', 'job-pipeline.dhsearch.yaml')).toEqual({
			name: 'Job Pipeline',
			path: 'job-pipeline.dhsearch.yaml',
			query: 'applied interview'
		});
	});

	it('rejects empty or malformed saved search files', () => {
		expect(parseSavedVaultSearch('{"name":"Broken"', 'broken.dhsearch.json')).toBeNull();
		expect(parseSavedVaultSearch('{"name":"Missing query"}', 'missing-query.dhsearch.json')).toBeNull();
		expect(parseSavedVaultSearch('query: ""', 'empty-query.dhsearch.yaml')).toBeNull();
	});

	it('serializes new saved searches as scriptable JSON', () => {
		expect(JSON.parse(createSavedVaultSearchContent({ name: 'Visual Flow', query: '#visual sankey' }))).toEqual({
			name: 'Visual Flow',
			query: '#visual sankey'
		});
	});

	it('creates unique vault-relative saved search paths', () => {
		expect(
			getSavedVaultSearchPath('Cafe Resume!', [
				'Saved Searches/cafe-resume.dhsearch.json',
				'Saved Searches/cafe-resume-2.dhsearch.json'
			])
		).toBe('Saved Searches/cafe-resume-3.dhsearch.json');
	});

	it('reads only valid saved search files and sorts them by name', async () => {
		const searches = await readSavedVaultSearches([
			createLocalVaultFile('zeta.dhsearch.json', '{"name":"Zeta","query":"tag:zeta"}'),
			createLocalVaultFile('notes.md', '# Notes'),
			createLocalVaultFile('alpha.dhsearch.yaml', 'name: Alpha\nquery: tag:alpha'),
			createLocalVaultFile('broken.dhsearch.json', '{"name":"Broken"')
		]);

		expect(searches.map((search) => [search.name, search.query, search.path])).toEqual([
			['Alpha', 'tag:alpha', 'alpha.dhsearch.yaml'],
			['Zeta', 'tag:zeta', 'zeta.dhsearch.json']
		]);
	});
});

function createLocalVaultFile(path: string, content: string): LocalVaultFile {
	const name = path.split('/').at(-1) ?? path;

	return {
		extension: path.includes('.') ? `.${path.split('.').at(-1) ?? ''}`.toLowerCase() : '',
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
		routePath: path,
		size: content.length,
		updatedAt: 0
	};
}
