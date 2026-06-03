import { readLocalFile, type LocalVaultFile } from './local-vault.js';
import {
	getDatahoarderBoardLinks,
	getDatahoarderBoardPreview,
	isDatahoarderBoardFile,
	parseDatahoarderBoard
} from './local-board.js';
import { getDirectoryPath, getNoteTitle, stripCompiledNoteExtension } from './paths.js';
import { stripFrontmatter } from './raw-notes.js';
import { parseSimpleYaml, type SimpleYamlValue } from './simple-yaml.js';

export type VaultPropertyValue = SimpleYamlValue;

export type VaultLink = {
	label: string;
	target: string;
	type: 'board' | 'markdown' | 'obsidian';
};

export type VaultRecord = {
	basename: string;
	content: string;
	extension: string;
	folder: string;
	links: VaultLink[];
	path: string;
	preview: string;
	properties: Record<string, VaultPropertyValue>;
	routePath: string;
	size: number;
	tags: string[];
	title: string;
	updatedAt: number;
};

export type VaultIndex = {
	backlinksByPath: Map<string, VaultBacklink[]>;
	records: VaultRecord[];
	recordsByPath: Map<string, VaultRecord>;
	recordsByRoutePath: Map<string, VaultRecord>;
};

export type VaultIndexBuildOptions = {
	changedPaths?: Iterable<string>;
	concurrency?: number;
	previousIndex?: VaultIndex | null;
};

export type VaultBacklink = {
	links: VaultLink[];
	record: VaultRecord;
};

type RecordLookup = {
	byName: Map<string, VaultRecord>;
	byPath: Map<string, VaultRecord>;
	byPathWithoutExtension: Map<string, VaultRecord>;
	byRoutePath: Map<string, VaultRecord>;
};

const indexedNoteExtensionPattern = /\.(md|svx)$/iu;
const defaultIndexConcurrency = 8;

export function createEmptyVaultIndex(): VaultIndex {
	return {
		backlinksByPath: new Map(),
		records: [],
		recordsByPath: new Map(),
		recordsByRoutePath: new Map()
	};
}

export async function buildLocalVaultIndex(files: LocalVaultFile[], options: VaultIndexBuildOptions = {}) {
	const changedPaths = new Set(
		[...(options.changedPaths ?? [])].map((path) => path.trim()).filter(Boolean)
	);
	const indexedFiles = files.filter((file) => isIndexedNoteFile(file.path));
	const records = await mapFilesWithConcurrency(
		indexedFiles,
		(file) => getReusableVaultRecord(file, options.previousIndex ?? null, changedPaths) ?? toVaultRecord(file),
		options.concurrency ?? defaultIndexConcurrency
	);

	return createVaultIndex(records);
}

export function createVaultIndex(records: VaultRecord[]): VaultIndex {
	const recordsByPath = new Map(records.map((record) => [record.path, record]));
	const recordsByRoutePath = new Map(records.map((record) => [record.routePath, record]));

	return {
		backlinksByPath: createBacklinksByPath(records),
		records,
		recordsByPath,
		recordsByRoutePath
	};
}

export function isIndexedNoteFile(path: string) {
	return indexedNoteExtensionPattern.test(path) || isDatahoarderBoardFile(path);
}

export function getVaultRecordValue(record: VaultRecord, key: string): VaultPropertyValue {
	switch (key.toLowerCase()) {
		case 'basename':
			return record.basename;
		case 'folder':
			return record.folder;
		case 'path':
			return record.path;
		case 'preview':
			return record.preview;
		case 'tags':
			return record.tags;
		case 'title':
			return record.title;
		case 'updatedat':
			return record.updatedAt;
		default:
			return getPropertyValue(record.properties, key);
	}
}

export function getVaultBacklinks(index: VaultIndex, targetRecord: VaultRecord): VaultBacklink[] {
	return index.backlinksByPath.get(targetRecord.path) ?? [];
}

function createBacklinksByPath(records: VaultRecord[]) {
	const backlinksByPath = new Map<string, VaultBacklink>();
	const backlinksByTargetPath = new Map<string, VaultBacklink[]>();
	const lookup = createRecordLookup(records);

	for (const record of records) {
		for (const link of record.links) {
			const linkedRecord = resolveVaultLinkRecord(record, link, lookup);

			if (!linkedRecord || linkedRecord.path === record.path) {
				continue;
			}

			const backlinkKey = `${linkedRecord.path}\n${record.path}`;
			const backlink = backlinksByPath.get(backlinkKey) ?? { links: [], record };

			backlink.links.push(link);
			backlinksByPath.set(backlinkKey, backlink);

			const targetBacklinks = backlinksByTargetPath.get(linkedRecord.path) ?? [];

			if (!targetBacklinks.includes(backlink)) {
				targetBacklinks.push(backlink);
				backlinksByTargetPath.set(linkedRecord.path, targetBacklinks);
			}
		}
	}

	return backlinksByTargetPath;
}

export function formatVaultValue(value: VaultPropertyValue): string {
	if (Array.isArray(value)) {
		return value.map(formatVaultValue).filter(Boolean).join(', ');
	}

	if (value === null || value === undefined) {
		return '';
	}

	if (typeof value === 'object') {
		return JSON.stringify(value);
	}

	return String(value);
}

async function toVaultRecord(file: LocalVaultFile): Promise<VaultRecord> {
	const content = await readLocalFile(file);

	if (isDatahoarderBoardFile(file.path)) {
		return toBoardVaultRecord(file, content);
	}

	const frontmatter = getFrontmatter(content);
	const body = stripFrontmatter(content).trim();
	const properties = mergeProperties(parseInlineProperties(body), frontmatter ? parseSimpleYaml(frontmatter) : {});
	const title = getTitle(file.path, body, properties);

	return {
		basename: getBasename(file.path),
		content,
		extension: file.extension,
		folder: getDirectoryPath(file.path),
		links: getLinks(body),
		path: file.path,
		preview: getPreview(body, title),
		properties,
		routePath: file.routePath,
		size: file.size,
		tags: getTags(body, properties),
		title,
		updatedAt: file.updatedAt
	};
}

function toBoardVaultRecord(file: LocalVaultFile, content: string): VaultRecord {
	const board = parseDatahoarderBoard(content, file.path);

	return {
		basename: getBoardBasename(file.path),
		content,
		extension: file.extension,
		folder: getDirectoryPath(file.path),
		links: getDatahoarderBoardLinks(board),
		path: file.path,
		preview: getDatahoarderBoardPreview(board),
		properties: board.properties,
		routePath: file.routePath,
		size: file.size,
		tags: board.tags,
		title: board.title,
		updatedAt: file.updatedAt
	};
}

function getFrontmatter(content: string) {
	return content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1] ?? '';
}

function getReusableVaultRecord(
	file: LocalVaultFile,
	previousIndex: VaultIndex | null,
	changedPaths: Set<string>
) {
	if (!previousIndex || changedPaths.has(file.path) || changedPaths.has(file.routePath)) {
		return null;
	}

	const record = previousIndex.recordsByPath.get(file.path);

	if (
		!record ||
		record.extension !== file.extension ||
		record.routePath !== file.routePath ||
		record.size !== file.size ||
		record.updatedAt !== file.updatedAt
	) {
		return null;
	}

	return record;
}

function parseInlineProperties(body: string) {
	const properties: Record<string, VaultPropertyValue> = {};
	let fenceMarker = '';

	for (const line of body.split(/\r?\n/u)) {
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

		const propertyMatch = line.match(/^\s*([\p{L}_][\p{L}\p{N}_ ./-]*?)::\s*(.*)$/u);

		if (!propertyMatch) {
			continue;
		}

		const key = propertyMatch[1].trim();

		if (!key) {
			continue;
		}

		appendPropertyValue(properties, key, parseInlinePropertyValue(key, propertyMatch[2].trim()));
	}

	return properties;
}

function parseInlinePropertyValue(key: string, rawValue: string): VaultPropertyValue {
	if (!rawValue) {
		return '';
	}

	const parsed = parseSimpleYaml(`${key}: ${rawValue}`);

	return parsed[key] ?? getPropertyValue(parsed, key);
}

function mergeProperties(
	bodyProperties: Record<string, VaultPropertyValue>,
	frontmatterProperties: Record<string, VaultPropertyValue>
) {
	const properties = { ...bodyProperties };

	for (const [key, value] of Object.entries(frontmatterProperties)) {
		const existingKey = findPropertyKey(properties, key);

		if (existingKey && existingKey !== key) {
			delete properties[existingKey];
		}

		properties[key] = value;
	}

	return properties;
}

function appendPropertyValue(
	properties: Record<string, VaultPropertyValue>,
	key: string,
	value: VaultPropertyValue
) {
	const existingKey = findPropertyKey(properties, key);

	if (!existingKey) {
		properties[key] = value;
		return;
	}

	const existingValue = properties[existingKey];
	properties[existingKey] = Array.isArray(existingValue) ? [...existingValue, value] : [existingValue, value];
}

function getPropertyValue(properties: Record<string, VaultPropertyValue>, key: string) {
	const exactValue = properties[key];

	if (exactValue !== undefined) {
		return exactValue;
	}

	const matchingKey = findPropertyKey(properties, key);

	return matchingKey ? properties[matchingKey] : '';
}

function findPropertyKey(properties: Record<string, VaultPropertyValue>, key: string) {
	const normalizedKey = normalizePropertyKey(key);

	return Object.keys(properties).find((propertyKey) => normalizePropertyKey(propertyKey) === normalizedKey);
}

function normalizePropertyKey(key: string) {
	return key.trim().toLocaleLowerCase();
}

function getTitle(path: string, body: string, properties: Record<string, VaultPropertyValue>) {
	const frontmatterTitle = properties.title;

	if (typeof frontmatterTitle === 'string' && frontmatterTitle.trim()) {
		return frontmatterTitle.trim();
	}

	const firstHeading = body.match(/^#\s+(.+)$/mu)?.[1]?.trim();

	if (firstHeading) {
		return firstHeading;
	}

	return getNoteTitle(path);
}

function getBasename(path: string) {
	return path.split('/').at(-1)?.replace(/\.(md|svx)$/iu, '') ?? path;
}

function getBoardBasename(path: string) {
	return path.split('/').at(-1)?.replace(/\.dhboard\.(?:json|ya?ml)$/iu, '') ?? path;
}

function getPreview(body: string, title: string) {
	const plain = body
		.replace(/^#{1,6}\s+.+$/gmu, '')
		.replace(/```[\s\S]*?```/gu, '')
		.replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
		.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu, '$2$1')
		.replace(/[*_`>#-]/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();

	return plain || title;
}

function getTags(body: string, properties: Record<string, VaultPropertyValue>) {
	const tags = new Set<string>();
	const propertyTags = properties.tags ?? properties.tag;

	for (const tag of toStringList(propertyTags)) {
		tags.add(normalizeTag(tag));
	}

	for (const match of body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
		tags.add(normalizeTag(match[1]));
	}

	return [...tags].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function getLinks(body: string) {
	const links: VaultLink[] = [];

	for (const match of body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu)) {
		const target = match[1].trim();

		if (!target) {
			continue;
		}

		links.push({
			label: match[2]?.trim() || target,
			target,
			type: 'obsidian'
		});
	}

	for (const match of body.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/gu)) {
		const target = match[2].trim();

		if (!target || /^(?:https?|mailto):/iu.test(target)) {
			continue;
		}

		links.push({
			label: match[1].trim(),
			target,
			type: 'markdown'
		});
	}

	return links;
}

function resolveVaultLinkRecord(sourceRecord: VaultRecord, link: VaultLink, lookup: RecordLookup) {
	const target = cleanLinkTarget(link.target);

	if (!target) {
		return null;
	}

	const candidates = getLinkTargetCandidates(sourceRecord, target);

	for (const candidate of candidates) {
		const normalizedCandidate = normalizeLinkedPath(stripCompiledNoteExtension(candidate));
		const record =
			lookup.byRoutePath.get(normalizedCandidate) ??
			lookup.byPathWithoutExtension.get(normalizedCandidate) ??
			lookup.byPath.get(normalizeLinkedPath(candidate));

		if (record) {
			return record;
		}
	}

	if (!target.includes('/')) {
		return lookup.byName.get(normalizeLinkedPath(stripCompiledNoteExtension(target))) ?? null;
	}

	return null;
}

function createRecordLookup(records: VaultRecord[]) {
	const byName = new Map<string, VaultRecord>();
	const byPath = new Map<string, VaultRecord>();
	const byPathWithoutExtension = new Map<string, VaultRecord>();
	const byRoutePath = new Map<string, VaultRecord>();

	for (const record of records) {
		const routePath = normalizeLinkedPath(record.routePath);
		const path = normalizeLinkedPath(record.path);
		const name = routePath.split('/').at(-1);

		byRoutePath.set(routePath, record);
		byPath.set(path, record);
		byPathWithoutExtension.set(normalizeLinkedPath(stripCompiledNoteExtension(record.path)), record);

		if (name && !byName.has(name)) {
			byName.set(name, record);
		}
	}

	return {
		byName,
		byPath,
		byPathWithoutExtension,
		byRoutePath
	};
}

function getLinkTargetCandidates(sourceRecord: VaultRecord, target: string) {
	if (target.startsWith('#')) {
		return [sourceRecord.routePath, sourceRecord.path];
	}

	const rootRelative = target.startsWith('/');
	const normalizedTarget = normalizeLinkedPath(target);

	if (rootRelative) {
		return [normalizedTarget];
	}

	const sourceDirectory = getDirectoryPath(sourceRecord.routePath);
	const siblingTarget = sourceDirectory ? normalizeLinkedPath(`${sourceDirectory}/${target}`) : normalizedTarget;

	return [...new Set([siblingTarget, normalizedTarget])];
}

function cleanLinkTarget(target: string) {
	const trimmedTarget = target.trim();

	if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmedTarget)) {
		return '';
	}

	const withoutHash = trimmedTarget.split('#')[0] ?? '';
	const withoutQuery = withoutHash.split('?')[0] ?? '';

	return withoutQuery.trim();
}

function normalizeLinkedPath(path: string) {
	const segments: string[] = [];
	let escapedRoot = false;

	for (const segment of path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').split('/')) {
		if (!segment || segment === '.') {
			continue;
		}

		if (segment === '..') {
			if (segments.length) {
				segments.pop();
			} else {
				escapedRoot = true;
			}

			continue;
		}

		segments.push(segment);
	}

	return escapedRoot ? '' : segments.join('/').toLowerCase();
}

function toStringList(value: VaultPropertyValue | undefined): string[] {
	if (Array.isArray(value)) {
		return value.flatMap(toStringList);
	}

	if (value === null || value === undefined || typeof value === 'object') {
		return [];
	}

	return String(value)
		.split(',')
		.map((tag) => tag.trim())
		.filter(Boolean);
}

function normalizeTag(tag: string) {
	return tag.trim().replace(/^#/u, '');
}

async function mapFilesWithConcurrency<T>(
	files: LocalVaultFile[],
	mapper: (file: LocalVaultFile) => Promise<T> | T,
	concurrency: number
) {
	if (!files.length) {
		return [];
	}

	const results = new Array<T>(files.length);
	const workerCount = Math.min(files.length, getSafeConcurrency(concurrency));
	let nextIndex = 0;
	let completed = 0;

	async function runWorker() {
		while (true) {
			const index = nextIndex;
			nextIndex += 1;

			if (index >= files.length) {
				return;
			}

			results[index] = await mapper(files[index]);
			completed += 1;

			if (completed % workerCount === 0) {
				await yieldToEventLoop();
			}
		}
	}

	await Promise.all(Array.from({ length: workerCount }, runWorker));

	return results;
}

function getSafeConcurrency(concurrency: number) {
	if (!Number.isFinite(concurrency) || concurrency < 1) {
		return defaultIndexConcurrency;
	}

	return Math.max(1, Math.min(32, Math.floor(concurrency)));
}

function yieldToEventLoop() {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}
