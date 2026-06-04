export type SimpleYamlValue =
	| SimpleYamlPrimitive
	| SimpleYamlValue[]
	| { [key: string]: SimpleYamlValue };

export type SimpleYamlPrimitive = boolean | null | number | string;

type ParsedLine = {
	indent: number;
	text: string;
};

export function parseSimpleYaml(content: string) {
	const lines = content
		.split(/\r?\n/u)
		.map((line) => ({ indent: getIndent(line), text: stripComment(line.trim()) }))
		.filter((line) => line.text);

	if (!lines.length) {
		return {};
	}

	const [value] = parseBlock(lines, 0, lines[0].indent);

	return isRecord(value) ? value : {};
}

function parseBlock(lines: ParsedLine[], index: number, indent: number): [SimpleYamlValue, number] {
	const line = lines[index];

	if (!line || line.indent < indent) {
		return [{}, index];
	}

	if (line.indent === indent && line.text.startsWith('- ')) {
		return parseList(lines, index, indent);
	}

	return parseMap(lines, index, indent);
}

function parseMap(lines: ParsedLine[], index: number, indent: number): [Record<string, SimpleYamlValue>, number] {
	const map: Record<string, SimpleYamlValue> = {};
	let cursor = index;

	while (cursor < lines.length) {
		const line = lines[cursor];

		if (!line || line.indent < indent) {
			break;
		}

		if (line.indent > indent) {
			cursor += 1;
			continue;
		}

		if (line.text.startsWith('- ')) {
			break;
		}

		const keyValue = parseKeyValue(line.text);

		if (!keyValue) {
			cursor += 1;
			continue;
		}

		const [key, rawValue] = keyValue;

		if (rawValue) {
			map[key] = parseScalar(rawValue);
			cursor += 1;
			continue;
		}

		const nextLine = lines[cursor + 1];

		if (!nextLine || nextLine.indent <= indent) {
			map[key] = {};
			cursor += 1;
			continue;
		}

		const [value, nextCursor] = parseBlock(lines, cursor + 1, nextLine.indent);
		map[key] = value;
		cursor = nextCursor;
	}

	return [map, cursor];
}

function parseList(lines: ParsedLine[], index: number, indent: number): [SimpleYamlValue[], number] {
	const list: SimpleYamlValue[] = [];
	let cursor = index;

	while (cursor < lines.length) {
		const line = lines[cursor];

		if (!line || line.indent < indent) {
			break;
		}

		if (line.indent > indent) {
			cursor += 1;
			continue;
		}

		if (!line.text.startsWith('- ')) {
			break;
		}

		const itemText = line.text.slice(2).trim();

		if (!itemText) {
			const nextLine = lines[cursor + 1];

			if (!nextLine || nextLine.indent <= indent) {
				list.push(null);
				cursor += 1;
				continue;
			}

			const [value, nextCursor] = parseBlock(lines, cursor + 1, nextLine.indent);
			list.push(value);
			cursor = nextCursor;
			continue;
		}

		const keyValue = parseKeyValue(itemText);

		if (keyValue) {
			const [key, rawValue] = keyValue;
			const item: Record<string, SimpleYamlValue> = {};

			item[key] = rawValue ? parseScalar(rawValue) : {};
			cursor += 1;

			const nextLine = lines[cursor];

			if (nextLine && nextLine.indent > indent) {
				const [nestedValue, nextCursor] = parseMap(lines, cursor, nextLine.indent);

				if (isRecord(nestedValue)) {
					Object.assign(item, nestedValue);
				}

				cursor = nextCursor;
			}

			list.push(item);
			continue;
		}

		list.push(parseScalar(itemText));
		cursor += 1;
	}

	return [list, cursor];
}

function parseKeyValue(text: string): [string, string] | null {
	const match = text.match(/^([^:[\]{}#,][^:]*):(?:\s*(.*))?$/u);

	if (!match) {
		return null;
	}

	return [cleanKey(match[1]), match[2]?.trim() ?? ''];
}

function parseScalar(value: string): SimpleYamlValue {
	const trimmed = value.trim();

	if (!trimmed) {
		return '';
	}

	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		const inner = trimmed.slice(1, -1).trim();

		return inner ? splitInlineList(inner).map(parseScalar) : [];
	}

	if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
		const inner = trimmed.slice(1, -1).trim();
		const record: Record<string, SimpleYamlValue> = {};

		for (const part of splitInlineList(inner)) {
			const keyValue = parseKeyValue(part);

			if (keyValue) {
				record[keyValue[0]] = parseScalar(keyValue[1]);
			}
		}

		return record;
	}

	if (/^(?:true|false)$/iu.test(trimmed)) {
		return trimmed.toLowerCase() === 'true';
	}

	if (/^(?:null|~)$/iu.test(trimmed)) {
		return null;
	}

	if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) {
		return Number(trimmed);
	}

	return unquote(trimmed);
}

function splitInlineList(value: string) {
	const parts: string[] = [];
	let current = '';
	let quote: '"' | "'" | null = null;
	let depth = 0;

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

		if (character === '[' || character === '{') {
			depth += 1;
		} else if (character === ']' || character === '}') {
			depth = Math.max(0, depth - 1);
		}

		if (character === ',' && depth === 0) {
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

function cleanKey(key: string) {
	return unquote(key.trim());
}

function unquote(value: string) {
	const quote = value[0];

	if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
		return value.slice(1, -1);
	}

	return value;
}

function stripComment(text: string) {
	let quote: '"' | "'" | null = null;

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];

		if (quote) {
			if (character === quote) {
				quote = null;
			}

			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}

		if (character === '#' && (index === 0 || /\s/u.test(text[index - 1]))) {
			return text.slice(0, index).trimEnd();
		}
	}

	return text;
}

function getIndent(line: string) {
	return line.match(/^\s*/u)?.[0].replace(/\t/gu, '  ').length ?? 0;
}

function isRecord(value: SimpleYamlValue): value is Record<string, SimpleYamlValue> {
	return Boolean(value) && !Array.isArray(value) && typeof value === 'object';
}
