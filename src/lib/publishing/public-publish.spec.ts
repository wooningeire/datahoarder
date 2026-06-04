import { describe, expect, it } from 'vitest';
import {
	createPublicPublishBundle,
	getPublicPublishHref,
	getPublicPublishRecords,
	getPublicVaultRecords,
	parsePublicPublishProfile,
	type PublicPublishEntry
} from './public-publish.js';
import type { VaultRecord } from '../vault/index.js';

describe('public publishing', () => {
	it('selects notes with explicit public fields or public tags', () => {
		const records = [
			record({ path: 'draft.md', properties: { public: false }, tags: ['public'] }),
			record({ path: 'field.md', properties: { public: true } }),
			record({ path: 'share.md', properties: { share: 'public' } }),
			record({ path: 'tag.md', tags: ['public'] }),
			record({ path: 'private.md' })
		];

		expect(getPublicVaultRecords(records).map((item) => item.path)).toEqual([
			'field.md',
			'share.md',
			'tag.md'
		]);
	});

	it('creates an index and unique standalone note files', () => {
		const bundle = createPublicPublishBundle(
			[
				record({ path: 'Index.md', routePath: 'Index', title: 'Index', properties: { public: true } }),
				record({ path: 'Index!.md', routePath: 'Index!', title: 'Index!', properties: { public: true } }),
				record({ path: 'Private.md', routePath: 'Private', title: 'Private' })
			],
			(renderedRecord) => `<p>${renderedRecord.title}</p>`
		);

		expect(bundle.files.map((file) => file.path)).toEqual([
			'public/index.html',
			'public/index-2.html',
			'public/index-3.html'
		]);
		expect(bundle.files[0].content).toContain('Index');
		expect(bundle.files[0].content).not.toContain('Private');
	});

	it('parses publish profiles with collection-style selectors', () => {
		expect(
			parsePublicPublishProfile(
				[
					'name: Portfolio',
					'outputDirectory: public/portfolio',
					'subtitle: Portfolio notes',
					'requirePublic: true',
					'source:',
					'  tags: [portfolio]',
					'  folders: [case-studies]',
					'  files: [about.md]',
					'  match:',
					'    publish:',
					'      includes: portfolio'
				].join('\n'),
				'Profiles/portfolio.dhpublish.yaml'
			)
		).toEqual({
			name: 'Portfolio',
			outputDirectory: 'public/portfolio',
			path: 'Profiles/portfolio.dhpublish.yaml',
			requirePublic: true,
			source: {
				files: ['about.md'],
				folders: ['case-studies'],
				match: {
					publish: {
						includes: 'portfolio'
					}
				},
				query: '',
				tags: ['portfolio']
			},
			subtitle: 'Portfolio notes'
		});
	});

	it('selects profile records by tags and folders', () => {
		const records = [
			record({ path: 'case-studies/acme.md', routePath: 'case-studies/acme', tags: ['portfolio'] }),
			record({ path: 'about.md', routePath: 'about', tags: ['portfolio'] }),
			record({ path: 'case-studies/private.md', routePath: 'case-studies/private', tags: ['portfolio'] }),
			record({ path: 'case-studies/other.md', routePath: 'case-studies/other', tags: ['other'] }),
			record({ path: 'blog/public-slash.md', routePath: 'blog/public-slash', tags: ['public/blog'] })
		];
		const profile = parsePublicPublishProfile(
			[
				'name: Portfolio',
				'outputDirectory: public/portfolio',
				'source:',
				'  tags: [portfolio]',
				'  folders: [case-studies]'
			].join('\n'),
			'Profiles/portfolio.dhpublish.yaml'
		);

		expect(profile).toBeTruthy();
		expect(getPublicPublishRecords(records, profile).map((item) => item.path)).toEqual([
			'case-studies/acme.md',
			'case-studies/private.md'
		]);
		expect(getPublicVaultRecords(records).map((item) => item.path)).toEqual([]);
	});

	it('selects profile records by exact files', () => {
		const records = [
			record({ path: 'about.md', routePath: 'about' }),
			record({ path: 'case-studies/acme.md', routePath: 'case-studies/acme' })
		];
		const profile = parsePublicPublishProfile(
			['name: About', 'source:', '  files: [/about.md]'].join('\n'),
			'Profiles/about.dhpublish.yaml'
		);

		expect(profile).toBeTruthy();
		expect(getPublicPublishRecords(records, profile).map((item) => item.path)).toEqual(['about.md']);
	});

	it('can intersect profile selectors with explicit public markers', () => {
		const records = [
			record({ path: 'public.md', properties: { public: true, publish: ['portfolio'] } }),
			record({ path: 'profile-only.md', properties: { publish: ['portfolio'] } }),
			record({ path: 'private.md', properties: { public: false, publish: ['portfolio'] } })
		];
		const profile = parsePublicPublishProfile(
			[
				'name: Portfolio Public',
				'requirePublic: true',
				'source:',
				'  match:',
				'    publish:',
				'      includes: portfolio'
			].join('\n'),
			'portfolio-public.dhpublish.yaml'
		);

		expect(profile).toBeTruthy();
		expect(getPublicPublishRecords(records, profile).map((item) => item.path)).toEqual(['public.md']);
	});

	it('selects profile records with shared query syntax', () => {
		const records = [
			record({ path: 'case-studies/acme.md', properties: { status: 'Ready' }, tags: ['portfolio'] }),
			record({ path: 'case-studies/draft.md', properties: { status: 'Draft' }, tags: ['portfolio'] }),
			record({ path: 'case-studies/internal.md', properties: { status: 'Ready' }, tags: ['internal'] })
		];
		const profile = parsePublicPublishProfile(
			['name: Portfolio Ready', 'query: "#portfolio status:ready"'].join('\n'),
			'portfolio-ready.dhpublish.yaml'
		);

		expect(profile).toBeTruthy();
		expect(getPublicPublishRecords(records, profile).map((item) => item.path)).toEqual(['case-studies/acme.md']);
	});

	it('uses profile output directories and names in bundles', () => {
		const profile = parsePublicPublishProfile(
			['name: Portfolio', 'outputDirectory: public/portfolio', 'source:', '  tags: [portfolio]'].join('\n'),
			'portfolio.dhpublish.yaml'
		);
		const bundle = createPublicPublishBundle(
			[
				record({ path: 'acme.md', routePath: 'acme', title: 'Acme', tags: ['portfolio'] }),
				record({ path: 'private.md', routePath: 'private', title: 'Private' })
			],
			(renderedRecord) => `<p>${renderedRecord.title}</p>`,
			{ profile }
		);

		expect(bundle.outputDirectory).toBe('public/portfolio');
		expect(bundle.files.map((file) => file.path)).toEqual([
			'public/portfolio/index.html',
			'public/portfolio/acme.html'
		]);
		expect(bundle.files[0].content).toContain('<title>Portfolio</title>');
		expect(bundle.files[0].content).not.toContain('Private');
	});

	it('escapes index titles without leaking previews and creates relative links between public files', () => {
		const bundle = createPublicPublishBundle(
			[
				record({
					path: 'Root.md',
					routePath: 'Root',
					title: 'Root <Note>',
					preview: 'Uses <markup>',
					properties: { public: true }
				}),
				record({
					path: 'Nested/Target.md',
					routePath: 'Nested/Target',
					title: 'Target',
					properties: { public: true }
				})
			],
			(_renderedRecord, entry, entries) => {
				const target = entry.routePath === 'Nested/Target'
					? getEntry(entries, 'Root')
					: getEntry(entries, 'Nested/Target');

				return `<a href="${getPublicPublishHref(entry.outputPath, target.outputPath, 'Part 1')}">Target</a>`;
			}
		);

		expect(bundle.files[0].content).toContain('Root &lt;Note&gt;');
		expect(bundle.files[0].content).not.toContain('Uses &lt;markup&gt;');
		expect(bundle.files.find((file) => file.path === 'public/root.html')?.content).not.toContain('Root.md');
		expect(bundle.files.find((file) => file.path === 'public/root.html')?.content).toContain(
			'href="nested/target.html#Part%201"'
		);
		expect(bundle.files.find((file) => file.path === 'public/nested/target.html')?.content).toContain(
			'href="../root.html#Part%201"'
		);
	});
});

function getEntry(entries: PublicPublishEntry[], routePath: string) {
	const entry = entries.find((candidate) => candidate.routePath === routePath);

	if (!entry) {
		throw new Error(`Missing public entry: ${routePath}`);
	}

	return entry;
}

function record(overrides: Partial<VaultRecord> = {}): VaultRecord {
	const path = overrides.path ?? 'note.md';
	const routePath = overrides.routePath ?? path.replace(/\.(md|svx)$/iu, '');
	const title = overrides.title ?? routePath.split('/').at(-1) ?? routePath;

	return {
		basename: title,
		content: `# ${title}`,
		extension: '.md',
		folder: '',
		links: [],
		path,
		preview: title,
		properties: {},
		routePath,
		size: 0,
		tags: [],
		title,
		updatedAt: 0,
		...overrides
	};
}
