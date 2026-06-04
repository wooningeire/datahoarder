import {
	getLocalRoutePath,
	normalizeLocalTextPath,
	type LocalVaultFile
} from '../vault/local-files.js';

export function getAvailableNotePath(files: LocalVaultFile[], basePath: string) {
	const normalizedBasePath = normalizeLocalTextPath(basePath, '.md');
	const existingPaths = new Set(files.map((file) => file.path.toLowerCase()));
	const existingRoutePaths = new Set(files.map((file) => file.routePath.toLowerCase()));

	if (
		!existingPaths.has(normalizedBasePath.toLowerCase()) &&
		!existingRoutePaths.has(getLocalRoutePath(normalizedBasePath).toLowerCase())
	) {
		return normalizedBasePath;
	}

	const extensionIndex = normalizedBasePath.lastIndexOf('.');
	const stem = extensionIndex > 0 ? normalizedBasePath.slice(0, extensionIndex) : normalizedBasePath;
	const extension = extensionIndex > 0 ? normalizedBasePath.slice(extensionIndex) : '.md';

	for (let index = 2; index < 1000; index += 1) {
		const candidate = `${stem} ${index}${extension}`;

		if (
			!existingPaths.has(candidate.toLowerCase()) &&
			!existingRoutePaths.has(getLocalRoutePath(candidate).toLowerCase())
		) {
			return candidate;
		}
	}

	return normalizedBasePath;
}

export function assertNoManagedPathCollision(files: LocalVaultFile[], path: string, currentPath = '') {
	const normalizedPath = path.toLowerCase();
	const normalizedRoutePath = getLocalRoutePath(path).toLowerCase();
	const normalizedCurrentPath = currentPath.toLowerCase();

	for (const file of files) {
		if (file.path.toLowerCase() === normalizedCurrentPath) {
			continue;
		}

		if (
			file.path.toLowerCase() === normalizedPath ||
			file.routePath.toLowerCase() === normalizedRoutePath
		) {
			throw new Error(`A managed file already exists at ${file.path}.`);
		}
	}
}
