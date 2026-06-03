import { describe, expect, it } from 'vitest';
import {
	createExcalidrawNoteDraft,
	parseExcalidrawScene,
	renderExcalidrawNotePreview,
	renderExcalidrawSvg
} from './excalidraw-preview.js';

describe('Excalidraw previews', () => {
	it('creates a starter drawing note that can be parsed and rendered', () => {
		const draft = createExcalidrawNoteDraft('Launch Map');
		const scene = parseExcalidrawScene(draft.content);
		const preview = renderExcalidrawNotePreview(draft.content);

		expect(draft.title).toBe('Launch Map');
		expect(draft.content).toContain('excalidraw-plugin: parsed');
		expect(draft.content).toContain('tags: [drawing]');
		expect(draft.content).toContain('# Launch Map');
		expect(scene?.elements).toHaveLength(3);
		expect(preview).toContain('<rect');
		expect(preview).toContain('Launch Map');
		expect(preview).toContain('marker-end');
	});

	it('parses a fenced Excalidraw JSON scene and renders visible SVG elements', () => {
		const content = [
			'---',
			'excalidraw-plugin: parsed',
			'---',
			'# Canvas note',
			'',
			'## Drawing',
			'```json',
			JSON.stringify({
				type: 'excalidraw',
				elements: [
					{
						backgroundColor: '#dbeafe',
						height: 80,
						strokeColor: '#1d4ed8',
						type: 'rectangle',
						width: 120,
						x: 10,
						y: 20
					},
					{
						fontSize: 24,
						strokeColor: '#111827',
						text: 'Hello <canvas>',
						type: 'text',
						x: 24,
						y: 42
					},
					{
						points: [
							[0, 0],
							[80, 30]
						],
						strokeColor: '#be123c',
						type: 'arrow',
						x: 150,
						y: 80
					}
				]
			}),
			'```'
		].join('\n');
		const scene = parseExcalidrawScene(content);
		const html = renderExcalidrawNotePreview(content);

		expect(scene?.elements).toHaveLength(3);
		expect(html).toContain('<svg');
		expect(html).toContain('<rect');
		expect(html).toContain('<text');
		expect(html).toContain('Hello &lt;canvas&gt;');
		expect(html).toContain('marker-end');
		expect(html).toContain('<pre># Canvas note</pre>');
	});

	it('omits deleted elements and falls back for unreadable drawings', () => {
		expect(
			renderExcalidrawSvg({
				elements: [
					{
						height: 20,
						isDeleted: true,
						type: 'ellipse',
						width: 20,
						x: 0,
						y: 0
					}
				]
			})
		).toContain('no supported visible elements');
		expect(renderExcalidrawNotePreview('excalidraw-plugin: parsed\n\n## Drawing\nnot-json')).toContain(
			'not readable'
		);
	});

	it('supports alternate drawing headings and fence labels', () => {
		const content = [
			'excalidraw-plugin: parsed',
			'',
			'# Drawing',
			'```excalidraw',
			JSON.stringify({
				elements: [
					{
						height: 40,
						strokeColor: '#111827',
						type: 'ellipse',
						width: 60,
						x: 0,
						y: 0
					},
					{
						height: 100,
						type: 'frame',
						width: 100,
						x: 0,
						y: 0
					}
				]
			}),
			'```'
		].join('\r\n');
		const preview = renderExcalidrawNotePreview(content);

		expect(parseExcalidrawScene(content)?.elements).toHaveLength(2);
		expect(preview).toContain('<ellipse');
		expect(preview).not.toContain('<rect');
		expect(renderExcalidrawSvg({ elements: [{ type: 'frame', x: 0, y: 0, width: 10, height: 10 }] })).toContain(
			'no supported visible elements'
		);
	});
});
