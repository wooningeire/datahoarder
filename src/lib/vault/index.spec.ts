import { describe, expect, it } from 'vitest';
import type { LocalVaultFile } from './local-files.js';
import { buildLocalVaultIndex, getVaultBacklinks, getVaultRecordValue } from './index.js';

describe('buildLocalVaultIndex', () => {
	it('extracts inline body properties and lets frontmatter win', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile(
				'applications/acme.md',
				[
					'---',
					'company: Frontmatter Co',
					'rating: 5',
					'---',
					'# Acme Application',
					'Company:: Inline Co',
					'status:: Applied',
					'status:: Interview',
					'remote:: true',
					'tags:: [jobs, ai]',
					'url:: https://example.test/a::b',
					'empty::'
				].join('\n')
			)
		]);

		const record = index.records[0];

		expect(getVaultRecordValue(record, 'company')).toBe('Frontmatter Co');
		expect(getVaultRecordValue(record, 'Company')).toBe('Frontmatter Co');
		expect(getVaultRecordValue(record, 'rating')).toBe(5);
		expect(getVaultRecordValue(record, 'status')).toEqual(['Applied', 'Interview']);
		expect(getVaultRecordValue(record, 'remote')).toBe(true);
		expect(getVaultRecordValue(record, 'tags')).toEqual(['ai', 'jobs']);
		expect(getVaultRecordValue(record, 'url')).toBe('https://example.test/a::b');
		expect(getVaultRecordValue(record, 'empty')).toBe('');
	});

	it('ignores inline fields inside fenced code blocks', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile(
				'applications/fenced.md',
				['# Fenced', '```', 'status:: Ignored', '```', 'status:: Applied'].join('\n')
			)
		]);

		expect(getVaultRecordValue(index.records[0], 'status')).toBe('Applied');
	});

	it('resolves backlinks from Obsidian and relative markdown links', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile('projects/target.md', '# Target\n\nDestination note.'),
			createLocalVaultFile(
				'projects/parent.md',
				[
					'# Parent',
					'See [[Target]] and [[projects/target|Project target]].',
					'[Sibling](target.md#details)'
				].join('\n')
			),
			createLocalVaultFile('archive/source.md', '# Source\n\n[Relative](../projects/target.md).'),
			createLocalVaultFile('unsafe.md', '# Unsafe\n\n[Run](javascript:projects/target.md)\n[Escape](../target.md)'),
			createLocalVaultFile('other.md', '# Other\n\n[[Missing]]')
		]);
		const target = index.recordsByPath.get('projects/target.md');

		expect(target).toBeTruthy();
		expect(index.backlinksByPath.get('projects/target.md')?.map((backlink) => backlink.record.path)).toEqual([
			'projects/parent.md',
			'archive/source.md'
		]);
		expect(getVaultBacklinks(index, target!).map((backlink) => [backlink.record.path, backlink.links.map((link) => link.label)])).toEqual([
			['projects/parent.md', ['Target', 'Project target', 'Sibling']],
			['archive/source.md', ['Relative']]
		]);
	});

	it('indexes datahoarder board files with properties and note links', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile('notes/target.md', '# Target\n\nDestination note.'),
			createLocalVaultFile(
				'boards/launch.dhboard.json',
				JSON.stringify({
					title: 'Launch Board',
					public: true,
					tags: ['visual'],
					nodes: [
						{
							id: 'target',
							note: '../notes/target.md',
							text: 'Follow this note.',
							title: 'Target Card'
						}
					]
				})
			)
		]);
		const board = index.recordsByPath.get('boards/launch.dhboard.json');
		const target = index.recordsByPath.get('notes/target.md');

		expect(board).toMatchObject({
			basename: 'launch',
			extension: '.json',
			path: 'boards/launch.dhboard.json',
			preview: 'Target Card Follow this note.',
			routePath: 'boards/launch.dhboard.json',
			tags: ['visual'],
			title: 'Launch Board'
		});
		expect(getVaultRecordValue(board!, 'public')).toBe(true);
		expect(board?.links).toEqual([
			{
				label: 'Target Card',
				target: '../notes/target.md',
				type: 'board'
			}
		]);
		expect(getVaultBacklinks(index, target!).map((backlink) => backlink.record.path)).toEqual([
			'boards/launch.dhboard.json'
		]);
	});

	it('reuses unchanged records from a previous index without reading those files again', async () => {
		const initialIndex = await buildLocalVaultIndex([
			createLocalVaultFile('alpha.md', '# Alpha\n\nstatus:: Old'),
			createLocalVaultFile('beta.md', '# Beta\n\nstatus:: Old')
		]);
		const initialAlpha = initialIndex.recordsByPath.get('alpha.md');
		let alphaReads = 0;
		let betaReads = 0;
		const nextIndex = await buildLocalVaultIndex(
			[
				createLocalVaultFile('alpha.md', '# Alpha\n\nstatus:: Old', {
					onRead: () => {
						alphaReads += 1;
					}
				}),
				createLocalVaultFile('beta.md', '# Beta\n\nstatus:: New', {
					onRead: () => {
						betaReads += 1;
					},
					updatedAt: 1
				})
			],
			{ previousIndex: initialIndex }
		);

		expect(alphaReads).toBe(0);
		expect(betaReads).toBe(1);
		expect(nextIndex.recordsByPath.get('alpha.md')).toBe(initialAlpha);
		expect(getVaultRecordValue(nextIndex.recordsByPath.get('beta.md')!, 'status')).toBe('New');
		expect(nextIndex.records.map((record) => record.path)).toEqual(['alpha.md', 'beta.md']);
	});

	it('limits concurrent markdown file reads while building the index', async () => {
		let activeReads = 0;
		let maxActiveReads = 0;
		const files = Array.from({ length: 8 }, (_item, index) =>
			createLocalVaultFile(`note-${index}.md`, `# Note ${index}`, {
				onRead: async () => {
					activeReads += 1;
					maxActiveReads = Math.max(maxActiveReads, activeReads);
					await delay(5);
					activeReads -= 1;
				}
			})
		);

		const index = await buildLocalVaultIndex(files, { concurrency: 2 });

		expect(index.records).toHaveLength(8);
		expect(maxActiveReads).toBeLessThanOrEqual(2);
	});

	it('rereads explicitly changed paths even when file metadata has not changed', async () => {
		const initialIndex = await buildLocalVaultIndex([createLocalVaultFile('same.md', '# Old')]);
		const initialRecord = initialIndex.recordsByPath.get('same.md');
		let reads = 0;
		const nextIndex = await buildLocalVaultIndex(
			[
				createLocalVaultFile('same.md', '# New', {
					onRead: () => {
						reads += 1;
					}
				})
			],
			{
				changedPaths: ['same.md'],
				previousIndex: initialIndex
			}
		);

		expect(reads).toBe(1);
		expect(nextIndex.recordsByPath.get('same.md')).not.toBe(initialRecord);
		expect(nextIndex.recordsByPath.get('same.md')?.title).toBe('New');
	});

	it('does not reuse records after a path changes', async () => {
		const initialIndex = await buildLocalVaultIndex([
			createLocalVaultFile('old/place.md', '# Same Title', {
				size: 12,
				updatedAt: 7
			})
		]);
		let reads = 0;
		const nextIndex = await buildLocalVaultIndex(
			[
				createLocalVaultFile('new/place.md', '# Same Title', {
					onRead: () => {
						reads += 1;
					},
					size: 12,
					updatedAt: 7
				})
			],
			{ previousIndex: initialIndex }
		);
		const movedRecord = nextIndex.recordsByPath.get('new/place.md');

		expect(reads).toBe(1);
		expect(nextIndex.recordsByPath.has('old/place.md')).toBe(false);
		expect(movedRecord).toMatchObject({
			folder: 'new',
			path: 'new/place.md',
			routePath: 'new/place'
		});
	});
});

function createLocalVaultFile(
	path: string,
	content: string,
	options: { onRead?: () => Promise<void> | void; size?: number; updatedAt?: number } = {}
): LocalVaultFile {
	const name = path.split('/').at(-1) ?? path;
	const extensionMatch = name.match(/(\.[^.]+)$/u);
	const extension = extensionMatch?.[1]?.toLowerCase() ?? '';

	return {
		extension,
		handle: {
			kind: 'file',
			name,
			getFile: async () => {
				await options.onRead?.();

				return {
					size: content.length,
					lastModified: 0,
					text: async () => content
				} as File;
			}
		},
		path,
		routePath: path.replace(/\.(md|svx)$/iu, ''),
		size: options.size ?? content.length,
		updatedAt: options.updatedAt ?? 0
	};
}

function delay(duration: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, duration);
	});
}
