import { describe, expect, it } from 'vitest';
import type { LocalVaultFile } from './local-vault.js';
import { buildLocalVaultIndex } from './vault-index.js';
import {
	createStandaloneHtmlDocument,
	renderCollectionKanbanHtml,
	renderCollectionSummariesHtml,
	renderCollectionTableHtml,
	renderCollectionTimelineHtml,
	renderSourceHtml
} from './html-export.js';

describe('HTML exports', () => {
	it('wraps escaped titles and source paths in a standalone document', () => {
		const html = createStandaloneHtmlDocument({
			bodyHtml: '<p>Safe body</p>',
			sourcePath: 'notes/<script>.md',
			title: 'A&B "Note"'
		});

		expect(html).toContain('<!doctype html>');
		expect(html).toContain('<title>A&amp;B &quot;Note&quot;</title>');
		expect(html).toContain('<h1>A&amp;B &quot;Note&quot;</h1>');
		expect(html).toContain('<span>notes/&lt;script&gt;.md</span>');
		expect(html).toContain('<article><p>Safe body</p></article>');
	});

	it('escapes source and collection table output', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile(
				'applications/acme.md',
				[
					'# Acme <Labs>',
					'company:: Acme & Co',
					'note:: Needs "portfolio" follow-up'
				].join('\n')
			)
		]);
		const tableHtml = renderCollectionTableHtml(index.records, ['title', 'company', 'note']);

		expect(tableHtml).toContain('<th>Title</th>');
		expect(tableHtml).toContain('<td>Acme &lt;Labs&gt;</td>');
		expect(tableHtml).toContain('<td>Acme &amp; Co</td>');
		expect(tableHtml).toContain('<td>Needs &quot;portfolio&quot; follow-up</td>');
		expect(renderSourceHtml('<script>alert("x")</script>')).toBe(
			'<pre>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</pre>'
		);
	});

	it('escapes collection kanban groups cards and fields', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile(
				'applications/acme.md',
				['# Acme <Labs>', 'company:: Acme & Co', 'status:: Applied <now>'].join('\n')
			)
		]);
		const kanbanHtml = renderCollectionKanbanHtml(index.records, ['title', 'company', 'status'], {
			columns: ['title', 'company', 'status'],
			dateField: '',
			filter: '',
			groupBy: 'status',
			name: 'Pipeline',
			sortColumn: '',
			sortDirection: 'asc',
			type: 'kanban'
		});

		expect(kanbanHtml).toContain('class="kanban-board"');
		expect(kanbanHtml).toContain('Applied &lt;now&gt;');
		expect(kanbanHtml).toContain('Acme &lt;Labs&gt;');
		expect(kanbanHtml).toContain('Acme &amp; Co');
		expect(kanbanHtml).not.toContain('Acme <Labs>');
	});

	it('escapes collection summary output', () => {
		const summariesHtml = renderCollectionSummariesHtml([
			{
				items: [
					{ label: 'Applied <now>', value: '2' },
					{ label: 'Interview', value: '1' }
				],
				label: 'By Status & Stage',
				type: 'countBy',
				value: 'Applied <now>: 2, Interview: 1'
			}
		]);

		expect(summariesHtml).toContain('class="collection-summary-grid"');
		expect(summariesHtml).toContain('By Status &amp; Stage');
		expect(summariesHtml).toContain('Applied &lt;now&gt;');
		expect(summariesHtml).not.toContain('Applied <now>');
	});

	it('escapes and sorts collection timeline items', async () => {
		const index = await buildLocalVaultIndex([
			createLocalVaultFile(
				'work/beta.md',
				['# Beta <Work>', 'worked:: 2026-01-02', 'stage:: Needs & polish'].join('\n')
			),
			createLocalVaultFile(
				'work/alpha.md',
				['# Alpha', 'worked:: 2026-01-01', 'stage:: Draft <now>'].join('\n')
			)
		]);
		const timelineHtml = renderCollectionTimelineHtml(index.records, ['title', 'worked', 'stage'], {
			columns: ['title', 'worked', 'stage'],
			dateField: 'worked',
			filter: '',
			groupBy: '',
			name: 'Work Log',
			sortColumn: '',
			sortDirection: 'asc',
			type: 'timeline'
		});

		expect(timelineHtml).toContain('class="timeline-list"');
		expect(timelineHtml.indexOf('Alpha')).toBeLessThan(timelineHtml.indexOf('Beta &lt;Work&gt;'));
		expect(timelineHtml).toContain('2026-01-01');
		expect(timelineHtml).toContain('Beta &lt;Work&gt;');
		expect(timelineHtml).toContain('Needs &amp; polish');
		expect(timelineHtml).toContain('Draft &lt;now&gt;');
		expect(timelineHtml).not.toContain('Beta <Work>');
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
