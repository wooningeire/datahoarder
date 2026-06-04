import { describe, expect, it } from 'vitest';
import { getTemplateDisplayName, isNoteTemplatePath, renderNoteTemplate } from './template.js';

describe('note templates', () => {
	it('detects template files by folder or extension', () => {
		expect(isNoteTemplatePath('Templates/project.md')).toBe(true);
		expect(isNoteTemplatePath('Template/project.md')).toBe(true);
		expect(isNoteTemplatePath('Archive/Templates/project.yaml')).toBe(true);
		expect(isNoteTemplatePath('Templates\\project.md')).toBe(true);
		expect(isNoteTemplatePath('templates/project.svx')).toBe(true);
		expect(isNoteTemplatePath('Projects/status.template.md')).toBe(true);
		expect(isNoteTemplatePath('Projects/status.template.svx')).toBe(true);
		expect(isNoteTemplatePath('Projects/status.template.txt')).toBe(true);
		expect(isNoteTemplatePath('Projects/status.md')).toBe(false);
		expect(isNoteTemplatePath('Projects/MyTemplates/status.md')).toBe(false);
		expect(isNoteTemplatePath('Projects/status.template.yaml')).toBe(false);
		expect(getTemplateDisplayName('Templates/project.template.md')).toBe('project');
	});

	it('renders known placeholders and leaves unknown placeholders intact', () => {
		const rendered = renderNoteTemplate(
			[
				'# {{ title }}',
				'path:: {{path}}',
				'slug:: {{slug}}',
				'date:: {{date}}',
				'datetime:: {{datetime}}',
				'unknown:: {{missing}}'
			].join('\n'),
			{
				date: new Date(2026, 5, 2, 9, 7),
				path: 'Projects/Launch Map.md'
			}
		);

		expect(rendered.title).toBe('Launch Map');
		expect(rendered.slug).toBe('launch-map');
		expect(rendered.content).toContain('# Launch Map');
		expect(rendered.content).toContain('path:: Projects/Launch Map.md');
		expect(rendered.content).toContain('slug:: launch-map');
		expect(rendered.content).toContain('date:: 2026-06-02');
		expect(rendered.content).toContain('datetime:: 2026-06-02 09:07');
		expect(rendered.content).toContain('unknown:: {{missing}}');
	});

	it('supports explicit titles case-insensitive placeholders and accented slugs', () => {
		const rendered = renderNoteTemplate(
			['# {{TITLE}}', '{{ title }} / {{Title}}', 'slug:: {{SLUG}}', 'keep:: {{missing-value}}'].join('\n'),
			{
				date: new Date(2026, 5, 2, 9, 7),
				path: 'Projects/ignored.md',
				title: 'Café / Résumé'
			}
		);

		expect(rendered.title).toBe('Café / Résumé');
		expect(rendered.slug).toBe('cafe-resume');
		expect(rendered.content).toContain('# Café / Résumé');
		expect(rendered.content).toContain('Café / Résumé / Café / Résumé');
		expect(rendered.content).toContain('slug:: cafe-resume');
		expect(rendered.content).toContain('keep:: {{missing-value}}');
	});
});
