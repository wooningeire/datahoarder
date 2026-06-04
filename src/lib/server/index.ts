import { resolve, sep } from 'node:path';
import {
	getCandidateModulePaths,
	getVaultRouteConfig,
	normalizeRoutePath,
	type VaultRouteConfig
} from '../vault/paths.js';

type ModuleMap = Record<string, unknown>;

export function findVaultModulePath(
	path: string,
	moduleMaps: ModuleMap[],
	config: VaultRouteConfig = {}
) {
	return getCandidateModulePaths(path, config).find((candidate) =>
		moduleMaps.some((moduleMap) => candidate in moduleMap)
	);
}

export function modulePathToVaultFilesystemPath(
	modulePath: string,
	filesystemRoot: string,
	config: VaultRouteConfig = {}
) {
	const { rootModulePath } = getVaultRouteConfig(config);

	if (!modulePath.startsWith(rootModulePath)) {
		return null;
	}

	const relativePath = normalizeRoutePath(modulePath.slice(rootModulePath.length));
	const filesystemPath = resolve(filesystemRoot, ...relativePath.split('/'));
	const root = resolve(filesystemRoot);

	if (filesystemPath !== root && !filesystemPath.startsWith(`${root}${sep}`)) {
		return null;
	}

	return filesystemPath;
}
