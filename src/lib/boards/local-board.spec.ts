import { describe, expect, it } from 'vitest';
import {
	getDatahoarderBoardLinks,
	getDatahoarderBoardPreview,
	isDatahoarderBoardFile,
	parseDatahoarderBoard,
	renderDatahoarderBoard
} from './local-board.js';

describe('local board files', () => {
	it('parses JSON board files into code-operable nodes and links', () => {
		const board = parseDatahoarderBoard(
			JSON.stringify({
				title: 'Launch Board',
				public: true,
				tags: ['visual', '#planning'],
				nodes: [
					{
						color: 'green',
						id: 'idea',
						note: 'Ideas/Launch.md',
						text: 'Sketch the launch flow.',
						title: 'Idea',
						x: 40,
						y: 50
					},
					{
						id: 'ship',
						text: 'Ship it.',
						title: 'Ship',
						x: 320,
						y: 140
					}
				],
				edges: [{ from: 'idea', label: 'next', to: 'ship' }]
			}),
			'Boards/Launch.dhboard.json'
		);

		expect(isDatahoarderBoardFile('Boards/Launch.dhboard.json')).toBe(true);
		expect(board.title).toBe('Launch Board');
		expect(board.properties.public).toBe(true);
		expect(board.tags).toEqual(['planning', 'visual']);
		expect(board.nodes.map((node) => [node.id, node.title, node.note])).toEqual([
			['idea', 'Idea', 'Ideas/Launch.md'],
			['ship', 'Ship', '']
		]);
		expect(board.edges).toEqual([{ from: 'idea', label: 'next', to: 'ship' }]);
		expect(getDatahoarderBoardPreview(board)).toContain('Sketch the launch flow.');
		expect(getDatahoarderBoardLinks(board)).toEqual([
			{
				label: 'Idea',
				target: 'Ideas/Launch.md',
				type: 'board'
			}
		]);
	});

	it('renders escaped board HTML with safe note links', () => {
		const html = renderDatahoarderBoard(
			[
				'title: Board <Unsafe>',
				'nodes:',
				'  - id: idea',
				'    title: Idea <One>',
				'    text: Use <script>care</script>',
				'    note: Ideas/Launch.md#Plan',
				'    color: blue',
				'  - id: done',
				'    title: Done',
				'    x: 280',
				'    y: 120',
				'edges:',
				'  - from: idea',
				'    to: done',
				'    label: next <step>'
			].join('\n'),
			{
				path: 'Boards/Launch.dhboard.yaml',
				resolveNoteHref: (notePath, heading) => `/notes/${notePath}${heading ? `#${heading}` : ''}`
			}
		);

		expect(html).toContain('class="datahoarder-board"');
		expect(html).toContain('Board &lt;Unsafe&gt;');
		expect(html).toContain('Idea &lt;One&gt;');
		expect(html).toContain('Use &lt;script&gt;care&lt;/script&gt;');
		expect(html).toContain('href="/notes/Ideas/Launch.md#Plan"');
		expect(html).toContain('data-note-path="Ideas/Launch.md"');
		expect(html).toContain('data-note-heading="Plan"');
		expect(html).toContain('next &lt;step&gt;');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('Idea <One>');
	});
});
