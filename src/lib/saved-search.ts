import { readLocalFile, type LocalVaultFile } from './local-vault.js';
import { parseSimpleYaml, type SimpleYamlValue } from './simple-yaml.js';

export type SavedVaultSearch = {
	name: string;
	path: string;
	query: string;
};

export type SavedVaultSearchDraft = {
	name: string;
	query: string;
};

const savedSearchPathPattern = /\.dhsearch\.(?:json|ya?ml)$/iu;
const savedSearchFolder = 'Saved Searches';

export function isSavedVaultSearchFile(path: string) {
	return savedSearchPathPattern.test(path);
}

export async function readSavedVaultSearches(files: LocalVaultFile[]) {
	const parsedSearches = await Promise.all(
		files.filter((file) => isSavedVaultSearchFile(file.path)).map(readSavedVaultSearch)
	);

	return parsedSearches
		.filter((search): search is SavedVaultSearch => Boolean(search))
		.sort(compareSavedVaultSearches);
}

export function parseSavedVaultSearch(content: string, path: string): SavedVaultSearch | null {
	const data = parseSavedVaultSearchData(content, path);

	if (!data || Array.isArray(data) || typeof data !== 'object') {
		return null;
	}

	const name = toTextValue(data.name) || getDefaultSavedSearchName(path);
	const query = toTextValue(data.query ?? data.q ?? data.search);

	if (!query) {
		return null;
	}

	return {
		name,
		path,
		query
	};
}

export function createSavedVaultSearchContent(draft: SavedVaultSearchDraft) {
	return `${JSON.stringify(
		{
			name: draft.name.trim(),
			query: draft.query.trim()
		},
		null,
		2
	)}\n`;
}

export function getSavedVaultSearchPath(name: string, existingPaths: string[] = []) {
	const slug = slugifySavedSearchName(name);
	const existingPathSet = new Set(existingPaths.map((path) => path.toLocaleLowerCase()));
	let candidate = `${savedSearchFolder}/${slug}.dhsearch.json`;
	let suffix = 2;

	while (existingPathSet.has(candidate.toLocaleLowerCase())) {
		candidate = `${savedSearchFolder}/${slug}-${suffix}.dhsearch.json`;
		suffix += 1;
	}

	return candidate;
}

async function readSavedVaultSearch(file: LocalVaultFile) {
	try {
		return parseSavedVaultSearch(await readLocalFile(file), file.path);
	} catch {
		return null;
	}
}

function parseSavedVaultSearchData(content: string, path: string): SimpleYamlValue | null {
	if (/\.json$/iu.test(path)) {
		try {
			return JSON.parse(content) as SimpleYamlValue;
		} catch {
			return null;
		}
	}

	return parseSimpleYaml(content);
}

function toTextValue(value: SimpleYamlValue | undefined) {
	if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
		return '';
	}

	return String(value).trim();
}

function getDefaultSavedSearchName(path: string) {
	const fileName = path.split('/').at(-1) ?? path;
	const withoutExtension = fileName.replace(savedSearchPathPattern, '');
	const title = withoutExtension
		.replace(/[-_]+/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim()
		.replace(/\b\w/gu, (character) => character.toUpperCase());

	return title || 'Saved Search';
}

function slugifySavedSearchName(name: string) {
	const slug = name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');

	return slug || 'saved-search';
}

function compareSavedVaultSearches(searchA: SavedVaultSearch, searchB: SavedVaultSearch) {
	const nameOrder = searchA.name.localeCompare(searchB.name, undefined, {
		numeric: true,
		sensitivity: 'base'
	});

	if (nameOrder !== 0) {
		return nameOrder;
	}

	return searchA.path.localeCompare(searchB.path, undefined, {
		numeric: true,
		sensitivity: 'base'
	});
}
