// @ts-nocheck
import { readdirSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';

const markdownHtmlTags = new Set([
	'a',
	'abbr',
	'aside',
	'b',
	'blockquote',
	'br',
	'button',
	'caption',
	'cite',
	'code',
	'col',
	'colgroup',
	'dd',
	'del',
	'details',
	'div',
	'dl',
	'dt',
	'em',
	'figcaption',
	'figure',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'i',
	'iframe',
	'img',
	'input',
	'ins',
	'kbd',
	'label',
	'li',
	'main',
	'mark',
	'ol',
	'option',
	'p',
	'pre',
	's',
	'section',
	'select',
	'small',
	'span',
	'strong',
	'sub',
	'summary',
	'sup',
	'table',
	'tbody',
	'td',
	'textarea',
	'tfoot',
	'th',
	'thead',
	'tr',
	'u',
	'ul',
	'var'
]);
const noteExtensionPattern = /\.(md|svx|svelte)$/u;
const cachedObsidianNoteLookups = new Map();

export function sanitizeFrontmatterKeys() {
	return {
		name: 'sanitize-frontmatter-keys',
		markup({ content, filename }) {
			if (!/\.(md|svx)$/u.test(filename) || !content.startsWith('---')) {
				return;
			}

			const closeMarker = content.search(/\r?\n---\r?\n/u);

			if (closeMarker < 0) {
				return;
			}

			const frontmatter = content.slice(0, closeMarker);
			const body = content.slice(closeMarker);
			const usedKeys = new Set();
			const sanitizedFrontmatter = frontmatter.replace(
				/^([^#\s][^:\n]*):/gmu,
				(match, key) => `${getUniqueSafeIdentifier(key, usedKeys)}:`
			);

			if (sanitizedFrontmatter === frontmatter) {
				return;
			}

			return {
				code: `${sanitizedFrontmatter}${body}`
			};
		}
	};
}

export function normalizeMarkdownMath() {
	return {
		name: 'normalize-markdown-math',
		markup({ content, filename }) {
			if (!/\.md$/u.test(filename)) {
				return;
			}

			const normalized = normalizeDisplayMath(content);

			if (normalized === content) {
				return;
			}

			return {
				code: normalized
			};
		}
	};
}

export function normalizeObsidianLinks({ notesDirectory, routeBase = '/notes' }) {
	return {
		name: 'normalize-obsidian-links',
		markup({ content, filename }) {
			if (!/\.md$/u.test(filename)) {
				return;
			}

			const normalized = normalizeObsidianLinksContent(content, filename, {
				notesDirectory,
				routeBase
			});

			if (normalized === content) {
				return;
			}

			return {
				code: normalized
			};
		}
	};
}

export function escapeMarkdownSvelteSyntax() {
	return {
		name: 'escape-markdown-svelte-syntax',
		markup({ content, filename }) {
			if (!/\.md$/u.test(filename)) {
				return;
			}

			const escapedBody = escapeSvelteTextBraces(content);

			if (escapedBody === content) {
				return;
			}

			return {
				code: escapedBody
			};
		}
	};
}

function normalizeObsidianLinksContent(content, filename, options) {
	const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u)?.[0] ?? '';
	const currentPath = getCurrentNotePath(filename, options.notesDirectory);

	return (
		frontmatter +
		replaceObsidianLinksInMarkdown(content.slice(frontmatter.length), currentPath, options)
	);
}

function replaceObsidianLinksInMarkdown(content, currentPath, options) {
	const parts = content.split(/(\r?\n)/u);
	let normalized = '';
	let inFence = false;

	for (let index = 0; index < parts.length; index += 2) {
		const line = parts[index] ?? '';
		const newline = parts[index + 1] ?? '';
		const isFenceLine = /^\s*(`{3,}|~{3,})/u.test(line);

		normalized += inFence || isFenceLine ? line : replaceObsidianLinksInLine(line, currentPath, options);
		normalized += newline;

		if (isFenceLine) {
			inFence = !inFence;
		}
	}

	return normalized;
}

function replaceObsidianLinksInLine(line, currentPath, options) {
	let normalized = '';
	let index = 0;

	while (index < line.length) {
		const codeSpan = line.slice(index).match(/^`+/u);

		if (codeSpan) {
			const marker = codeSpan[0];
			const closeIndex = line.indexOf(marker, index + marker.length);

			if (closeIndex < 0) {
				normalized += line.slice(index);
				break;
			}

			const end = closeIndex + marker.length;
			normalized += line.slice(index, end);
			index = end;
			continue;
		}

		if (line.startsWith('[[', index) && line[index - 1] !== '!') {
			const closeIndex = line.indexOf(']]', index + 2);

			if (closeIndex < 0) {
				normalized += line.slice(index);
				break;
			}

			const replacement = toObsidianAnchor(line.slice(index + 2, closeIndex), currentPath, options);
			normalized += replacement ?? line.slice(index, closeIndex + 2);
			index = closeIndex + 2;
			continue;
		}

		normalized += line[index];
		index += 1;
	}

	return normalized;
}

function toObsidianAnchor(linkContent, currentPath, options) {
	const parsed = parseObsidianLink(linkContent);

	if (!parsed) {
		return null;
	}

	return `<a href="${escapeHtml(getObsidianHref(parsed, currentPath, options))}">${escapeHtml(parsed.label)}</a>`;
}

function parseObsidianLink(linkContent) {
	const separatorIndex = linkContent.indexOf('|');
	const rawTarget = (separatorIndex >= 0 ? linkContent.slice(0, separatorIndex) : linkContent).trim();
	const alias = separatorIndex >= 0 ? linkContent.slice(separatorIndex + 1).trim() : '';
	const headingIndex = rawTarget.indexOf('#');
	const targetPath = headingIndex >= 0 ? rawTarget.slice(0, headingIndex).trim() : rawTarget;
	const heading = headingIndex >= 0 ? rawTarget.slice(headingIndex + 1).trim() : '';
	const label = alias || getDefaultObsidianLabel(targetPath, heading);

	if (!label) {
		return null;
	}

	return {
		heading,
		label,
		targetPath
	};
}

function getDefaultObsidianLabel(targetPath, heading) {
	const normalizedTarget = normalizeObsidianTargetPath(targetPath);

	if (normalizedTarget) {
		return basename(normalizedTarget);
	}

	return heading;
}

function getObsidianHref({ targetPath, heading }, currentPath, options) {
	const externalTarget = targetPath.trim();

	if (/^(?:https?|mailto):/iu.test(externalTarget)) {
		return `${externalTarget}${getObsidianHash(heading)}`;
	}

	const notePath = resolveObsidianNotePath(targetPath, currentPath, options);
	const baseHref = notePath ? `${normalizeRouteBase(options.routeBase)}/${encodeRoutePath(notePath)}` : normalizeRouteBase(options.routeBase) || '/';

	return `${baseHref}${getObsidianHash(heading)}`;
}

function getObsidianHash(heading) {
	return heading ? `#${encodeURIComponent(heading)}` : '';
}

function resolveObsidianNotePath(targetPath, currentPath, options) {
	const normalizedTarget = normalizeObsidianTargetPath(targetPath);

	if (!normalizedTarget) {
		return currentPath;
	}

	const lookup = getObsidianNoteLookup(options.notesDirectory);
	const targetKey = normalizedTarget.toLowerCase();
	const currentDirectory = currentPath ? getDirectoryPath(currentPath) : '';

	if (!normalizedTarget.includes('/') && currentDirectory) {
		const siblingMatch = lookup.byPath.get(`${currentDirectory}/${targetKey}`.toLowerCase());

		if (siblingMatch) {
			return siblingMatch;
		}
	}

	const directMatch = lookup.byPath.get(targetKey);

	if (directMatch) {
		return directMatch;
	}

	if (!normalizedTarget.includes('/')) {
		const nameMatches = lookup.byName.get(targetKey) ?? [];
		const sameDirectoryMatch = nameMatches.find((notePath) => getDirectoryPath(notePath) === currentDirectory);
		const closestDirectoryMatch = getClosestDirectoryMatch(nameMatches, currentDirectory);

		return sameDirectoryMatch ?? closestDirectoryMatch ?? nameMatches[0] ?? normalizedTarget;
	}

	return normalizedTarget;
}

function getClosestDirectoryMatch(notePaths, currentDirectory) {
	if (!currentDirectory) {
		return null;
	}

	let bestMatch = null;
	let bestScore = -1;

	for (const notePath of notePaths) {
		const score = getSharedPathPrefixLength(getDirectoryPath(notePath), currentDirectory);

		if (score > bestScore) {
			bestMatch = notePath;
			bestScore = score;
		}
	}

	return bestMatch;
}

function getSharedPathPrefixLength(pathA, pathB) {
	const segmentsA = pathA ? pathA.toLowerCase().split('/') : [];
	const segmentsB = pathB ? pathB.toLowerCase().split('/') : [];
	let index = 0;

	while (segmentsA[index] && segmentsA[index] === segmentsB[index]) {
		index += 1;
	}

	return index;
}

function getObsidianNoteLookup(notesDirectory) {
	const cacheKey = resolve(notesDirectory);
	const cachedLookup = cachedObsidianNoteLookups.get(cacheKey);

	if (cachedLookup) {
		return cachedLookup;
	}

	const byPath = new Map();
	const byName = new Map();

	for (const filesystemPath of getNoteFiles(notesDirectory)) {
		const notePath = getRouteNotePath(filesystemPath, notesDirectory);

		if (!notePath) {
			continue;
		}

		byPath.set(notePath.toLowerCase(), notePath);

		const nameKey = basename(notePath).toLowerCase();
		const nameMatches = byName.get(nameKey) ?? [];
		nameMatches.push(notePath);
		byName.set(nameKey, nameMatches);
	}

	const lookup = { byName, byPath };
	cachedObsidianNoteLookups.set(cacheKey, lookup);
	return lookup;
}

function getNoteFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const filesystemPath = resolve(directory, entry.name);

		if (entry.isDirectory()) {
			return getNoteFiles(filesystemPath);
		}

		return entry.isFile() && noteExtensionPattern.test(entry.name) ? [filesystemPath] : [];
	});
}

function getCurrentNotePath(filename, notesDirectory) {
	return filename ? getRouteNotePath(resolve(filename), notesDirectory) : null;
}

function getRouteNotePath(filesystemPath, notesDirectory) {
	const notePath = relative(notesDirectory, filesystemPath).replace(/\\/gu, '/');

	if (notePath.startsWith('../') || notePath === '..' || !noteExtensionPattern.test(notePath)) {
		return null;
	}

	return notePath.replace(noteExtensionPattern, '');
}

function normalizeObsidianTargetPath(targetPath) {
	return targetPath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').replace(noteExtensionPattern, '');
}

function getDirectoryPath(notePath) {
	const separatorIndex = notePath.lastIndexOf('/');

	return separatorIndex >= 0 ? notePath.slice(0, separatorIndex) : '';
}

function encodeRoutePath(path) {
	return path.split('/').map(encodeURIComponent).join('/');
}

function normalizeRouteBase(routeBase) {
	if (!routeBase || routeBase === '/') {
		return '';
	}

	return `/${routeBase.replace(/^\/+|\/+$/gu, '')}`;
}

function escapeHtml(text) {
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

function normalizeDisplayMath(content) {
	const newline = content.includes('\r\n') ? '\r\n' : '\n';
	const lines = content.split(/\r?\n/u);
	const normalizedLines = [];
	let inFence = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const fenceMatch = line.match(/^\s*(```|~~~)/u);

		if (fenceMatch) {
			inFence = !inFence;
			normalizedLines.push(line);
			continue;
		}

		if (inFence) {
			normalizedLines.push(line);
			continue;
		}

		let currentLine = line;
		let normalizedLine = '';

		while (true) {
			const openIndex = currentLine.indexOf('$$');

			if (openIndex < 0) {
				normalizedLine += currentLine;
				break;
			}

			const closeIndex = currentLine.indexOf('$$', openIndex + 2);

			if (closeIndex >= 0) {
				normalizedLine +=
					currentLine.slice(0, openIndex) +
					toDisplayMath(currentLine.slice(openIndex + 2, closeIndex).trim());
				currentLine = currentLine.slice(closeIndex + 2);
				continue;
			}

			const mathLines = [currentLine.slice(openIndex + 2)];
			let suffix = '';
			let foundClose = false;
			let closeLineIndex = index + 1;

			for (; closeLineIndex < lines.length; closeLineIndex += 1) {
				const mathLine = lines[closeLineIndex] ?? '';
				const mathCloseIndex = mathLine.indexOf('$$');

				if (mathCloseIndex >= 0) {
					mathLines.push(mathLine.slice(0, mathCloseIndex));
					suffix = mathLine.slice(mathCloseIndex + 2);
					foundClose = true;
					break;
				}

				mathLines.push(mathLine);
			}

			if (!foundClose) {
				normalizedLine += currentLine;
				break;
			}

			normalizedLine +=
				currentLine.slice(0, openIndex) + toDisplayMath(mathLines.join('\n').trim());
			currentLine = suffix;
			index = closeLineIndex;
		}

		normalizedLines.push(normalizedLine);
	}

	return normalizedLines.join(newline);
}

function toDisplayMath(math) {
	return `<span class="math-display">${encodeMathText(`\\[\n${math}\n\\]`)}</span>`;
}

function encodeMathText(text) {
	return Array.from(text)
		.map((character) => `&#${character.codePointAt(0)};`)
		.join('');
}

function escapeSvelteTextBraces(content) {
	let escaped = '';
	let index = 0;
	let inTag = false;

	while (index < content.length) {
		const rawElement = getRawElementAt(content, index);

		if (rawElement) {
			escaped += rawElement.content;
			index = rawElement.end;
			continue;
		}

		const character = content[index];

		if (character === '<') {
			if (!isTagStartAt(content, index)) {
				escaped += '&lt;';
				index += 1;
				continue;
			}

			inTag = true;
			escaped += character;
			index += 1;
			continue;
		}

		if (character === '>' && inTag) {
			inTag = false;
			escaped += character;
			index += 1;
			continue;
		}

		if (!inTag && (character === '{' || character === '}')) {
			escaped += character === '{' ? '&#123;' : '&#125;';
			index += 1;
			continue;
		}

		escaped += character;
		index += 1;
	}

	return escaped;
}

function getRawElementAt(content, index) {
	const remaining = content.slice(index).toLowerCase();
	const tagName = /^<script(?:[\s>/]|$)/u.test(remaining)
		? 'script'
		: /^<style(?:[\s>/]|$)/u.test(remaining)
			? 'style'
			: null;

	if (!tagName) {
		return null;
	}

	const closeTag = `</${tagName}>`;
	const closeIndex = content.toLowerCase().indexOf(closeTag, index);

	if (closeIndex < 0) {
		return null;
	}

	const end = closeIndex + closeTag.length;

	return {
		content: content.slice(index, end),
		end
	};
}

function isTagStartAt(content, index) {
	const remaining = content.slice(index);
	const closeTag = remaining.match(/^<\/([A-Za-z][A-Za-z0-9:.-]*)\s*>/u);

	if (remaining.startsWith('<!--') || /^<[!?]/u.test(remaining)) {
		return true;
	}

	if (closeTag) {
		return markdownHtmlTags.has(closeTag[1].toLowerCase());
	}

	const openTag = remaining.match(/^<([A-Za-z][A-Za-z0-9:.-]*)([\s>/]?)/u);

	if (!openTag || !markdownHtmlTags.has(openTag[1].toLowerCase())) {
		return false;
	}

	const afterTagName = remaining.slice(openTag[0].length);

	if (openTag[2] === '>' || openTag[2] === '/') {
		return true;
	}

	if (!openTag[2]) {
		return false;
	}

	const nextAttributeCharacter = afterTagName.trimStart()[0];

	return (
		!nextAttributeCharacter ||
		nextAttributeCharacter === '>' ||
		nextAttributeCharacter === '/' ||
		/[A-Za-z_:@]/u.test(nextAttributeCharacter)
	);
}

function getUniqueSafeIdentifier(key, usedKeys) {
	const safeKey = toSafeIdentifier(key.trim());
	let uniqueKey = safeKey;
	let suffix = 2;

	while (usedKeys.has(uniqueKey)) {
		uniqueKey = `${safeKey}_${suffix}`;
		suffix += 1;
	}

	usedKeys.add(uniqueKey);
	return uniqueKey;
}

function toSafeIdentifier(key) {
	const identifier = key.replace(/[^A-Za-z0-9_$]/gu, '_').replace(/_+/gu, '_');
	const safeIdentifier = /^[A-Za-z_$]/u.test(identifier) ? identifier : `_${identifier}`;

	if (reservedWords.has(safeIdentifier)) {
		return `${safeIdentifier}_`;
	}

	return safeIdentifier;
}

const reservedWords = new Set([
	'arguments',
	'await',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'eval',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'function',
	'if',
	'import',
	'in',
	'instanceof',
	'let',
	'new',
	'null',
	'return',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'typeof',
	'var',
	'void',
	'while',
	'with',
	'yield'
]);
