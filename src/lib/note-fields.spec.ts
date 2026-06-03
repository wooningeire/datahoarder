import { describe, expect, it } from 'vitest';
import { hasInlineField, setInlineField } from './note-fields.js';

describe('setInlineField', () => {
	it('updates an existing field outside fenced code and removes duplicates', () => {
		const content = [
			'# Application',
			'',
			'status:: Applied',
			'```',
			'status:: Do not touch',
			'```',
			'Status:: Old duplicate',
			''
		].join('\n');
		const nextContent = setInlineField(content, { key: 'STATUS', value: 'Interview' });

		expect(nextContent).toContain('status:: Interview');
		expect(nextContent).toContain('status:: Do not touch');
		expect(nextContent).not.toContain('Old duplicate');
	});

	it('inserts a missing field after frontmatter and first heading', () => {
		const content = ['---', 'title: Launch', '---', '# Launch', '', 'Body'].join('\n');
		const nextContent = setInlineField(content, { key: 'stage', value: 'Research' });

		expect(nextContent).toBe(['---', 'title: Launch', '---', '# Launch', '', 'stage:: Research', '', 'Body'].join('\n'));
	});

	it('normalizes multiline values and rejects invalid field names', () => {
		expect(setInlineField('# Note', { key: 'next step', value: 'Email\nfollow up' })).toContain(
			'next step:: Email follow up'
		);
		expect(() => setInlineField('# Note', { key: '1bad', value: 'x' })).toThrow('Field names must start');
	});

	it('detects inline fields outside frontmatter and fenced code', () => {
		const content = [
			'---',
			'status: Frontmatter',
			'---',
			'# Application',
			'',
			'```',
			'company:: Hidden',
			'```',
			'Company:: Acme Labs'
		].join('\n');

		expect(hasInlineField(content, 'company')).toBe(true);
		expect(hasInlineField(content, 'status')).toBe(false);
	});
});
