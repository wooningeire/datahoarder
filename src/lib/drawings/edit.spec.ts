import { describe, expect, it } from 'vitest';
import { addDrawingElement, addExcalidrawElement, normalizeExcalidrawElementKind } from './edit.js';
import {
	createExcalidrawNoteDraft,
	createWhiteboardNoteDraft,
	parseExcalidrawScene,
	parseWhiteboardNoteState,
	renderExcalidrawNotePreview,
	renderWhiteboardNotePreview
} from './preview.js';

describe('Drawing editing', () => {
	it('appends a labeled shape to a whiteboard SVX note', () => {
		const draft = createWhiteboardNoteDraft('Launch Map');
		const result = addDrawingElement(draft.content, {
			kind: 'rectangle',
			text: 'Decision point'
		});
		const state = parseWhiteboardNoteState(result.content);
		const preview = renderWhiteboardNotePreview(result.content);

		expect(result.kind).toBe('rectangle');
		expect(result.elements).toHaveLength(1);
		expect(result.elements[0]).toMatchObject({
			kind: 'shape',
			shape: 'rectangle',
			label: 'Decision point',
			width: 210,
			height: 110
		});
		expect(state?.items).toHaveLength(4);
		expect(preview).toContain('Decision point');
		expect(result.content).toContain('let items = $state<WhiteboardItem[]>');
	});

	it('appends a labeled shape to an existing drawing scene', () => {
		const draft = createExcalidrawNoteDraft('Launch Map');
		const result = addExcalidrawElement(draft.content, {
			kind: 'rectangle',
			text: 'Decision point'
		});
		const scene = parseExcalidrawScene(result.content);
		const preview = renderExcalidrawNotePreview(result.content);

		expect(result.kind).toBe('rectangle');
		expect(result.elements).toHaveLength(2);
		expect(result.elements[0]).toMatchObject({
			type: 'rectangle',
			backgroundColor: '#fef3c7',
			width: 210,
			height: 110
		});
		expect(result.elements[1]).toMatchObject({
			type: 'text',
			text: 'Decision point'
		});
		expect(scene?.elements).toHaveLength(5);
		expect(preview).toContain('Decision point');
		expect(result.content).toContain('"source": "datahoarder"');
	});

	it('appends arrows and defaults blank text elements safely', () => {
		const draft = createExcalidrawNoteDraft('Flow');
		const arrowResult = addExcalidrawElement(draft.content, {
			kind: 'arrow',
			text: 'Next'
		});
		const textResult = addExcalidrawElement(draft.content, {
			kind: 'text',
			text: ''
		});

		expect(arrowResult.elements.map((element) => element.type)).toEqual(['arrow', 'text']);
		expect(arrowResult.content).toContain('"points": [');
		expect(arrowResult.content).toContain('"Next"');
		expect(textResult.elements).toHaveLength(1);
		expect(textResult.elements[0]).toMatchObject({
			type: 'text',
			text: 'New text'
		});
	});

	it('validates element kinds and unreadable drawing data', () => {
		expect(normalizeExcalidrawElementKind(undefined)).toBe('text');
		expect(normalizeExcalidrawElementKind(' Ellipse ')).toBe('ellipse');
		expect(() => normalizeExcalidrawElementKind('frame')).toThrow('Element type');
		expect(() => addExcalidrawElement('# Not a drawing', { kind: 'text', text: 'Nope' })).toThrow(
			'Drawing JSON was not readable.'
		);
	});
});
