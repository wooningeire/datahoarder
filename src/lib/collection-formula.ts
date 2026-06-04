import {
	formatVaultValue,
	getVaultRecordValue,
	type VaultPropertyValue,
	type VaultRecord
} from './vault-index.js';
import type { CollectionField } from './collection-types.js';

type FormulaToken =
	| { type: 'number'; value: number }
	| { type: 'operator'; value: FormulaOperator };

type FormulaOperator = '+' | '-' | '*' | '/' | '(' | ')';

export function isComputedCollectionField(field: CollectionField) {
	const type = field.type.toLowerCase();

	return Boolean(field.formula || type === 'formula' || type === 'computed');
}

export function evaluateCollectionFormula(record: VaultRecord, formula: string): VaultPropertyValue {
	const expression = formula.trim();

	if (!expression) {
		return '';
	}

	if (expression.includes('{')) {
		return expression.replace(/\{([^{}]+)\}/gu, (_match, field: string) =>
			formatVaultValue(getVaultRecordValue(record, field.trim()))
		);
	}

	const numericValue = evaluateArithmeticFormula(record, expression);

	return numericValue === null ? '' : numericValue;
}

function evaluateArithmeticFormula(record: VaultRecord, expression: string) {
	const tokens = tokenizeArithmeticFormula(record, expression);

	if (!tokens.length) {
		return null;
	}

	let cursor = 0;

	function peek() {
		return tokens[cursor];
	}

	function consume() {
		return tokens[cursor++];
	}

	function parseExpression(): number | null {
		let value = parseTerm();

		while (value !== null) {
			const token = peek();

			if (token?.type !== 'operator' || (token.value !== '+' && token.value !== '-')) {
				break;
			}

			consume();
			const rightValue = parseTerm();

			if (rightValue === null) {
				return null;
			}

			value = token.value === '+' ? value + rightValue : value - rightValue;
		}

		return value;
	}

	function parseTerm(): number | null {
		let value = parseFactor();

		while (value !== null) {
			const token = peek();

			if (token?.type !== 'operator' || (token.value !== '*' && token.value !== '/')) {
				break;
			}

			consume();
			const rightValue = parseFactor();

			if (rightValue === null) {
				return null;
			}

			value = token.value === '*' ? value * rightValue : value / rightValue;
		}

		return value;
	}

	function parseFactor(): number | null {
		const token = consume();

		if (!token) {
			return null;
		}

		if (token.type === 'number') {
			return token.value;
		}

		if (token.value === '+') {
			return parseFactor();
		}

		if (token.value === '-') {
			const value = parseFactor();

			return value === null ? null : -value;
		}

		if (token.value === '(') {
			const value = parseExpression();
			const closingToken = consume();

			return closingToken?.type === 'operator' && closingToken.value === ')' ? value : null;
		}

		return null;
	}

	const value = parseExpression();

	if (value === null || cursor !== tokens.length || !Number.isFinite(value)) {
		return null;
	}

	return Number.isInteger(value) ? value : Number(value.toFixed(6));
}

function tokenizeArithmeticFormula(record: VaultRecord, expression: string): FormulaToken[] {
	const tokens: FormulaToken[] = [];
	let cursor = 0;

	while (cursor < expression.length) {
		const character = expression[cursor] ?? '';

		if (/\s/u.test(character)) {
			cursor += 1;
			continue;
		}

		if ('+-*/()'.includes(character)) {
			tokens.push({ type: 'operator', value: character as FormulaOperator });
			cursor += 1;
			continue;
		}

		const numberMatch = expression.slice(cursor).match(/^\d+(?:\.\d+)?/u);

		if (numberMatch) {
			tokens.push({ type: 'number', value: Number(numberMatch[0]) });
			cursor += numberMatch[0].length;
			continue;
		}

		const fieldMatch = expression.slice(cursor).match(/^[\p{L}_][\p{L}\p{N}_]*/u);

		if (fieldMatch) {
			const numberValue = getFormulaNumberValue(record, fieldMatch[0]);

			if (numberValue === null) {
				return [];
			}

			tokens.push({ type: 'number', value: numberValue });
			cursor += fieldMatch[0].length;
			continue;
		}

		return [];
	}

	return tokens;
}

function getFormulaNumberValue(record: VaultRecord, field: string) {
	const value = getVaultRecordValue(record, field);

	if (!hasValue(value)) {
		return null;
	}

	const values = getNumericValues(value);

	return values[0] ?? null;
}

function getNumericValues(value: VaultPropertyValue): number[] {
	if (Array.isArray(value)) {
		return value.flatMap(getNumericValues);
	}

	const numberValue = typeof value === 'number' ? value : Number(formatVaultValue(value));

	return Number.isFinite(numberValue) ? [numberValue] : [];
}

function hasValue(value: VaultPropertyValue): boolean {
	return (
		value !== null &&
		value !== undefined &&
		value !== '' &&
		(!Array.isArray(value) || value.length > 0) &&
		(typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 0)
	);
}
