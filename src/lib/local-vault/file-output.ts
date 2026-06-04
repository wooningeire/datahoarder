import {
	createLocalFile,
	normalizeLocalTextPath,
	writeLocalFile,
	type LocalDirectoryHandle,
	type LocalVaultFile
} from '../local-vault.js';

export async function writeOrCreateLocalTextFile(
	vaultHandle: LocalDirectoryHandle | null,
	files: LocalVaultFile[],
	path: string,
	content: string,
	defaultExtension = ''
) {
	if (!vaultHandle) {
		throw new Error('Open a local folder before writing files.');
	}

	const normalizedPath = normalizeLocalTextPath(path, defaultExtension);
	const existingFile = files.find((file) => file.path.toLowerCase() === normalizedPath.toLowerCase());

	if (existingFile) {
		await writeLocalFile(existingFile, content);
		return existingFile.path;
	}

	return createLocalFile(vaultHandle, normalizedPath, content, defaultExtension);
}
