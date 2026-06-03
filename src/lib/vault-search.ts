import type { VaultRecord } from './vault-index.js';
import {
	getDefaultVaultQueryFields,
	getVaultQueryClauseMatchLabels,
	matchVaultRecordQuery,
	normalizeVaultQueryText,
	parseVaultQuery,
	type VaultParsedQuery,
	type VaultQueryClause,
	type VaultQueryField
} from './vault-query.js';

export type VaultSearchResult = {
	matches: string[];
	record: VaultRecord;
	score: number;
};

export type VaultSearchOptions = {
	limit?: number;
};

const defaultSearchLimit = 20;

export function searchVaultRecords(
	records: VaultRecord[],
	query: string,
	options: VaultSearchOptions = {}
): VaultSearchResult[] {
	const parsedQuery = parseVaultQuery(query);

	if (!parsedQuery.clauses.length) {
		return [];
	}

	const results = records
		.map((record) => scoreRecord(record, parsedQuery))
		.filter((result): result is VaultSearchResult => Boolean(result))
		.sort(compareSearchResults);

	return results.slice(0, options.limit ?? defaultSearchLimit);
}

function scoreRecord(record: VaultRecord, query: VaultParsedQuery): VaultSearchResult | null {
	const fields = getDefaultVaultQueryFields(record);

	if (!matchVaultRecordQuery(record, query, { textFields: fields })) {
		return null;
	}

	let score = 0;
	const matches = new Set<string>();

	for (const clause of query.clauses) {
		const clauseScore = scoreClause(clause, fields);

		score += clauseScore;
		for (const label of getVaultQueryClauseMatchLabels(record, clause, { textFields: fields })) {
			matches.add(label);
		}
	}

	return {
		matches: [...matches],
		record,
		score
	};
}

function scoreClause(clause: VaultQueryClause, fields: VaultQueryField[]) {
	if (clause.excluded) {
		return 0;
	}

	if (clause.type === 'text') {
		const token = normalizeVaultQueryText(clause.value);

		return fields.reduce((score, field) => {
			if (!field.text.includes(token)) {
				return score;
			}

			return score + (field.text.startsWith(token) ? field.weight + 8 : field.weight);
		}, 0);
	}

	if (clause.type === 'tag') {
		return 60;
	}

	const normalizedField = clause.field.trim().toLowerCase();
	const field = fields.find((candidate) => candidate.key.toLowerCase() === normalizedField);

	return field?.weight ?? 35;
}

function compareSearchResults(resultA: VaultSearchResult, resultB: VaultSearchResult) {
	if (resultA.score !== resultB.score) {
		return resultB.score - resultA.score;
	}

	return resultA.record.title.localeCompare(resultB.record.title, undefined, {
		numeric: true,
		sensitivity: 'base'
	});
}
