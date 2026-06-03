import { describe, expect, it } from 'vitest';
import { renderPortableMarkdown } from './markdown-render.js';

describe('renderPortableMarkdown', () => {
	it('escapes raw HTML and keeps safe markdown links', () => {
		const html = renderPortableMarkdown(
			[
				'# Safe <script>alert("x")</script>',
				'[Website](https://example.test/path?q=1)',
				'[Email](mailto:test@example.test)'
			].join('\n')
		);

		expect(html).toContain('Safe &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
		expect(html).toContain('<a href="https://example.test/path?q=1">Website</a>');
		expect(html).toContain('<a href="mailto:test@example.test">Email</a>');
	});

	it('drops unsafe markdown link and image URLs', () => {
		const html = renderPortableMarkdown(
			[
				'[Run script](javascript:alert(1))',
				'![Pixel](javascript:alert(1))',
				'[Relative](../notes/today.md)'
			].join('\n')
		);

		expect(html).toContain('Run script');
		expect(html).toContain('Pixel');
		expect(html).toContain('<a href="../notes/today.md">Relative</a>');
		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('<img');
	});

	it('renders markdown task lists as disabled checkboxes', () => {
		const html = renderPortableMarkdown(
			[
				'- [ ] Call <client>',
				'- [x] Ship **draft**',
				'- [X] Archive [note](tasks.md)',
				'- regular item'
			].join('\n')
		);

		expect(html).toContain('<li class="task-list-item"><input type="checkbox" disabled> <span>Call &lt;client&gt;</span></li>');
		expect(html).toContain('<li class="task-list-item"><input type="checkbox" disabled checked> <span>Ship <strong>draft</strong></span></li>');
		expect(html).toContain('<li class="task-list-item"><input type="checkbox" disabled checked> <span>Archive <a href="tasks.md">note</a></span></li>');
		expect(html).toContain('<li>regular item</li>');
		expect(html).not.toContain('Call <client>');
	});

	it('can render top-level task lists as interactive without enabling embedded tasks', () => {
		const html = renderPortableMarkdown('- [ ] Top task\n\n![[Reusable Tasks]]', {
			interactiveTaskLists: true,
			notePaths: ['Reusable Tasks'],
			resolveEmbedContent: () => '- [ ] Embedded task'
		});

		expect(html).toContain('<input type="checkbox" data-task-index="0"> <span>Top task</span>');
		expect(html).toContain('<input type="checkbox" disabled> <span>Embedded task</span>');
		expect(html).not.toContain('data-task-index="1"');
	});

	it('renders escaped markdown tables with inline formatting', () => {
		const html = renderPortableMarkdown(
			[
				'| Company | Status | Count |',
				'| --- | :---: | ---: |',
				'| Acme <Labs> | **Open** | 3 |',
				'| Escaped \\| pipe | [Site](https://example.test) | `A|B` |',
				'',
				'Plain | pipe'
			].join('\n')
		);

		expect(html).toContain('class="markdown-table-wrapper"');
		expect(html).toContain('<table class="markdown-table">');
		expect(html).toContain('<th data-align="center">Status</th>');
		expect(html).toContain('<th data-align="right">Count</th>');
		expect(html).toContain('Acme &lt;Labs&gt;');
		expect(html).toContain('<strong>Open</strong>');
		expect(html).toContain('Escaped | pipe');
		expect(html).toContain('<a href="https://example.test">Site</a>');
		expect(html).toContain('<code>A|B</code>');
		expect(html).toContain('<p>Plain | pipe</p>');
		expect(html).not.toContain('Acme <Labs>');
	});

	it('renders standalone Obsidian embeds with aliases and heading sections', () => {
		const html = renderPortableMarkdown('Before\n\n![[Reusable Note#Summary|Shared block]]\n\nAfter', {
			currentPath: 'Parent',
			notePaths: ['Reusable Note'],
			resolveEmbedContent: () =>
				[
					'---',
					'title: Internal',
					'---',
					'# Reusable Note',
					'',
					'## Summary',
					'Use **this** block with <safe text>.',
					'',
					'## Later',
					'Do not include this.'
				].join('\n'),
			resolveNoteHref: (notePath, heading) => `/${notePath}${heading ? `#${heading}` : ''}`
		});

		expect(html).toContain('<p>Before</p>');
		expect(html).toContain('class="note-embed"');
		expect(html).toContain('<a href="/Reusable Note#Summary" data-note-path="Reusable Note" data-note-heading="Summary">Shared block</a>');
		expect(html).toContain('Use <strong>this</strong> block with &lt;safe text&gt;.');
		expect(html).toContain('<p>After</p>');
		expect(html).not.toContain('title: Internal');
		expect(html).not.toContain('Do not include this.');
	});

	it('renders parameterized reusable note embeds safely', () => {
		const html = renderPortableMarkdown(
			'![[Components/Application Card#Card|Application Card|company=Acme <Labs>|status=Interview|detail=Use **portfolio** link]]',
			{
				currentPath: 'Dashboard',
				notePaths: ['Components/Application Card'],
				resolveEmbedContent: () =>
					[
						'# Application Card',
						'',
						'## Card',
						'### {{embed.company}}',
						'status:: {{STATUS}}',
						'detail:: {{detail}}',
						'missing:: {{missing}}'
					].join('\n'),
				resolveNoteHref: (notePath, heading) => `/${notePath}${heading ? `#${heading}` : ''}`
			}
		);

		expect(html).toContain('class="note-embed"');
		expect(html).toContain('Application Card</a>');
		expect(html).toContain('<h3>Acme &lt;Labs&gt;</h3>');
		expect(html).toContain('status:: Interview');
		expect(html).toContain('detail:: Use **portfolio** link');
		expect(html).toContain('missing:: {{missing}}');
		expect(html).not.toContain('Acme <Labs>');
	});

	it('supports parameterized embeds without aliases', () => {
		const html = renderPortableMarkdown('![[Reusable Card|title=Launch Map]]', {
			notePaths: ['Reusable Card'],
			resolveEmbedContent: () => '# {{title}}'
		});

		expect(html).toContain('data-note-path="Reusable Card">Reusable Card</a>');
		expect(html).toContain('<h1>Launch Map</h1>');
	});

	it('treats embed parameters as literal text and does not use them in unsafe URLs', () => {
		const html = renderPortableMarkdown(
			'![[Reusable Card|name=<script>alert("x")</script>|url=javascript:alert(1)|target=Private Note|value=a=b]]',
			{
				notePaths: ['Reusable Card', 'Private Note'],
				resolveEmbedContent: (notePath) =>
					notePath === 'Reusable Card'
						? [
							'# {{name}}',
							'[Unsafe]({{url}})',
							'![[{{target}}]]',
							'value:: {{value}}'
						].join('\n')
						: null,
				resolveNoteHref: (notePath) => `/notes/${notePath}`
			}
		);

		expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
		expect(html).toContain('Unsafe');
		expect(html).toContain('value:: a=b');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('Private Note');
		expect(html).not.toContain('/notes/Private');
	});

	it('ignores parameters on inline embeds', () => {
		const html = renderPortableMarkdown('Use ![[Reusable Card|title=Launch Map]] inline.', {
			notePaths: ['Reusable Card'],
			resolveEmbedContent: () => '# {{title}}',
			resolveNoteHref: (notePath) => `/notes/${notePath}`
		});

		expect(html).toContain('Use <a href="/notes/Reusable Card" data-note-path="Reusable Card">Reusable Card</a> inline.');
		expect(html).not.toContain('Launch Map');
	});

	it('keeps embeds inside fences as code and renders inline embeds as links', () => {
		const html = renderPortableMarkdown(
			['```', '![[Reusable Note]]', '```', '', 'Use ![[Reusable Note]] inline.'].join('\n'),
			{
				notePaths: ['Reusable Note'],
				resolveEmbedContent: () => '# Reusable Note\n\nEmbedded body.',
				resolveNoteHref: (notePath) => `/notes/${notePath}`
			}
		);

		expect(html).toContain('<pre><code>![[Reusable Note]]</code></pre>');
		expect(html).toContain('Use <a href="/notes/Reusable Note" data-note-path="Reusable Note">Reusable Note</a> inline.');
		expect(html).not.toContain('Embedded body.');
	});

	it('renders escaped Sankey diagrams from datahoarder fences', () => {
		const html = renderPortableMarkdown(
			[
				'# Application Flow',
				'',
				'```datahoarder-sankey',
				'Applied -> Interview: 12',
				'Interview -> Offer <signed>: 3',
				'Applied -> Rejected: 4',
				'Applied -> Broken: 0',
				'',
				'Ignored line',
				'```'
			].join('\n')
		);

		expect(html).toContain('class="datahoarder-sankey"');
		expect(html).toContain('class="datahoarder-sankey-svg"');
		expect(html).toContain('Applied');
		expect(html).toContain('Interview');
		expect(html).toContain('Offer &lt;signed&gt;');
		expect(html).toContain('3 flows across 4 nodes, total 19.');
		expect(html).not.toContain('Offer <signed>');
		expect(html).not.toContain('Broken');
		expect(html).not.toContain('Ignored line');
		expect(html).not.toContain('NaN');
		expect(html).not.toContain('<pre><code>Applied');
	});

	it('renders escaped metric grids from datahoarder fences', () => {
		const html = renderPortableMarkdown(
			[
				'# Application Metrics',
				'',
				'```datahoarder-metrics',
				'Applications | 42 | This week <fast> | good',
				'Response rate: 18% | warning',
				'SLO: p95 | 120ms | warning',
				'Median reply | 3 days | Waiting on **portfolio** note | info',
				'Ignored line',
				'```'
			].join('\n')
		);

		expect(html).toContain('class="datahoarder-metrics"');
		expect(html).toContain('class="datahoarder-metric datahoarder-metric-good"');
		expect(html).toContain('Applications');
		expect(html).toContain('42');
		expect(html).toContain('This week &lt;fast&gt;');
		expect(html).toContain('class="datahoarder-metric datahoarder-metric-warning"');
		expect(html).toContain('Response rate');
		expect(html).toContain('18%');
		expect(html).toContain('SLO: p95');
		expect(html).toContain('120ms');
		expect(html).toContain('Waiting on **portfolio** note');
		expect(html).not.toContain('This week <fast>');
		expect(html).not.toContain('Ignored line');
		expect(html).not.toContain('<pre><code>Applications');
	});

	it('uses a non-leaking placeholder for missing and recursive embeds', () => {
		const missingHtml = renderPortableMarkdown('![[Private Note]]', {
			notePaths: ['Private Note'],
			resolveEmbedContent: () => null
		});
		const recursiveHtml = renderPortableMarkdown('![[Loop]]', {
			currentPath: 'Loop',
			maxEmbedDepth: 2,
			notePaths: ['Loop'],
			resolveEmbedContent: () => '# Loop\n\n![[Loop]]'
		});

		expect(missingHtml).toContain('Embedded note unavailable.');
		expect(missingHtml).not.toContain('Private Note');
		expect(recursiveHtml).toContain('Embed skipped to avoid a recursive loop.');
		expect(recursiveHtml.length).toBeLessThan(1200);
	});
});
