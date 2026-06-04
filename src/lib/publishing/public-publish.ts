import { createStandaloneHtmlDocument, escapeHtml } from './html-export.js';
import { readLocalFile, type LocalVaultFile } from '../vault/local-files.js';
import { getDirectoryPath } from '../vault/paths.js';
import { parseSimpleYaml, type SimpleYamlValue } from '../shared/simple-yaml.js';
import {
	formatVaultValue,
	getVaultRecordValue,
	type VaultPropertyValue,
	type VaultRecord
} from '../vault/index.js';
import { matchVaultRecordQuery } from '../vault/query.js';

export type PublicPublishMatchRule =
	| VaultPropertyValue
	| PublicPublishMatchRuleObject;

export type PublicPublishMatchRuleObject = {
	equals?: VaultPropertyValue;
	exists?: boolean;
	includes?: VaultPropertyValue;
};

export type PublicPublishSource = {
	files: string[];
	folders: string[];
	match: Record<string, PublicPublishMatchRule>;
	query: string;
	tags: string[];
};

export type PublicPublishProfile = {
	name: string;
	outputDirectory: string;
	path: string;
	requirePublic: boolean;
	source: PublicPublishSource;
	subtitle: string;
};

export type PublicPublishEntry = {
	outputPath: string;
	preview: string;
	routePath: string;
	sourcePath: string;
	title: string;
	updatedAt: number;
};

export type PublicPublishFile = {
	content: string;
	path: string;
};

export type PublicPublishBundle = {
	entries: PublicPublishEntry[];
	files: PublicPublishFile[];
	outputDirectory: string;
};

export type PublicPublishOptions = {
	outputDirectory?: string;
	profile?: PublicPublishProfile | null;
	subtitle?: string;
};

export type RenderPublicRecordHtml = (
	record: VaultRecord,
	entry: PublicPublishEntry,
	entries: PublicPublishEntry[]
) => string;

const publicPropertyNames = ['public', 'published', 'publish', 'share'];
const publishProfileFilePattern = /\.dhpublish\.(?:json|ya?ml)$/iu;

export function isPublicPublishProfileFile(path: string) {
	return publishProfileFilePattern.test(path);
}

export async function readPublicPublishProfiles(files: LocalVaultFile[]) {
	const profiles = await Promise.all(
		files.filter((file) => isPublicPublishProfileFile(file.path)).map(readPublicPublishProfile)
	);

	return profiles
		.filter((profile): profile is PublicPublishProfile => Boolean(profile))
		.sort(comparePublicPublishProfiles);
}

export function parsePublicPublishProfile(content: string, path: string): PublicPublishProfile | null {
	const root = asRecord(parsePublicPublishProfileData(content, path));

	if (!Object.keys(root).length) {
		return null;
	}

	const source = parsePublicPublishSource(root.source ?? root);
	const rootQuery = toStringValue(root.query ?? root.filter ?? root.search);

	if (rootQuery && !source.query) {
		source.query = rootQuery;
	}

	const outputDirectory = toStringValue(
		root.outputDirectory ?? root.output_directory ?? root.outputDir ?? root.output_dir ?? root.output
	);

	return {
		name: toStringValue(root.name) || getPublicPublishProfileName(path),
		outputDirectory: outputDirectory || `public/${slugifyPathSegment(getPublicPublishProfileName(path))}`,
		path,
		requirePublic: toBooleanValue(root.requirePublic ?? root.require_public ?? root.publicOnly ?? root.public_only),
		source,
		subtitle: toStringValue(root.subtitle)
	};
}

export function getPublicVaultRecords(records: VaultRecord[]) {
	return records.filter(isPublicVaultRecord);
}

export function getPublicPublishRecords(records: VaultRecord[], profile: PublicPublishProfile | null = null) {
	if (!profile) {
		return getPublicVaultRecords(records);
	}

	const matchingRecords = hasExplicitPublicPublishSource(profile.source)
		? records.filter((record) => matchesPublicPublishSource(record, profile.source, profile.path))
		: getPublicVaultRecords(records);

	return profile.requirePublic ? matchingRecords.filter(isPublicVaultRecord) : matchingRecords;
}

export function isPublicVaultRecord(record: VaultRecord) {
	const explicitPublicValue = getExplicitPublicValue(record);

	if (explicitPublicValue !== undefined) {
		return isTruthyPublicValue(explicitPublicValue);
	}

	return record.tags.some((tag) => ['public', 'published'].includes(tag.toLowerCase()));
}

export function createPublicPublishBundle(
	records: VaultRecord[],
	renderBodyHtml: RenderPublicRecordHtml,
	options: PublicPublishOptions = {}
): PublicPublishBundle {
	const outputDirectory = normalizeOutputDirectory(
		options.outputDirectory ?? options.profile?.outputDirectory ?? 'public'
	);
	const publicRecords = getPublicPublishRecords(records, options.profile ?? null);
	const entries = createPublicPublishEntries(publicRecords, outputDirectory);
	const files: PublicPublishFile[] = [
		{
			path: `${outputDirectory}/index.html`,
			content: createStandaloneHtmlDocument({
				bodyHtml: renderPublicPublishIndexHtml(entries, `${outputDirectory}/index.html`),
				subtitle: options.subtitle ?? options.profile?.subtitle ?? 'Datahoarder public index',
				title: options.profile?.name ?? 'Public Notes'
			})
		},
		...entries.map((entry) => {
			const record = publicRecords.find((candidate) => candidate.path === entry.sourcePath);
			const bodyHtml = record ? renderBodyHtml(record, entry, entries) : '';

			return {
				path: entry.outputPath,
				content: createStandaloneHtmlDocument({
					bodyHtml,
					subtitle: options.subtitle ?? options.profile?.subtitle ?? 'Datahoarder public note',
					title: entry.title
				})
			};
		})
	];

	return {
		entries,
		files,
		outputDirectory
	};
}

export function createPublicPublishEntries(records: VaultRecord[], outputDirectory = 'public') {
	const normalizedOutputDirectory = normalizeOutputDirectory(outputDirectory);
	const usedPaths = new Set<string>([`${normalizedOutputDirectory}/index.html`]);

	return records.map((record) => {
		const outputPath = getUniqueOutputPath(getPublicPublishOutputPath(record, normalizedOutputDirectory), usedPaths);
		usedPaths.add(outputPath);

		return {
			outputPath,
			preview: record.preview,
			routePath: record.routePath,
			sourcePath: record.path,
			title: record.title,
			updatedAt: record.updatedAt
		};
	});
}

export function getPublicPublishOutputPath(record: VaultRecord, outputDirectory = 'public') {
	const routeSegments = record.routePath.split('/').map(slugifyPathSegment).filter(Boolean);
	const fileSegments = routeSegments.length ? routeSegments : [slugifyPathSegment(record.title) || 'note'];
	const fileName = `${fileSegments.pop() ?? 'note'}.html`;

	return [normalizeOutputDirectory(outputDirectory), ...fileSegments, fileName].filter(Boolean).join('/');
}

export function renderPublicPublishIndexHtml(entries: PublicPublishEntry[], indexPath = 'public/index.html') {
	if (!entries.length) {
		return '<p>No public notes were selected.</p>';
	}

	const items = entries
		.slice()
		.sort((entryA, entryB) => entryA.title.localeCompare(entryB.title, undefined, { sensitivity: 'base' }))
		.map((entry) => {
			const href = getPublicPublishHref(indexPath, entry.outputPath);

			return [
				'<li>',
				`<a href="${escapeHtml(href)}">${escapeHtml(entry.title)}</a>`,
				'</li>'
			].filter(Boolean).join('');
		})
		.join('\n');

	return `<ul class="public-index">${items}</ul>`;
}

export function getPublicPublishHref(currentOutputPath: string, targetOutputPath: string, heading = '') {
	if (!targetOutputPath) {
		return '#';
	}

	const relativePath = getRelativePublishPath(getDirectoryPath(currentOutputPath), targetOutputPath);
	const hash = heading ? `#${encodeURIComponent(heading)}` : '';

	return `${relativePath}${hash}`;
}

function getExplicitPublicValue(record: VaultRecord): VaultPropertyValue | undefined {
	for (const [key, value] of Object.entries(record.properties)) {
		if (publicPropertyNames.includes(key.trim().toLowerCase())) {
			return value;
		}
	}

	return undefined;
}

async function readPublicPublishProfile(file: LocalVaultFile) {
	try {
		return parsePublicPublishProfile(await readLocalFile(file), file.path);
	} catch {
		return null;
	}
}

function parsePublicPublishProfileData(content: string, path: string): SimpleYamlValue | null {
	if (/\.json$/iu.test(path)) {
		try {
			return JSON.parse(content) as SimpleYamlValue;
		} catch {
			return null;
		}
	}

	return parseSimpleYaml(content);
}

function parsePublicPublishSource(value: SimpleYamlValue | undefined): PublicPublishSource {
	const source = asRecord(value);

	return {
		files: toStringList(source.files ?? source.file).map(normalizeSourcePath),
		folders: toStringList(source.folders ?? source.folder).map(normalizeSourcePath),
		match: parseMatch(source.match),
		query: toStringValue(source.query ?? source.filter ?? source.search),
		tags: toStringList(source.tags ?? source.tag).map((tag) => tag.replace(/^#/u, ''))
	};
}

function parseMatch(value: SimpleYamlValue | undefined): Record<string, PublicPublishMatchRule> {
	const match = asRecord(value);
	const rules: Record<string, PublicPublishMatchRule> = {};

	for (const [key, rule] of Object.entries(match)) {
		if (isRecord(rule)) {
			const ruleObject: PublicPublishMatchRuleObject = {};

			if ('equals' in rule) {
				ruleObject.equals = rule.equals;
			}

			if (typeof rule.exists === 'boolean') {
				ruleObject.exists = rule.exists;
			}

			if ('includes' in rule) {
				ruleObject.includes = rule.includes;
			}

			rules[key] = ruleObject;
			continue;
		}

		rules[key] = rule;
	}

	return rules;
}

function hasExplicitPublicPublishSource(source: PublicPublishSource) {
	return (
		source.files.length > 0 ||
		source.folders.length > 0 ||
		source.query.length > 0 ||
		source.tags.length > 0 ||
		Object.keys(source.match).length > 0
	);
}

function matchesPublicPublishSource(record: VaultRecord, source: PublicPublishSource, profilePath: string) {
	return (
		matchesFolders(record, source.folders, profilePath) &&
		matchesFiles(record, source.files, profilePath) &&
		matchesTags(record, source.tags) &&
		matchesRules(record, source.match) &&
		matchesPublicPublishQuery(record, source.query)
	);
}

function matchesPublicPublishQuery(record: VaultRecord, query: string) {
	return query ? matchVaultRecordQuery(record, query) : true;
}

function matchesFolders(record: VaultRecord, folders: string[], profilePath: string) {
	if (!folders.length) {
		return true;
	}

	return folders.some((folder) =>
		getSourcePathCandidates(folder, profilePath).some(
			(candidate) => record.path === candidate || record.path.startsWith(`${candidate}/`)
		)
	);
}

function matchesFiles(record: VaultRecord, files: string[], profilePath: string) {
	if (!files.length) {
		return true;
	}

	const paths = new Set(files.flatMap((file) => getSourcePathCandidates(file, profilePath)));

	return paths.has(record.path) || paths.has(record.routePath);
}

function matchesTags(record: VaultRecord, tags: string[]) {
	if (!tags.length) {
		return true;
	}

	const recordTags = new Set(record.tags.map((tag) => tag.toLowerCase()));

	return tags.every((tag) => recordTags.has(tag.replace(/^#/u, '').toLowerCase()));
}

function matchesRules(record: VaultRecord, rules: Record<string, PublicPublishMatchRule>) {
	return Object.entries(rules).every(([key, rule]) => {
		const value = getVaultRecordValue(record, key);

		if (isMatchRuleObject(rule)) {
			if (typeof rule.exists === 'boolean' && rule.exists !== hasValue(value)) {
				return false;
			}

			if ('equals' in rule && !valuesEqual(value, rule.equals)) {
				return false;
			}

			if ('includes' in rule && !valueIncludes(value, rule.includes)) {
				return false;
			}

			return true;
		}

		return valuesEqual(value, rule);
	});
}

function isTruthyPublicValue(value: VaultPropertyValue): boolean {
	if (Array.isArray(value)) {
		return value.some(isTruthyPublicValue);
	}

	if (typeof value === 'boolean') {
		return value;
	}

	if (value === null || value === undefined || typeof value === 'object') {
		return false;
	}

	return ['1', 'public', 'publish', 'published', 'shared', 'true', 'yes'].includes(
		formatVaultValue(value).trim().toLowerCase()
	);
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

function valuesEqual(valueA: VaultPropertyValue, valueB: VaultPropertyValue | undefined): boolean {
	if (Array.isArray(valueA)) {
		return valueA.some((item) => valuesEqual(item, valueB));
	}

	if (Array.isArray(valueB)) {
		return valueB.some((item) => valuesEqual(valueA, item));
	}

	return formatVaultValue(valueA).toLowerCase() === formatVaultValue(valueB ?? '').toLowerCase();
}

function valueIncludes(value: VaultPropertyValue, expected: VaultPropertyValue | undefined): boolean {
	if (Array.isArray(value)) {
		return value.some((item) => valuesEqual(item, expected));
	}

	return formatVaultValue(value).toLowerCase().includes(formatVaultValue(expected ?? '').toLowerCase());
}

function getSourcePathCandidates(path: string, profilePath: string) {
	const normalizedPath = normalizeProfilePath(path);

	if (path.trim().startsWith('/')) {
		return [normalizedPath];
	}

	const profileDirectory = getDirectoryPath(profilePath);
	const relativePath = normalizeProfilePath(profileDirectory ? `${profileDirectory}/${path}` : path);

	return [...new Set([relativePath, normalizedPath])].filter(Boolean);
}

function normalizeSourcePath(path: string) {
	const rootRelative = path.trim().startsWith('/');
	const normalizedPath = normalizeProfilePath(path);

	return rootRelative && normalizedPath ? `/${normalizedPath}` : normalizedPath;
}

function normalizeProfilePath(path: string) {
	const segments: string[] = [];

	for (const segment of path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').split('/')) {
		if (!segment || segment === '.') {
			continue;
		}

		if (segment === '..') {
			segments.pop();
			continue;
		}

		segments.push(segment);
	}

	return segments.join('/');
}

function getPublicPublishProfileName(path: string) {
	const fileName = path.split('/').at(-1) ?? path;
	const withoutExtension = fileName.replace(publishProfileFilePattern, '');
	const name = withoutExtension
		.replace(/[-_]+/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim()
		.replace(/\b\w/gu, (character) => character.toUpperCase());

	return name || 'Public Profile';
}

function toStringList(value: SimpleYamlValue | undefined): string[] {
	if (Array.isArray(value)) {
		return value.flatMap(toStringList);
	}

	if (value === null || value === undefined || typeof value === 'object') {
		return [];
	}

	return String(value)
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function toStringValue(value: SimpleYamlValue | undefined) {
	if (value === null || value === undefined || typeof value === 'object') {
		return '';
	}

	return String(value).trim();
}

function toBooleanValue(value: SimpleYamlValue | undefined) {
	if (typeof value === 'boolean') {
		return value;
	}

	if (value === null || value === undefined || typeof value === 'object') {
		return false;
	}

	return ['1', 'true', 'yes', 'public'].includes(String(value).trim().toLowerCase());
}

function getUniqueOutputPath(path: string, usedPaths: Set<string>) {
	if (!usedPaths.has(path)) {
		return path;
	}

	const extensionIndex = path.lastIndexOf('.');
	const stem = extensionIndex > 0 ? path.slice(0, extensionIndex) : path;
	const extension = extensionIndex > 0 ? path.slice(extensionIndex) : '';

	for (let index = 2; index < 1000; index += 1) {
		const candidate = `${stem}-${index}${extension}`;

		if (!usedPaths.has(candidate)) {
			return candidate;
		}
	}

	return path;
}

function getRelativePublishPath(fromDirectory: string, targetPath: string) {
	const fromSegments = fromDirectory.split('/').filter(Boolean);
	const targetSegments = targetPath.split('/').filter(Boolean);

	while (fromSegments.length && targetSegments.length && fromSegments[0] === targetSegments[0]) {
		fromSegments.shift();
		targetSegments.shift();
	}

	return [...fromSegments.map(() => '..'), ...targetSegments].join('/') || './';
}

function normalizeOutputDirectory(path: string) {
	const segments = path.replace(/\\/gu, '/').split('/').map(slugifyPathSegment).filter(Boolean);

	return segments.join('/') || 'public';
}

function slugifyPathSegment(segment: string) {
	const slug = segment
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');

	return slug || 'note';
}

function comparePublicPublishProfiles(profileA: PublicPublishProfile, profileB: PublicPublishProfile) {
	const nameOrder = profileA.name.localeCompare(profileB.name, undefined, {
		numeric: true,
		sensitivity: 'base'
	});

	if (nameOrder !== 0) {
		return nameOrder;
	}

	return profileA.path.localeCompare(profileB.path, undefined, {
		numeric: true,
		sensitivity: 'base'
	});
}

function asRecord(value: SimpleYamlValue | undefined | null): Record<string, SimpleYamlValue> {
	return isRecord(value) ? value : {};
}

function isRecord(value: SimpleYamlValue | undefined | null): value is Record<string, SimpleYamlValue> {
	return Boolean(value) && !Array.isArray(value) && typeof value === 'object';
}

function isMatchRuleObject(rule: PublicPublishMatchRule): rule is PublicPublishMatchRuleObject {
	return isRecord(rule) && ('equals' in rule || 'exists' in rule || 'includes' in rule);
}
