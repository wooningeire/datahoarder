import { getDirectoryPath, joinRouteBase, stripCompiledNoteExtension } from './paths';
import { stripFrontmatter } from './raw-notes';

export type PortableMarkdownOptions = {
	currentPath?: string;
	notePaths?: string[];
	routeBase?: string;
};

type LinkLookup = {
	byName: Map<string, string[]>;
	byPath: Map<string, string>;
};

export function renderPortableMarkdown(content: string, options: PortableMarkdownOptions = {}) {
	const body = stripFrontmatter(content).trim();
	const lines = body.split(/\r?\n/u);
	const html: string[] = [];
	let inFence = false;
	let fenceLines: string[] = [];
	let paragraphLines: string[] = [];
	let listItems: string[] = [];
	let orderedListItems: string[] = [];

	function flushParagraph() {
		if (!paragraphLines.length) {
			return;
		}

		html.push(`<p>${renderInline(paragraphLines.join(' '), options)}</p>`);
		paragraphLines = [];
	}

	function flushList() {
		if (listItems.length) {
			html.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`);
			listItems = [];
		}

		if (orderedListItems.length) {
			html.push(`<ol>${orderedListItems.map((item) => `<li>${item}</li>`).join('')}</ol>`);
			orderedListItems = [];
		}
	}

	for (const line of lines) {
		const fenceMatch = line.match(/^\s*```/u);

		if (fenceMatch) {
			if (inFence) {
				html.push(`<pre><code>${escapeHtml(fenceLines.join('\n'))}</code></pre>`);
				fenceLines = [];
				inFence = false;
			} else {
				flushParagraph();
				flushList();
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
			flushList();
			continue;
		}

		const heading = line.match(/^(#{1,6})\s+(.+)$/u);

		if (heading) {
			flushParagraph();
			flushList();
			const level = heading[1].length;
			html.push(`<h${level}>${renderInline(heading[2], options)}</h${level}>`);
			continue;
		}

		if (/^\s*[-*_]{3,}\s*$/u.test(line)) {
			flushParagraph();
			flushList();
			html.push('<hr>');
			continue;
		}

		const unorderedItem = line.match(/^\s*[-*]\s+(.+)$/u);

		if (unorderedItem) {
			flushParagraph();
			orderedListItems = [];
			listItems.push(renderInline(unorderedItem[1], options));
			continue;
		}

		const orderedItem = line.match(/^\s*\d+\.\s+(.+)$/u);

		if (orderedItem) {
			flushParagraph();
			listItems = [];
			orderedListItems.push(renderInline(orderedItem[1], options));
			continue;
		}

		const quote = line.match(/^\s*>\s?(.+)$/u);

		if (quote) {
			flushParagraph();
			flushList();
			html.push(`<blockquote>${renderInline(quote[1], options)}</blockquote>`);
			continue;
		}

		paragraphLines.push(line.trim());
	}

	if (inFence) {
		html.push(`<pre><code>${escapeHtml(fenceLines.join('\n'))}</code></pre>`);
	}

	flushParagraph();
	flushList();

	return html.join('\n');
}

function renderInline(text: string, options: PortableMarkdownOptions) {
	let rendered = escapeHtml(text);

	rendered = rendered.replace(/`([^`]+)`/gu, '<code>$1</code>');
	rendered = rendered.replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
	rendered = rendered.replace(/\*([^*]+)\*/gu, '<em>$1</em>');
	rendered = rendered.replace(/!\[([^\]]*)\]\(([^)]+)\)/gu, (_match, alt, src) => {
		return `<img alt="${escapeAttribute(alt)}" src="${escapeAttribute(src)}">`;
	});
	rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/gu, (_match, label, href) => {
		return `<a href="${escapeAttribute(href)}">${label}</a>`;
	});
	rendered = rendered.replace(/\[\[([^\]]+)\]\]/gu, (_match, linkContent) => {
		const link = toObsidianLink(linkContent, options);

		if (!link) {
			return escapeHtml(linkContent);
		}

		return `<a href="${escapeAttribute(link.href)}">${escapeHtml(link.label)}</a>`;
	});

	return rendered;
}

function toObsidianLink(linkContent: string, options: PortableMarkdownOptions) {
	const separatorIndex = linkContent.indexOf('|');
	const rawTarget = (separatorIndex >= 0 ? linkContent.slice(0, separatorIndex) : linkContent).trim();
	const alias = separatorIndex >= 0 ? linkContent.slice(separatorIndex + 1).trim() : '';
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
			href: `${targetPath}${getObsidianHash(heading)}`,
			label
		};
	}

	const notePath = resolveObsidianNotePath(normalizedTarget, options);
	const routeBase = options.routeBase ?? '';

	return {
		href: notePath ? `${joinRouteBase(routeBase, notePath)}${getObsidianHash(heading)}` : '#',
		label
	};
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
