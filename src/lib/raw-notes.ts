export function isExcalidrawNote(content: string) {
	return /(?:^|\r?\n)excalidraw-plugin:/u.test(content);
}

export function getRawPreview(content: string) {
	const body = stripFrontmatter(content).trim();
	const drawingIndex = body.search(/^## Drawing\s*$/mu);
	const preview = drawingIndex >= 0 ? body.slice(0, drawingIndex).trim() : body;

	return preview || 'Excalidraw drawing';
}

export function stripFrontmatter(content: string) {
	return content.replace(/^---\s*[\s\S]*?\r?\n---\s*/u, '');
}
