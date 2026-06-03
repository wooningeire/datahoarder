export type InlineFieldUpdate = {
	key: string;
	value: string;
};

const inlineFieldPattern = /^(\s*)([\p{L}_][\p{L}\p{N}_ ./-]*?)::\s*(.*)$/u;
const fieldKeyPattern = /^[\p{L}_][\p{L}\p{N}_ ./-]*$/u;

export function setInlineField(content: string, update: InlineFieldUpdate) {
	const key = normalizeInlineFieldKey(update.key);
	const value = normalizeInlineFieldValue(update.value);
	const { body, frontmatter } = splitFrontmatter(content);
	const lines = body.split(/\r?\n/u);
	const nextLines: string[] = [];
	let fenceMarker = '';
	let updated = false;

	for (const line of lines) {
		const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);

		if (fenceMarker) {
			if (fenceMatch && fenceMatch[1][0] === fenceMarker[0] && fenceMatch[1].length >= fenceMarker.length) {
				fenceMarker = '';
			}

			nextLines.push(line);
			continue;
		}

		if (fenceMatch) {
			fenceMarker = fenceMatch[1];
			nextLines.push(line);
			continue;
		}

		const fieldMatch = line.match(inlineFieldPattern);

		if (!fieldMatch || normalizeInlineFieldKey(fieldMatch[2]) !== key) {
			nextLines.push(line);
			continue;
		}

		if (!updated) {
			nextLines.push(`${fieldMatch[1]}${fieldMatch[2].trim()}:: ${value}`);
			updated = true;
		}
	}

	const nextBody = updated ? nextLines.join('\n') : insertInlineField(nextLines, key, value);

	return `${frontmatter}${nextBody}`;
}

export function hasInlineField(content: string, key: string) {
	const normalizedKey = normalizeInlineFieldKey(key);
	const { body } = splitFrontmatter(content);
	const lines = body.split(/\r?\n/u);
	let fenceMarker = '';

	for (const line of lines) {
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

		const fieldMatch = line.match(inlineFieldPattern);

		if (fieldMatch && normalizeInlineFieldKey(fieldMatch[2]) === normalizedKey) {
			return true;
		}
	}

	return false;
}

export function normalizeInlineFieldKey(key: string) {
	const normalizedKey = key.trim().replace(/\s+/gu, ' ');

	if (!fieldKeyPattern.test(normalizedKey)) {
		throw new Error('Field names must start with a letter or underscore and contain only letters, numbers, spaces, dots, slashes, hyphens, or underscores.');
	}

	return normalizedKey.toLocaleLowerCase();
}

function normalizeInlineFieldValue(value: string) {
	return value.replace(/\r?\n/gu, ' ').trim();
}

function splitFrontmatter(content: string) {
	const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u);

	if (!match) {
		return {
			body: content,
			frontmatter: ''
		};
	}

	return {
		body: content.slice(match[0].length),
		frontmatter: match[0]
	};
}

function insertInlineField(lines: string[], key: string, value: string) {
	const insertionIndex = getInlineFieldInsertionIndex(lines);
	const displayKey = key;
	const fieldLine = `${displayKey}:: ${value}`;
	const nextLines = [...lines];

	if (insertionIndex > 0 && nextLines[insertionIndex - 1]?.trim()) {
		nextLines.splice(insertionIndex, 0, '');
		nextLines.splice(insertionIndex + 1, 0, fieldLine);
	} else {
		nextLines.splice(insertionIndex, 0, fieldLine);
	}

	if (nextLines[insertionIndex + 1]?.trim()) {
		nextLines.splice(insertionIndex + 1, 0, '');
	}

	return nextLines.join('\n').replace(/^\n+/u, '');
}

function getInlineFieldInsertionIndex(lines: string[]) {
	if (lines[0]?.match(/^#\s+/u)) {
		return lines[1]?.trim() ? 1 : 2;
	}

	return 0;
}
