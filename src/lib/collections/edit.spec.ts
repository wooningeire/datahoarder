import { describe, expect, it } from 'vitest';
import { addCollectionField } from './edit.js';
import { parseDatahoarderCollection } from './index.js';

describe('collection schema editing', () => {
	it('adds a schema field and appends it to inline view columns', () => {
		const content = [
			'name: Applications',
			'schema:',
			'  company: text',
			'  status: text',
			'source:',
			'  folders: [applications]',
			'views:',
			'  - type: table',
			'    name: Table',
			'    columns: [title, company, status]'
		].join('\n');
		const result = addCollectionField(content, {
			name: 'Priority',
			type: 'Enum'
		});
		const collection = parseDatahoarderCollection(result.content, 'Applications.dhbase.yaml');

		expect(result.field).toEqual({ formula: '', name: 'priority', options: [], type: 'enum' });
		expect(result.content).toContain('  priority: enum');
		expect(result.content).toContain('columns: [title, company, status, priority]');
		expect(collection.schema.map((field) => field.name)).toContain('priority');
		expect(collection.views[0]?.columns).toEqual(['title', 'company', 'status', 'priority']);
	});

	it('creates a schema block when one is missing', () => {
		const content = ['name: Tasks', 'source:', '  tags: [task]'].join('\n');
		const result = addCollectionField(content, {
			name: 'due date'
		});

		expect(result.content.split('\n').slice(0, 3)).toEqual([
			'name: Tasks',
			'schema:',
			'  due date: text'
		]);
	});

	it('appends fields to block-style view columns', () => {
		const content = [
			'name: Tasks',
			'schema:',
			'  status: text',
			'views:',
			'  - type: table',
			'    columns:',
			'      - title',
			'      - status'
		].join('\n');
		const result = addCollectionField(content, {
			name: 'owner',
			type: 'text'
		});

		expect(result.content).toContain(['    columns:', '      - title', '      - status', '      - owner'].join('\n'));
	});

	it('appends fields to the requested view columns', () => {
		const content = [
			'name: Tasks',
			'schema:',
			'  status: text',
			'views:',
			'  - type: table',
			'    name: Table',
			'    columns: [title, status]',
			'  - type: kanban',
			'    name: Pipeline',
			'    columns: [title, status]'
		].join('\n');
		const result = addCollectionField(content, {
			name: 'owner',
			type: 'text',
			viewIndex: 1
		});
		const collection = parseDatahoarderCollection(result.content, 'Tasks.dhbase.yaml');

		expect(collection.views[0].columns).toEqual(['title', 'status']);
		expect(collection.views[1].columns).toEqual(['title', 'status', 'owner']);
	});

	it('rejects duplicates built-ins and unsupported inline schema maps', () => {
		expect(() => addCollectionField('schema:\n  company: text', { name: 'Company' })).toThrow(
			'already includes'
		);
		expect(() => addCollectionField('schema:\n  company: text', { name: 'title' })).toThrow(
			'built-in'
		);
		expect(() => addCollectionField('schema: { company: text }', { name: 'status' })).toThrow(
			'indented block'
		);
	});
});
