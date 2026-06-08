import {
	formatVaultValue,
	getVaultRecordValue,
	type VaultPropertyValue,
	type VaultRecord
} from './index.js';

export type VaultQueryClause =
	| {
			excluded: boolean;
			type: 'tag';
			value: string;
	  }
	| {
			excluded: boolean;
			field: string;
			operator: 'equals' | 'exists' | 'includes';
			type: 'field';
			value: string;
	  }
	| {
			excluded: boolean;
			type: 'text';
			value: string;
	  };

export type VaultParsedQuery = {
	clauses: VaultQueryClause[];
};

export type VaultQueryField = {
	key: string;
	label: string;
	text: string;
	weight: number;
};

export type VaultQueryMatchOptions = {
	textFields?: VaultQueryField[];
};

export function parseVaultQuery(query: string): VaultParsedQuery {
	return {
		clauses: tokenizeVaultQuery(query).map(parseVaultQueryToken).filter((clause): clause is VaultQueryClause =>
			Boolean(clause)
		)
	};
}

export function matchVaultRecordQuery(
	record: VaultRecord,
	query: string | VaultParsedQuery,
	options: VaultQueryMatchOptions = {}
) {
	const parsedQuery = typeof query === 'string' ? parseVaultQuery(query) : query;

	if (!parsedQuery.clauses.length) {
		return true;
	}

	const textFields = options.textFields ?? getDefaultVaultQueryFields(record);

	return parsedQuery.clauses.every((clause) => {
		const matches = matchesVaultQueryClause(record, clause, textFields);

		return clause.excluded ? !matches : matches;
	});
}

export function getVaultQueryClauseMatchLabels(
	record: VaultRecord,
	clause: VaultQueryClause,
	options: VaultQueryMatchOptions = {}
) {
	if (clause.excluded) {
		return [];
	}

	const textFields = options.textFields ?? getDefaultVaultQueryFields(record);

	if (clause.type === 'text') {
		const normalizedValue = normalizeVaultQueryText(clause.value);

		return textFields.filter((field) => field.text.includes(normalizedValue)).map((field) => field.label);
	}

	if (!matchesVaultQueryClause(record, clause, textFields)) {
		return [];
	}

	return [clause.type === 'tag' ? 'tag' : normalizeVaultQueryFieldName(clause.field)];
}

export function getDefaultVaultQueryFields(record: VaultRecord): VaultQueryField[] {
	const propertyText = Object.entries(record.properties)
		.map(([key, value]) => `${key} ${formatVaultValue(value)}`)
		.join(' ');

	return [
		createQueryField('title', 'title', record.title, 80),
		createQueryField('basename', 'file', record.basename, 70),
		createQueryField('tags', 'tag', record.tags.join(' '), 60),
		createQueryField('path', 'path', record.path, 45),
		createQueryField('property', 'property', propertyText, 35),
		createQueryField('preview', 'preview', record.preview, 20),
		createQueryField('body', 'body', record.content, 10)
	].filter((field) => field.text);
}

export function getCollectionVaultQueryFields(record: VaultRecord, columns: string[]): VaultQueryField[] {
	const fieldNames = uniqueQueryFields(['title', 'path', ...columns]);

	return fieldNames
		.map((fieldName) =>
			createQueryField(
				normalizeVaultQueryFieldName(fieldName),
				fieldName,
				formatVaultValue(getVaultRecordValue(record, fieldName)),
				getCollectionQueryFieldWeight(fieldName)
			)
		)
		.filter((field) => field.text);
}

export function normalizeVaultQueryText(text: string) {
	return text.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').trim();
}

function matchesVaultQueryClause(record: VaultRecord, clause: VaultQueryClause, textFields: VaultQueryField[]) {
	if (clause.type === 'text') {
		const normalizedValue = normalizeVaultQueryText(clause.value);

		return Boolean(normalizedValue) && textFields.some((field) => field.text.includes(normalizedValue));
	}

	if (clause.type === 'tag') {
		return valueIncludes(record.tags, clause.value);
	}

	const value = getVaultRecordValue(record, normalizeVaultQueryFieldName(clause.field));

	if (clause.operator === 'exists') {
		return hasQueryValue(value);
	}

	if (clause.operator === 'equals') {
		return valueEquals(value, clause.value);
	}

	return valueIncludes(value, clause.value);
}

function parseVaultQueryToken(rawToken: string): VaultQueryClause | null {
	let token = rawToken.trim();
	let excluded = false;

	if ((token.startsWith('-') || token.startsWith('!')) && token.length > 1) {
		excluded = true;
		token = token.slice(1);
	}

	token = token.trim();

	if (!token) {
		return null;
	}

	if (token.startsWith('#') && token.length > 1) {
		return {
			excluded,
			type: 'tag',
			value: unquoteQueryValue(token.slice(1))
		};
	}

	const operator = getQueryOperator(token);
	const operatorIndex = operator.index;

	if (operatorIndex > 0) {
		const field = unquoteQueryValue(token.slice(0, operatorIndex));
		const value = unquoteQueryValue(token.slice(operatorIndex + operator.text.length));
		const excludedByOperator = operator.text.startsWith('!');
		const queryOperator = operator.text.endsWith('=') ? 'equals' : 'includes';

		if (isStructuredQueryField(field) && value) {
			if (['tag', 'tags'].includes(field.toLowerCase())) {
				return {
					excluded: excluded || excludedByOperator,
					type: 'tag',
					value
				};
			}

			return {
				excluded: excluded || excludedByOperator,
				field,
				operator: value === '*' ? 'exists' : queryOperator,
				type: 'field',
				value
			};
		}
	}

	return {
		excluded,
		type: 'text',
		value: unquoteQueryValue(token)
	};
}

function tokenizeVaultQuery(query: string) {
	const tokens: string[] = [];
	let cursor = 0;

	while (cursor < query.length) {
		while (cursor < query.length && /\s/u.test(query[cursor] ?? '')) {
			cursor += 1;
		}

		if (cursor >= query.length) {
			break;
		}

		const tokenStart = cursor;
		let quote = '';

		while (cursor < query.length) {
			const character = query[cursor] ?? '';

			if (quote) {
				if (character === '\\') {
					cursor += 2;
					continue;
				}

				if (character === quote) {
					quote = '';
				}

				cursor += 1;
				continue;
			}

			if (character === '"' || character === "'") {
				quote = character;
				cursor += 1;
				continue;
			}

			if (/\s/u.test(character)) {
				break;
			}

			cursor += 1;
		}

		tokens.push(query.slice(tokenStart, cursor));
	}

	return tokens;
}

function getQueryOperator(token: string) {
	const operators = ['!=', '!:', ':', '=']
		.map((operator) => ({ index: token.indexOf(operator), text: operator }))
		.filter((operator) => operator.index >= 0)
		.sort((operatorA, operatorB) => operatorA.index - operatorB.index || operatorB.text.length - operatorA.text.length);

	return operators[0] ?? { index: -1, text: '' };
}

function isStructuredQueryField(field: string) {
	return /^[A-Za-z_][A-Za-z0-9_ ./-]*$/u.test(field);
}

function unquoteQueryValue(value: string) {
	const trimmedValue = value.trim();
	const first = trimmedValue[0];
	const last = trimmedValue.at(-1);

	if ((first === '"' || first === "'") && first === last) {
		return trimmedValue.slice(1, -1).replace(/\\(["'\\])/gu, '$1').trim();
	}

	return trimmedValue;
}

function createQueryField(key: string, label: string, value: string, weight: number): VaultQueryField {
	return {
		key,
		label,
		text: normalizeVaultQueryText(value),
		weight
	};
}

function uniqueQueryFields(fields: string[]) {
	const seen = new Set<string>();
	const uniqueFields: string[] = [];

	for (const field of fields) {
		const normalizedField = normalizeVaultQueryFieldName(field);

		if (!normalizedField || seen.has(normalizedField)) {
			continue;
		}

		seen.add(normalizedField);
		uniqueFields.push(field);
	}

	return uniqueFields;
}

function normalizeVaultQueryFieldName(field: string) {
	const trimmedField = field.trim();
	const normalizedField = trimmedField.toLowerCase();

	if (normalizedField.startsWith('note.')) {
		return trimmedField.slice(5);
	}

	switch (normalizedField) {
		case 'file':
			return 'basename';
		case 'name':
			return 'title';
		case 'tag':
			return 'tags';
		case 'file.name':
			return 'basename';
		case 'file.path':
			return 'path';
		case 'file.folder':
			return 'folder';
		case 'file.size':
			return 'size';
		case 'file.ctime':
		case 'file.mtime':
			return 'updatedAt';
		default:
			return trimmedField;
	}
}

function getCollectionQueryFieldWeight(field: string) {
	const normalizedField = normalizeVaultQueryFieldName(field).toLowerCase();

	if (normalizedField === 'title') {
		return 80;
	}

	if (normalizedField === 'path') {
		return 45;
	}

	return 35;
}

function hasQueryValue(value: VaultPropertyValue): boolean {
	return (
		value !== null &&
		value !== undefined &&
		value !== '' &&
		(!Array.isArray(value) || value.length > 0) &&
		(typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 0)
	);
}

function valueEquals(value: VaultPropertyValue, expected: string): boolean {
	if (Array.isArray(value)) {
		return value.some((item) => valueEquals(item, expected));
	}

	return normalizeVaultQueryText(formatVaultValue(value)) === normalizeVaultQueryText(expected);
}

function valueIncludes(value: VaultPropertyValue, expected: string): boolean {
	if (Array.isArray(value)) {
		return value.some((item) => valueIncludes(item, expected));
	}

	return normalizeVaultQueryText(formatVaultValue(value)).includes(normalizeVaultQueryText(expected));
}
