import { stripFrontmatter } from '../note-model/raw.js';
import { renderEmbedBlock } from './embeds.js';
import { renderFenceBlock } from './fences.js';
import { escapeAttribute, escapeHtml, sanitizeMarkdownUrl } from './html.js';
import { getMarkdownListItem, parseMarkdownList } from './lists.js';
import { renderAnchor, toObsidianLink } from './links.js';
import {
	markdownBlankLineHtml,
	parseMarkdownDisplayMathBlock,
	renderConfiguredInlineMarkdownRules,
	resolveMarkdownRules,
	type MarkdownRuleConfig
} from './rules.js';
import { parseMarkdownTable } from './tables.js';

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

export function renderPortableMarkdown(content: string, options: PortableMarkdownOptions = {}) {
	const body = stripFrontmatter(content).trim();
	const lines = body.split(/\r?\n/u);
	const markdownRules = resolveMarkdownRules(options.markdownRules);
	const html: string[] = [];
	let inFence = false;
	let fenceInfo = '';
	let fenceLines: string[] = [];
	let paragraphLines: string[] = [];
	let pendingBlankLineCount = 0;
	let taskListIndex = 0;

	function pushBlock(blockHtml: string) {
		if (!html.length) {
			pendingBlankLineCount = 0;
		}

		for (let index = 1; index < pendingBlankLineCount; index += 1) {
			html.push(markdownBlankLineHtml);
		}

		pendingBlankLineCount = 0;
		html.push(blockHtml);
	}

	function flushParagraph() {
		if (!paragraphLines.length) {
			return;
		}

		pushBlock(`<p>${paragraphLines.map((line) => renderInline(line, options)).join('\n')}</p>`);
		paragraphLines = [];
	}

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		const fenceMatch = line.match(/^\s*```([^\r\n]*)$/u);

		if (fenceMatch) {
			if (inFence) {
				pushBlock(renderFenceBlock(fenceInfo, fenceLines.join('\n')));
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
			pendingBlankLineCount += 1;
			continue;
		}

		const displayMath = parseMarkdownDisplayMathBlock(lines, lineIndex, markdownRules);

		if (displayMath) {
			flushParagraph();
			pushBlock(displayMath.html);
			lineIndex = displayMath.nextLineIndex;
			continue;
		}

		const table = parseMarkdownTable(lines, lineIndex, options, renderInline);

		if (table) {
			flushParagraph();
			pushBlock(table.html);
			lineIndex = table.nextLineIndex;
			continue;
		}

		const heading = line.match(/^(#{1,6})\s+(.+)$/u);

		if (heading) {
			flushParagraph();
			const level = heading[1].length;
			pushBlock(`<h${level}>${renderInline(heading[2], options)}</h${level}>`);
			continue;
		}

		if (/^\s*[-*_]{3,}\s*$/u.test(line)) {
			flushParagraph();
			pushBlock('<hr>');
			continue;
		}

		const listItem = getMarkdownListItem(line);

		if (listItem) {
			flushParagraph();
			const parsedList = parseMarkdownList(lines, lineIndex, listItem.indent, listItem.type, options, {
				value: taskListIndex
			}, renderInline);
			pushBlock(parsedList.html);
			taskListIndex = parsedList.nextTaskListIndex;
			lineIndex = parsedList.nextLineIndex - 1;
			continue;
		}

		const quote = line.match(/^\s*>\s?(.+)$/u);

		if (quote) {
			flushParagraph();
			pushBlock(`<blockquote>${renderInline(quote[1], options)}</blockquote>`);
			continue;
		}

		const embed = line.match(/^\s*!\[\[([^\]]+)\]\]\s*$/u);

		if (embed) {
			flushParagraph();
			pushBlock(renderEmbedBlock(embed[1], options, renderPortableMarkdown));
			continue;
		}

		paragraphLines.push(line.trim());
	}

	if (inFence) {
		pushBlock(renderFenceBlock(fenceInfo, fenceLines.join('\n')));
	}

	flushParagraph();

	return html.join('\n');
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

