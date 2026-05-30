export type VaultRouteConfig = {
	rootModulePath?: string;
	routeBase?: string;
};

export const defaultVaultRouteConfig = {
	rootModulePath: '/src/lib/notes/',
	routeBase: '/notes'
} satisfies Required<VaultRouteConfig>;

export const noteExtensions = ['.md', '.svx', '.svelte', '.base'] as const;
export const compiledNoteExtensions = ['.md', '.svx', '.svelte'] as const;

export type NoteExtension = (typeof noteExtensions)[number];

const noteExtensionPattern = /\.(md|svx|svelte|base)$/u;
const compiledNoteExtensionPattern = /\.(md|svx|svelte)$/u;

export function getVaultRouteConfig(config: VaultRouteConfig = {}) {
	return {
		rootModulePath: normalizeRootModulePath(
			config.rootModulePath ?? defaultVaultRouteConfig.rootModulePath
		),
		routeBase: normalizeRouteBase(config.routeBase ?? defaultVaultRouteConfig.routeBase)
	};
}

export function normalizeRootModulePath(path: string) {
	const normalized = path.replace(/\\/gu, '/').replace(/\/+$/u, '');

	return `${normalized}/`;
}

export function normalizeRouteBase(routeBase: string) {
	if (!routeBase || routeBase === '/') {
		return '';
	}

	return `/${routeBase.replace(/^\/+|\/+$/gu, '')}`;
}

export function normalizeRoutePath(path: string | undefined) {
	return path?.replace(/^\/+|\/+$/gu, '') ?? '';
}

export function hasUnsafeSegment(path: string) {
	return path.split('/').some((segment) => segment === '.' || segment === '..');
}

export function encodeRoutePath(path: string) {
	return path.split('/').map(encodeURIComponent).join('/');
}

export function joinRouteBase(routeBase: string, path = '') {
	const normalizedBase = normalizeRouteBase(routeBase);
	const normalizedPath = normalizeRoutePath(path);

	if (!normalizedPath) {
		return normalizedBase || '/';
	}

	return `${normalizedBase}/${encodeRoutePath(normalizedPath)}`;
}

export function getNoteTitle(path: string, metadata: Record<string, unknown> = {}) {
	if (typeof metadata.title === 'string') {
		return metadata.title;
	}

	const basename = path.split('/').at(-1) ?? path;
	return basename.replace(noteExtensionPattern, '');
}

export function getCandidateModulePaths(path: string, config: VaultRouteConfig = {}) {
	const { rootModulePath } = getVaultRouteConfig(config);
	const normalizedPath = normalizeRoutePath(path);
	const basePath = `${rootModulePath}${normalizedPath}`;

	if (noteExtensions.some((extension) => normalizedPath.endsWith(extension))) {
		return [basePath];
	}

	return [
		...noteExtensions.map((extension) => `${basePath}${extension}`),
		...noteExtensions.map((extension) => `${basePath}/index${extension}`)
	];
}

export function toNotePath(modulePath: string, config: VaultRouteConfig = {}) {
	const { rootModulePath } = getVaultRouteConfig(config);
	const normalizedModulePath = modulePath.replace(/\\/gu, '/');

	if (!normalizedModulePath.startsWith(rootModulePath)) {
		return null;
	}

	const relativePath = normalizedModulePath.slice(rootModulePath.length);

	if (!noteExtensionPattern.test(relativePath)) {
		return null;
	}

	return {
		displayPath: relativePath,
		routePath: relativePath.endsWith('.base')
			? relativePath
			: relativePath.replace(compiledNoteExtensionPattern, '')
	};
}

export function getDirectoryPath(notePath: string) {
	const separatorIndex = notePath.lastIndexOf('/');

	return separatorIndex >= 0 ? notePath.slice(0, separatorIndex) : '';
}

export function stripCompiledNoteExtension(path: string) {
	return path.replace(compiledNoteExtensionPattern, '');
}

export function getNoteExtension(path: string): NoteExtension | null {
	return noteExtensions.find((extension) => path.endsWith(extension)) ?? null;
}
