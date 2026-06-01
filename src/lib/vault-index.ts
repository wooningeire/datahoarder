import { readLocalFile, type LocalVaultFile } from './local-vault.js';
import { getDirectoryPath, getNoteTitle } from './paths.js';
import { stripFrontmatter } from './raw-notes.js';
import { parseSimpleYaml, type SimpleYamlValue } from './simple-yaml.js';

export type VaultPropertyValue = SimpleYamlValue;

export type VaultLink = {
	label: string;
	target: string;
	type: 'markdown' | 'obsidian';
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
	records: VaultRecord[];
	recordsByPath: Map<string, VaultRecord>;
	recordsByRoutePath: Map<string, VaultRecord>;
};

const indexedNoteExtensionPattern = /\.(md|svx)$/iu;

export function createEmptyVaultIndex(): VaultIndex {
	return {
		records: [],
		recordsByPath: new Map(),
		recordsByRoutePath: new Map()
	};
}

export async function buildLocalVaultIndex(files: LocalVaultFile[]) {
	const records = await Promise.all(
		files.filter((file) => isIndexedNoteFile(file.path)).map((file) => toVaultRecord(file))
	);

	return createVaultIndex(records);
}

export function createVaultIndex(records: VaultRecord[]): VaultIndex {
	return {
		records,
		recordsByPath: new Map(records.map((record) => [record.path, record])),
		recordsByRoutePath: new Map(records.map((record) => [record.routePath, record]))
	};
}

export function isIndexedNoteFile(path: string) {
	return indexedNoteExtensionPattern.test(path);
}

export function getVaultRecordValue(record: VaultRecord, key: string): VaultPropertyValue {
	switch (key) {
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
		case 'updatedAt':
			return record.updatedAt;
		default:
			return record.properties[key] ?? '';
	}
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
	const frontmatter = getFrontmatter(content);
	const properties = frontmatter ? parseSimpleYaml(frontmatter) : {};
	const body = stripFrontmatter(content).trim();
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

function getFrontmatter(content: string) {
	return content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1] ?? '';
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
