import { getNoteTitle } from './paths.js';

export type NoteTemplateContext = {
	date?: Date;
	path: string;
	title?: string;
};

export type NoteTemplateRenderResult = {
	content: string;
	slug: string;
	title: string;
};

const templatePathPattern = /(?:^|\/)templates?\//iu;
const templateExtensionPattern = /\.template\.(?:md|svx|txt)$/iu;

export function isNoteTemplatePath(path: string) {
	return templatePathPattern.test(path.replace(/\\/gu, '/')) || templateExtensionPattern.test(path);
}

export function renderNoteTemplate(content: string, context: NoteTemplateContext): NoteTemplateRenderResult {
	const title = (context.title?.trim() || getNoteTitle(context.path)).trim() || 'Untitled';
	const slug = slugifyTemplateValue(title);
	const date = context.date ?? new Date();
	const values: Record<string, string> = {
		date: formatDate(date),
		datetime: formatDateTime(date),
		path: context.path,
		slug,
		title
	};

	return {
		content: content.replace(/\{\{\s*([\w-]+)\s*\}\}/gu, (match, key: string) => values[key.toLowerCase()] ?? match),
		slug,
		title
	};
}

export function getTemplateDisplayName(path: string) {
	return getNoteTitle(path.replace(templateExtensionPattern, '.md'));
}

function slugifyTemplateValue(value: string) {
	const slug = value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');

	return slug || 'untitled';
}

function formatDate(date: Date) {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-');
}

function formatDateTime(date: Date) {
	return `${formatDate(date)} ${[
		String(date.getHours()).padStart(2, '0'),
		String(date.getMinutes()).padStart(2, '0')
	].join(':')}`;
}
