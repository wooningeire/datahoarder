export type ToggleMarkdownTaskOptions = {
	checked: boolean;
	taskIndex: number;
};

const taskLinePattern = /^(\s*[-*]\s+\[)([ xX])(\]\s+.*)$/u;

export function toggleMarkdownTask(content: string, options: ToggleMarkdownTaskOptions) {
	if (!Number.isInteger(options.taskIndex) || options.taskIndex < 0) {
		throw new Error('Task index must be a non-negative integer.');
	}

	const newline = content.includes('\r\n') ? '\r\n' : '\n';
	const lines = content.split(/\r?\n/u);
	const nextLines = [...lines];
	const nextMarker = options.checked ? 'x' : ' ';
	let taskIndex = 0;
	let fenceMarker = '';
	let inFrontmatter = lines[0]?.trim() === '---';

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';

		if (inFrontmatter) {
			if (index > 0 && line.trim() === '---') {
				inFrontmatter = false;
			}

			continue;
		}

		const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);

		if (fenceMarker) {
			if (fenceMatch && fenceMatch[1][0] === fenceMarker[0] && fenceMatch[1].length >= fenceMarker.length) {
				fenceMarker = '';
			}

			continue;
		}

		if (fenceMatch) {
			fenceMarker = fenceMatch[1];
			continue;
		}

		const taskMatch = line.match(taskLinePattern);

		if (!taskMatch) {
			continue;
		}

		if (taskIndex === options.taskIndex) {
			nextLines[index] = `${taskMatch[1]}${nextMarker}${taskMatch[3]}`;
			return nextLines.join(newline);
		}

		taskIndex += 1;
	}

	throw new Error(`Task ${options.taskIndex + 1} was not found.`);
}
