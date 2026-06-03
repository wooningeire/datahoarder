import { parseDatahoarderCollection, type CollectionField } from './collection.js';
import { normalizeInlineFieldKey } from './note-fields.js';

export type AddCollectionFieldOptions = {
	name: string;
	type?: string;
	viewIndex?: number;
};

export type AddCollectionFieldResult = {
	content: string;
	field: CollectionField;
};

const builtInCollectionFields = ['basename', 'folder', 'path', 'preview', 'tags', 'title', 'updatedat'];

export function addCollectionField(
	content: string,
	options: AddCollectionFieldOptions
): AddCollectionFieldResult {
	const field: CollectionField = {
		formula: '',
		name: normalizeInlineFieldKey(options.name),
		options: [],
		type: normalizeCollectionFieldType(options.type)
	};
	const collection = parseDatahoarderCollection(content);

	if (builtInCollectionFields.includes(field.name.toLowerCase())) {
		throw new Error(`"${field.name}" is a built-in collection field.`);
	}

	if (collection.schema.some((schemaField) => schemaField.name.toLowerCase() === field.name.toLowerCase())) {
		throw new Error(`Collection schema already includes "${field.name}".`);
	}

	let nextContent = insertSchemaField(content, field);
	nextContent = appendFieldToViewColumns(nextContent, field.name, options.viewIndex);

	return {
		content: nextContent,
		field
	};
}

function normalizeCollectionFieldType(type: string | undefined) {
	const normalizedType = (type?.trim() || 'text').toLowerCase();

	if (!/^[a-z][a-z0-9_-]*$/u.test(normalizedType)) {
		throw new Error('Field type must start with a letter and contain only letters, numbers, hyphens, or underscores.');
	}

	return normalizedType;
}

function insertSchemaField(content: string, field: CollectionField) {
	const lines = splitLines(content);
	const schemaRange = getTopLevelRange(lines, 'schema');
	const fieldLine = `  ${field.name}: ${field.type}`;

	if (!schemaRange) {
		const insertionIndex = getMissingSchemaInsertionIndex(lines);
		const nextLines = [...lines];

		nextLines.splice(insertionIndex, 0, 'schema:', fieldLine);
		return joinLines(nextLines);
	}

	const schemaLineValue = getLineValue(lines[schemaRange.start]);

	if (schemaLineValue) {
		throw new Error('Collection schema must use an indented block before fields can be added.');
	}

	const nextLines = [...lines];
	nextLines.splice(schemaRange.end, 0, fieldLine);

	return joinLines(nextLines);
}

function appendFieldToViewColumns(content: string, fieldName: string, viewIndex = 0) {
	const lines = splitLines(content);
	const viewsRange = getTopLevelRange(lines, 'views');

	if (!viewsRange) {
		return content;
	}

	const viewRange = getViewListItemRange(lines, viewsRange.start + 1, viewsRange.end, viewIndex);

	if (!viewRange) {
		return content;
	}

	const columnsLineIndex = findNestedKeyLine(lines, viewRange.start, viewRange.end, 'columns');

	if (columnsLineIndex < 0) {
		return content;
	}

	const columnsValue = getLineValue(lines[columnsLineIndex]);

	if (columnsValue.startsWith('[') && columnsValue.endsWith(']')) {
		const columns = splitInlineList(columnsValue.slice(1, -1)).map((column) => column.trim()).filter(Boolean);

		if (columns.some((column) => column.toLowerCase() === fieldName.toLowerCase())) {
			return content;
		}

		const nextLines = [...lines];
		nextLines[columnsLineIndex] = `${lines[columnsLineIndex].slice(0, lines[columnsLineIndex].indexOf(':') + 1)} [${[
			...columns,
			fieldName
		].join(', ')}]`;
		return joinLines(nextLines);
	}

	if (columnsValue) {
		throw new Error('Collection view columns must use an inline list or indented list before fields can be added.');
	}

	const columnsIndent = getIndent(lines[columnsLineIndex]);
	const listItemIndent = columnsIndent + 2;
	const columnListRange = getIndentedBlockRange(lines, columnsLineIndex + 1, viewRange.end, columnsIndent);
	const existingColumns = lines
		.slice(columnListRange.start, columnListRange.end)
		.map((line) => line.match(/^\s*-\s+(.+)$/u)?.[1]?.trim() ?? '')
		.filter(Boolean);

	if (existingColumns.some((column) => column.toLowerCase() === fieldName.toLowerCase())) {
		return content;
	}

	const nextLines = [...lines];
	nextLines.splice(columnListRange.end, 0, `${' '.repeat(listItemIndent)}- ${fieldName}`);

	return joinLines(nextLines);
}

function getViewListItemRange(lines: string[], start: number, end: number, viewIndex: number) {
	const ranges = getListItemRanges(lines, start, end);
	const normalizedViewIndex = Number.isInteger(viewIndex) && viewIndex >= 0 ? viewIndex : 0;

	return ranges[normalizedViewIndex] ?? ranges[0] ?? null;
}

function getMissingSchemaInsertionIndex(lines: string[]) {
	const nameRange = getTopLevelRange(lines, 'name');

	return nameRange?.end ?? 0;
}

function getTopLevelRange(lines: string[], key: string) {
	const normalizedKey = key.toLowerCase();
	const start = lines.findIndex((line) => {
		const keyValue = getKeyValue(line);

		return keyValue && getIndent(line) === 0 && keyValue.key.toLowerCase() === normalizedKey;
	});

	if (start < 0) {
		return null;
	}

	let end = lines.length;

	for (let index = start + 1; index < lines.length; index += 1) {
		if (lines[index].trim() && getIndent(lines[index]) === 0) {
			end = index;
			break;
		}
	}

	return { start, end };
}

function getListItemRanges(lines: string[], start: number, end: number) {
	const ranges: Array<{ start: number; end: number }> = [];
	let searchStart = start;

	while (searchStart < end) {
		const range = getNextListItemRange(lines, searchStart, end);

		if (!range) {
			break;
		}

		ranges.push(range);
		searchStart = range.end;
	}

	return ranges;
}

function getNextListItemRange(lines: string[], start: number, end: number) {
	const itemStart = lines.findIndex((line, index) => {
		return index >= start && index < end && /^\s*-\s+/u.test(line);
	});

	if (itemStart < start || itemStart >= end) {
		return null;
	}

	const itemIndent = getIndent(lines[itemStart]);
	let itemEnd = end;

	for (let index = itemStart + 1; index < end; index += 1) {
		if (getIndent(lines[index]) === itemIndent && /^\s*-\s+/u.test(lines[index])) {
			itemEnd = index;
			break;
		}
	}

	return { start: itemStart, end: itemEnd };
}

function findNestedKeyLine(lines: string[], start: number, end: number, key: string) {
	const normalizedKey = key.toLowerCase();

	for (let index = start; index < end; index += 1) {
		const keyValue = getKeyValue(lines[index].replace(/^\s*-\s+/u, ''));

		if (keyValue && keyValue.key.toLowerCase() === normalizedKey) {
			return index;
		}
	}

	return -1;
}

function getIndentedBlockRange(lines: string[], start: number, end: number, parentIndent: number) {
	let blockEnd = start;

	while (blockEnd < end && (!lines[blockEnd].trim() || getIndent(lines[blockEnd]) > parentIndent)) {
		blockEnd += 1;
	}

	return {
		start,
		end: blockEnd
	};
}

function getLineValue(line: string) {
	return getKeyValue(line)?.value ?? '';
}

function getKeyValue(line: string) {
	const match = line.trim().match(/^([^:[\]{}#,][^:]*):(?:\s*(.*))?$/u);

	if (!match) {
		return null;
	}

	return {
		key: match[1].trim(),
		value: match[2]?.trim() ?? ''
	};
}

function splitInlineList(value: string) {
	const parts: string[] = [];
	let current = '';
	let quote: '"' | "'" | null = null;

	for (const character of value) {
		if (quote) {
			current += character;

			if (character === quote) {
				quote = null;
			}

			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			current += character;
			continue;
		}

		if (character === ',') {
			parts.push(current.trim());
			current = '';
			continue;
		}

		current += character;
	}

	if (current.trim()) {
		parts.push(current.trim());
	}

	return parts;
}

function splitLines(content: string) {
	return content.split(/\r?\n/u);
}

function joinLines(lines: string[]) {
	return lines.join('\n');
}

function getIndent(line: string) {
	return line.match(/^\s*/u)?.[0].replace(/\t/gu, '  ').length ?? 0;
}
