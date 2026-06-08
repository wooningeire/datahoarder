import { getDirectoryPath, joinRouteBase, stripCompiledNoteExtension } from '../vault/paths.js';
import { stripFrontmatter } from '../note-model/raw.js';
import { renderFenceBlock } from './fences.js';
import {
	parseMarkdownDisplayMathBlock,
	renderConfiguredInlineMarkdownRules,
	resolveMarkdownRules,
	type MarkdownRuleConfig
} from './rules.js';

export type PortableMarkdownOptions = {
	currentPath?: string;
	interactiveTaskLists?: boolean;
	markdownRules?: MarkdownRuleConfig;
	maxEmbedDepth?: number;
	notePaths?: string[];
	resolveEmbedContent?: (notePath: string) => string | null | undefined;
	resolveNoteHref?: (notePath: string, heading: string) => string;
	routeBase?: string;
	_embedDepth?: number;
	_embedStack?: string[];
};

type LinkLookup = {
	byName: Map<string, string[]>;
	byPath: Map<string, string>;
};

type RenderedLink = {
	embedParameters: Record<string, string>;
	heading?: string;
	href: string;
	notePath?: string;
};

type MarkdownTableAlignment = 'center' | 'left' | 'right' | '';

type RenderedMarkdownTable = {
	html: string;
	nextLineIndex: number;
};

type MarkdownListType = 'ordered' | 'unordered';

type MarkdownListItem = {
	content: string;
	indent: number;
	type: MarkdownListType;
};

export function renderPortableMarkdown(content: string, options: PortableMarkdownOptions = {}) {
	const body = stripFrontmatter(content).trim();
	const lines = body.split(/\r?\n/u);
	const markdownRules = resolveMarkdownRules(options.markdownRules);
	const html: string[] = [];
	let inFence = false;
	let fenceInfo = '';
	let fenceLines: string[] = [];
	let paragraphLines: string[] = [];
	let taskListIndex = 0;

	function flushParagraph() {
		if (!paragraphLines.length) {
			return;
		}

		html.push(`<p>${renderInline(paragraphLines.join(' '), options)}</p>`);
		paragraphLines = [];
	}

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		const fenceMatch = line.match(/^\s*```([^\r\n]*)$/u);

		if (fenceMatch) {
			if (inFence) {
				html.push(renderFenceBlock(fenceInfo, fenceLines.join('\n')));
				fenceInfo = '';
				fenceLines = [];
				inFence = false;
			} else {
				flushParagraph();
				fenceInfo = fenceMatch[1].trim();
				inFence = true;
			}

			continue;
		}

		if (inFence) {
			fenceLines.push(line);
			continue;
		}

		if (!line.trim()) {
			flushParagraph();
			continue;
		}

		const displayMath = parseMarkdownDisplayMathBlock(lines, lineIndex, markdownRules);

		if (displayMath) {
			flushParagraph();
			html.push(displayMath.html);
			lineIndex = displayMath.nextLineIndex;
			continue;
		}

		const table = parseMarkdownTable(lines, lineIndex, options);

		if (table) {
			flushParagraph();
			html.push(table.html);
			lineIndex = table.nextLineIndex;
			continue;
		}

		const heading = line.match(/^(#{1,6})\s+(.+)$/u);

		if (heading) {
			flushParagraph();
			const level = heading[1].length;
			html.push(`<h${level}>${renderInline(heading[2], options)}</h${level}>`);
			continue;
		}

		if (/^\s*[-*_]{3,}\s*$/u.test(line)) {
			flushParagraph();
			html.push('<hr>');
			continue;
		}

		const listItem = getMarkdownListItem(line);

		if (listItem) {
			flushParagraph();
			const parsedList = parseMarkdownList(lines, lineIndex, listItem.indent, listItem.type, options, {
				value: taskListIndex
			});
			html.push(parsedList.html);
			taskListIndex = parsedList.nextTaskListIndex;
			lineIndex = parsedList.nextLineIndex - 1;
			continue;
		}

		const quote = line.match(/^\s*>\s?(.+)$/u);

		if (quote) {
			flushParagraph();
			html.push(`<blockquote>${renderInline(quote[1], options)}</blockquote>`);
			continue;
		}

		const embed = line.match(/^\s*!\[\[([^\]]+)\]\]\s*$/u);

		if (embed) {
			flushParagraph();
			html.push(renderEmbedBlock(embed[1], options));
			continue;
		}

		paragraphLines.push(line.trim());
	}

	if (inFence) {
		html.push(renderFenceBlock(fenceInfo, fenceLines.join('\n')));
	}

	flushParagraph();

	return html.join('\n');
}

function parseMarkdownTable(
	lines: string[],
	startIndex: number,
	options: PortableMarkdownOptions
): RenderedMarkdownTable | null {
	const headerCells = parseMarkdownTableRow(lines[startIndex]);
	const separatorCells = parseMarkdownTableRow(lines[startIndex + 1] ?? '');

	if (!headerCells || !separatorCells || headerCells.length < 2 || !isMarkdownTableSeparator(separatorCells)) {
		return null;
	}

	const columnCount = headerCells.length;
	const alignments = separatorCells.slice(0, columnCount).map(getMarkdownTableAlignment);
	const bodyRows: string[][] = [];
	let lineIndex = startIndex + 2;

	while (lineIndex < lines.length) {
		const rowCells = parseMarkdownTableRow(lines[lineIndex]);

		if (!rowCells) {
			break;
		}

		bodyRows.push(normalizeMarkdownTableCells(rowCells, columnCount));
		lineIndex += 1;
	}

	const headerHtml = normalizeMarkdownTableCells(headerCells, columnCount)
		.map((cell, index) => renderMarkdownTableCell('th', cell, alignments[index] ?? '', options))
		.join('');
	const bodyHtml = bodyRows.map((row) => {
		const cells = row
			.map((cell, index) => renderMarkdownTableCell('td', cell, alignments[index] ?? '', options))
			.join('');

		return `<tr>${cells}</tr>`;
	}).join('');

	return {
		html: [
			'<div class="markdown-table-wrapper">',
			'<table class="markdown-table">',
			`<thead><tr>${headerHtml}</tr></thead>`,
			`<tbody>${bodyHtml}</tbody>`,
			'</table>',
			'</div>'
		].join(''),
		nextLineIndex: lineIndex - 1
	};
}

function parseMarkdownTableRow(line: string) {
	if (!line.includes('|')) {
		return null;
	}

	const trimmedLine = line.trim();
	const content = trimmedLine.startsWith('|') && trimmedLine.endsWith('|')
		? trimmedLine.slice(1, -1)
		: trimmedLine;
	const cells: string[] = [];
	let currentCell = '';
	let inCode = false;
	let escaping = false;

	for (const character of content) {
		if (escaping) {
			currentCell += character;
			escaping = false;
			continue;
		}

		if (character === '\\') {
			escaping = true;
			continue;
		}

		if (character === '`') {
			inCode = !inCode;
			currentCell += character;
			continue;
		}

		if (character === '|' && !inCode) {
			cells.push(currentCell.trim());
			currentCell = '';
			continue;
		}

		currentCell += character;
	}

	if (escaping) {
		currentCell += '\\';
	}

	cells.push(currentCell.trim());

	return cells;
}

function isMarkdownTableSeparator(cells: string[]) {
	return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.replace(/\s+/gu, '')));
}

function getMarkdownTableAlignment(cell: string): MarkdownTableAlignment {
	const normalizedCell = cell.replace(/\s+/gu, '');
	const left = normalizedCell.startsWith(':');
	const right = normalizedCell.endsWith(':');

	if (left && right) {
		return 'center';
	}

	if (right) {
		return 'right';
	}

	if (left) {
		return 'left';
	}

	return '';
}

function normalizeMarkdownTableCells(cells: string[], columnCount: number) {
	return Array.from({ length: columnCount }, (_item, index) => cells[index] ?? '');
}

function renderMarkdownTableCell(
	tagName: 'td' | 'th',
	content: string,
	alignment: MarkdownTableAlignment,
	options: PortableMarkdownOptions
) {
	const alignmentAttribute = alignment ? ` data-align="${alignment}"` : '';

	return `<${tagName}${alignmentAttribute}>${renderInline(content, options)}</${tagName}>`;
}

function parseMarkdownList(
	lines: string[],
	startIndex: number,
	indent: number,
	type: MarkdownListType,
	options: PortableMarkdownOptions,
	taskListIndex: { value: number }
) {
	const tagName = type === 'ordered' ? 'ol' : 'ul';
	const items: string[] = [];
	let lineIndex = startIndex;

	while (lineIndex < lines.length) {
		const item = getMarkdownListItem(lines[lineIndex]);

		if (!item || item.indent < indent || item.indent > indent || item.type !== type) {
			break;
		}

		const itemStart = renderMarkdownListItemStart(item, options, taskListIndex);
		let nestedHtml = '';
		lineIndex += 1;

		while (lineIndex < lines.length) {
			const nestedItem = getMarkdownListItem(lines[lineIndex]);

			if (!nestedItem || nestedItem.indent <= indent) {
				break;
			}

			const nestedList = parseMarkdownList(
				lines,
				lineIndex,
				nestedItem.indent,
				nestedItem.type,
				options,
				taskListIndex
			);
			nestedHtml += nestedList.html;
			lineIndex = nestedList.nextLineIndex;
		}

		items.push(`${itemStart}${nestedHtml}</li>`);
	}

	return {
		html: `<${tagName}>${items.join('')}</${tagName}>`,
		nextLineIndex: lineIndex,
		nextTaskListIndex: taskListIndex.value
	};
}

function getMarkdownListItem(line: string): MarkdownListItem | null {
	const match = line.match(/^([ \t]*)(?:(\d+)\.|[-*])\s+(.+)$/u);

	if (!match) {
		return null;
	}

	return {
		content: match[3],
		indent: getMarkdownIndentWidth(match[1]),
		type: match[2] ? 'ordered' : 'unordered'
	};
}

function getMarkdownIndentWidth(indent: string) {
	let width = 0;

	for (const character of indent) {
		width += character === '\t' ? 4 - (width % 4) : 1;
	}

	return width;
}

function renderMarkdownListItemStart(
	item: MarkdownListItem,
	options: PortableMarkdownOptions,
	taskListIndex: { value: number }
) {
	const taskItem = item.type === 'unordered' ? item.content.match(/^\[([ xX])\]\s+(.+)$/u) : null;

	if (!taskItem) {
		return `<li>${renderInline(item.content, options)}`;
	}

	const checked = taskItem[1].toLowerCase() === 'x';
	const checkboxAttributes = options.interactiveTaskLists
		? ` data-task-index="${taskListIndex.value}"`
		: ' disabled';
	taskListIndex.value += 1;

	return [
		'<li class="task-list-item">',
		`<input type="checkbox"${checkboxAttributes}${checked ? ' checked' : ''}>`,
		` <span>${renderInline(taskItem[2], options)}</span>`
	].join('');
}

function renderInline(text: string, options: PortableMarkdownOptions) {
	let rendered = escapeHtml(text);
	const codeSpans = new Map<string, string>();
	let codeSpanIndex = 0;

	rendered = rendered.replace(/`([^`]+)`/gu, (_match, code: string) => {
		const token = `datahoarder-inline-code-token-${codeSpanIndex}:`;

		codeSpanIndex += 1;
		codeSpans.set(token, `<code>${code}</code>`);
		return token;
	});
	rendered = renderConfiguredInlineMarkdownRules(rendered, resolveMarkdownRules(options.markdownRules));
	rendered = rendered.replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
	rendered = rendered.replace(/\*([^*]+)\*/gu, '<em>$1</em>');
	rendered = rendered.replace(/!\[([^\]]*)\]\(([^)]+)\)/gu, (_match, alt, src) => {
		const safeSrc = sanitizeMarkdownUrl(src, false);

		return safeSrc ? `<img alt="${escapeAttribute(alt)}" src="${escapeAttribute(safeSrc)}">` : alt;
	});
	rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/gu, (_match, label, href) => {
		const safeHref = sanitizeMarkdownUrl(href, true);

		return safeHref ? `<a href="${escapeAttribute(safeHref)}">${label}</a>` : label;
	});
	rendered = rendered.replace(/!\[\[([^\]]+)\]\]/gu, (_match, linkContent) => {
		const link = toObsidianLink(linkContent, options);

		if (!link) {
			return escapeHtml(linkContent);
		}

		return renderAnchor(escapeHtml(link.label), link);
	});
	rendered = rendered.replace(/\[\[([^\]]+)\]\]/gu, (_match, linkContent) => {
		const link = toObsidianLink(linkContent, options);

		if (!link) {
			return escapeHtml(linkContent);
		}

		return renderAnchor(escapeHtml(link.label), link);
	});

	return replaceInlineCodeTokens(rendered, codeSpans);
}

function replaceInlineCodeTokens(html: string, codeSpans: Map<string, string>) {
	let rendered = html;

	for (const [token, codeSpan] of codeSpans) {
		rendered = rendered.replaceAll(token, codeSpan);
	}

	return rendered;
}

function renderEmbedBlock(linkContent: string, options: PortableMarkdownOptions) {
	const link = toObsidianLink(linkContent, options);

	if (!link?.notePath || !options.resolveEmbedContent) {
		return renderMissingEmbed();
	}

	const maxEmbedDepth = options.maxEmbedDepth ?? 4;
	const embedDepth = options._embedDepth ?? 0;
	const embedKey = `${link.notePath}#${link.heading ?? ''}`.toLowerCase();
	const embedStack = options._embedStack ?? [];

	if (embedDepth >= maxEmbedDepth || embedStack.includes(embedKey)) {
		return renderMissingEmbed('Embed skipped to avoid a recursive loop.');
	}

	const embeddedContent = options.resolveEmbedContent(link.notePath);
	const embeddedBody = embeddedContent
		? getEmbeddedMarkdownBody(embeddedContent, link.heading ?? '')
		: '';

	if (!embeddedBody) {
		return renderMissingEmbed();
	}

	const bodyHtml = renderParameterizedEmbedMarkdown(embeddedBody, link.embedParameters, {
		...options,
		currentPath: link.notePath,
		interactiveTaskLists: false,
		_embedDepth: embedDepth + 1,
		_embedStack: [...embedStack, embedKey]
	});

	return [
		`<aside class="note-embed" data-note-path="${escapeAttribute(link.notePath)}">`,
		`<header>${renderAnchor(escapeHtml(link.label), link)}</header>`,
		`<div class="note-embed-body">${bodyHtml}</div>`,
		'</aside>'
	].join('');
}

function renderMissingEmbed(message = 'Embedded note unavailable.') {
	return `<aside class="note-embed note-embed-missing"><p>${escapeHtml(message)}</p></aside>`;
}

function renderAnchor(label: string, link: RenderedLink) {
	return `<a href="${escapeAttribute(link.href)}"${getNoteDataAttributes(link)}>${label}</a>`;
}

function getNoteDataAttributes(link: RenderedLink) {
	if (!link.notePath) {
		return '';
	}

	const headingAttribute = link.heading
		? ` data-note-heading="${escapeAttribute(link.heading)}"`
		: '';

	return ` data-note-path="${escapeAttribute(link.notePath)}"${headingAttribute}`;
}

function toObsidianLink(linkContent: string, options: PortableMarkdownOptions) {
	const parts = linkContent.split('|').map((part) => part.trim());
	const rawTarget = parts[0] ?? '';
	const { alias, parameters } = parseObsidianLinkParts(parts.slice(1));
	const headingIndex = rawTarget.indexOf('#');
	const targetPath = headingIndex >= 0 ? rawTarget.slice(0, headingIndex).trim() : rawTarget;
	const heading = headingIndex >= 0 ? rawTarget.slice(headingIndex + 1).trim() : '';
	const normalizedTarget = normalizeObsidianTargetPath(targetPath);
	const label = alias || getDefaultObsidianLabel(normalizedTarget, heading);

	if (!label) {
		return null;
	}

	if (/^(?:https?|mailto):/iu.test(targetPath)) {
		return {
			embedParameters: parameters,
			href: `${targetPath}${getObsidianHash(heading)}`,
			label
		};
	}

	const notePath = resolveObsidianNotePath(normalizedTarget, options);
	const routeBase = options.routeBase ?? '';
	const href = notePath
		? (options.resolveNoteHref?.(notePath, heading) ??
			`${joinRouteBase(routeBase, notePath)}${getObsidianHash(heading)}`)
		: '#';

	return {
		embedParameters: parameters,
		heading,
		href,
		label,
		notePath
	};
}

function parseObsidianLinkParts(parts: string[]) {
	const aliasParts: string[] = [];
	const parameters: Record<string, string> = {};

	for (const part of parts) {
		const parameter = parseEmbedParameter(part);

		if (parameter) {
			parameters[parameter.key] = parameter.value;
			continue;
		}

		if (part) {
			aliasParts.push(part);
		}
	}

	return {
		alias: aliasParts.join('|').trim(),
		parameters
	};
}

function parseEmbedParameter(value: string) {
	const separatorIndex = value.indexOf('=');

	if (separatorIndex <= 0) {
		return null;
	}

	const rawKey = value.slice(0, separatorIndex).trim();
	const key = normalizeEmbedParameterKey(rawKey);

	if (!key) {
		return null;
	}

	return {
		key,
		value: value.slice(separatorIndex + 1).trim()
	};
}

function renderParameterizedEmbedMarkdown(
	content: string,
	parameters: Record<string, string>,
	options: PortableMarkdownOptions
) {
	if (!Object.keys(parameters).length) {
		return renderPortableMarkdown(content, options);
	}

	const replacements = new Map<string, string>();
	let index = 0;
	const tokenizedContent = content.replace(/\{\{\s*([\w.-]+)\s*\}\}/gu, (match, key: string) => {
		const value = parameters[normalizeEmbedPlaceholderKey(key)];

		if (value === undefined) {
			return match;
		}

		const token = `datahoarder-embed-param-${index}:`;
		index += 1;
		replacements.set(token, value);

		return token;
	});
	let html = renderPortableMarkdown(tokenizedContent, options);

	return replaceEmbedParameterTokensInText(html, replacements);
}

function normalizeEmbedParameterKey(key: string) {
	return /^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(key) ? key.toLocaleLowerCase() : '';
}

function normalizeEmbedPlaceholderKey(key: string) {
	const normalizedKey = normalizeEmbedParameterKey(key);

	return normalizedKey.startsWith('embed.') ? normalizedKey.slice('embed.'.length) : normalizedKey;
}

function replaceEmbedParameterTokensInText(html: string, replacements: Map<string, string>) {
	let result = '';
	let inTag = false;

	for (let index = 0; index < html.length;) {
		const character = html[index];

		if (character === '<') {
			inTag = true;
			result += character;
			index += 1;
			continue;
		}

		if (character === '>') {
			inTag = false;
			result += character;
			index += 1;
			continue;
		}

		if (!inTag) {
			const replacement = getEmbedParameterTokenReplacement(html, index, replacements);

			if (replacement) {
				result += escapeHtml(replacement.value);
				index += replacement.token.length;
				continue;
			}
		}

		result += character;
		index += 1;
	}

	return result;
}

function getEmbedParameterTokenReplacement(
	html: string,
	index: number,
	replacements: Map<string, string>
) {
	for (const [token, value] of replacements) {
		if (html.startsWith(token, index)) {
			return { token, value };
		}
	}

	return null;
}

function resolveObsidianNotePath(targetPath: string, options: PortableMarkdownOptions) {
	if (!targetPath) {
		return options.currentPath ?? '';
	}

	const lookup = getLookup(options.notePaths ?? []);
	const targetKey = targetPath.toLowerCase();
	const currentDirectory = options.currentPath ? getDirectoryPath(options.currentPath) : '';

	if (!targetPath.includes('/') && currentDirectory) {
		const siblingMatch = lookup.byPath.get(`${currentDirectory}/${targetKey}`.toLowerCase());

		if (siblingMatch) {
			return siblingMatch;
		}
	}

	const directMatch = lookup.byPath.get(targetKey);

	if (directMatch) {
		return directMatch;
	}

	if (!targetPath.includes('/')) {
		const nameMatches = lookup.byName.get(targetKey) ?? [];
		const sameDirectoryMatch = nameMatches.find((notePath) => getDirectoryPath(notePath) === currentDirectory);

		return sameDirectoryMatch ?? nameMatches[0] ?? targetPath;
	}

	return targetPath;
}

function getLookup(notePaths: string[]): LinkLookup {
	const byPath = new Map<string, string>();
	const byName = new Map<string, string[]>();

	for (const notePath of notePaths) {
		const normalizedPath = stripCompiledNoteExtension(notePath).replace(/\\/gu, '/');
		byPath.set(normalizedPath.toLowerCase(), normalizedPath);

		const nameKey = normalizedPath.split('/').at(-1)?.toLowerCase();

		if (!nameKey) {
			continue;
		}

		const matches = byName.get(nameKey) ?? [];
		matches.push(normalizedPath);
		byName.set(nameKey, matches);
	}

	return { byName, byPath };
}

function getEmbeddedMarkdownBody(content: string, heading: string) {
	const body = stripFrontmatter(content).trim();

	if (!heading) {
		return body;
	}

	const lines = body.split(/\r?\n/u);
	const normalizedHeading = normalizeHeadingText(heading);
	let startIndex = -1;
	let headingLevel = 0;

	for (let index = 0; index < lines.length; index += 1) {
		const match = lines[index].match(/^(#{1,6})\s+(.+)$/u);

		if (!match || normalizeHeadingText(match[2]) !== normalizedHeading) {
			continue;
		}

		startIndex = index + 1;
		headingLevel = match[1].length;
		break;
	}

	if (startIndex < 0) {
		return '';
	}

	const endIndex = lines.findIndex((line, index) => {
		if (index < startIndex) {
			return false;
		}

		const match = line.match(/^(#{1,6})\s+/u);

		return Boolean(match && match[1].length <= headingLevel);
	});

	return lines.slice(startIndex, endIndex < 0 ? undefined : endIndex).join('\n').trim();
}

function normalizeHeadingText(text: string) {
	return text
		.replace(/[*_`]/gu, '')
		.replace(/\s+/gu, ' ')
		.trim()
		.toLowerCase();
}

function normalizeObsidianTargetPath(targetPath: string) {
	return targetPath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').replace(/\.(md|svx|svelte)$/u, '');
}

function getDefaultObsidianLabel(targetPath: string, heading: string) {
	if (targetPath) {
		return targetPath.split('/').at(-1) ?? targetPath;
	}

	return heading;
}

function getObsidianHash(heading: string) {
	return heading ? `#${encodeURIComponent(heading)}` : '';
}

function sanitizeMarkdownUrl(url: string, allowMailto: boolean) {
	const trimmedUrl = url.trim();

	if (!trimmedUrl) {
		return '';
	}

	const schemeMatch = trimmedUrl.match(/^([a-z][a-z0-9+.-]*):/iu);

	if (!schemeMatch) {
		return trimmedUrl;
	}

	const scheme = schemeMatch[1].toLowerCase();

	if (scheme === 'http' || scheme === 'https' || (allowMailto && scheme === 'mailto')) {
		return trimmedUrl;
	}

	return '';
}

function escapeHtml(text: string) {
	return text.replace(/[&<>"']/gu, (character) => {
		switch (character) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			case "'":
				return '&#39;';
			default:
				return character;
		}
	});
}

function escapeAttribute(text: string) {
	return escapeHtml(text).replace(/`/gu, '&#96;');
}
