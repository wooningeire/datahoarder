export function downloadTextFile(fileName: string, content: string, type: string) {
	const blob = new Blob([content], { type });
	const url = window.URL.createObjectURL(blob);
	const anchor = document.createElement('a');

	anchor.href = url;
	anchor.download = fileName;
	anchor.rel = 'noopener';
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	window.URL.revokeObjectURL(url);
}

export function slugifyDownloadName(name: string) {
	const slug = name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');

	return slug || 'collection';
}
