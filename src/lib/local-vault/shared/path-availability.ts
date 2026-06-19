import {
	getLocalRoutePath,
	normalizeLocalDirectoryPath,
	normalizeLocalTextPath,
	type LocalVaultDirectory,
	type LocalVaultFile
} from '../../vault/local-files.js';

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

export function getAvailableFolderPath(
	files: LocalVaultFile[],
	directories: LocalVaultDirectory[],
	basePath: string
) {
	const normalizedBasePath = normalizeLocalDirectoryPath(basePath);
	const existingPaths = getExistingFolderCollisionPaths(files, directories);

	if (!existingPaths.has(normalizedBasePath.toLowerCase())) {
		return normalizedBasePath;
	}

	for (let index = 2; index < 1000; index += 1) {
		const candidate = `${normalizedBasePath} ${index}`;

		if (!existingPaths.has(candidate.toLowerCase())) {
			return candidate;
		}
	}

	return normalizedBasePath;
}

export function assertNoManagedFolderPathCollision(
	files: LocalVaultFile[],
	directories: LocalVaultDirectory[],
	path: string
) {
	const normalizedPath = path.toLowerCase();

	for (const file of files) {
		if (file.path.toLowerCase() === normalizedPath) {
			throw new Error(`A managed file already exists at ${file.path}.`);
		}
	}

	for (const directory of directories) {
		if (directory.path.toLowerCase() === normalizedPath) {
			throw new Error(`A folder already exists at ${directory.path}.`);
		}
	}
}

function getExistingFolderCollisionPaths(
	files: LocalVaultFile[],
	directories: LocalVaultDirectory[]
) {
	return new Set([
		...files.map((file) => file.path.toLowerCase()),
		...directories.map((directory) => directory.path.toLowerCase())
	]);
}
