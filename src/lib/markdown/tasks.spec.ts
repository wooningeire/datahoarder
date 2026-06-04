import { describe, expect, it } from 'vitest';
import { toggleMarkdownTask } from './tasks.js';

describe('toggleMarkdownTask', () => {
	it('toggles the requested task outside frontmatter and fenced code', () => {
		const content = [
			'---',
			'- [ ] YAML-looking frontmatter task',
			'---',
			'# Tasks',
			'',
			'- [ ] First task',
			'```',
			'- [ ] Code task',
			'```',
			'- [x] Second task'
		].join('\n');

		const nextContent = toggleMarkdownTask(content, {
			checked: false,
			taskIndex: 1
		});

		expect(nextContent).toContain('- [ ] YAML-looking frontmatter task');
		expect(nextContent).toContain('- [ ] Code task');
		expect(nextContent).toContain('- [ ] Second task');
		expect(nextContent).toContain('- [ ] First task');
	});

	it('preserves CRLF line endings while checking tasks', () => {
		const nextContent = toggleMarkdownTask('# Tasks\r\n\r\n- [ ] Follow up\r\n', {
			checked: true,
			taskIndex: 0
		});

		expect(nextContent).toBe('# Tasks\r\n\r\n- [x] Follow up\r\n');
	});

	it('rejects missing or invalid task indexes', () => {
		expect(() => toggleMarkdownTask('- [ ] Task', { checked: true, taskIndex: -1 })).toThrow(
			'Task index must be a non-negative integer.'
		);
		expect(() => toggleMarkdownTask('- [ ] Task', { checked: true, taskIndex: 1 })).toThrow(
			'Task 2 was not found.'
		);
	});
});
