import { joinRouteBase, toNotePath, type VaultRouteConfig } from './paths';

export type NoteTreeNode = NoteTreeDirectory | NoteTreeFile;

export type NoteTreeDirectory = {
	kind: 'directory';
	name: string;
	path: string;
	children: NoteTreeNode[];
};

export type NoteTreeFile = {
	kind: 'file';
	name: string;
	path: string;
	href: string;
};

const sortOptions = { numeric: true, sensitivity: 'base' } as const;

export function buildNoteTree(modulePaths: string[], config: VaultRouteConfig = {}) {
	const root: NoteTreeDirectory = {
		kind: 'directory',
		name: '',
		path: '',
		children: []
	};

	const directoryLookup = new Map<string, NoteTreeDirectory>([['', root]]);

	for (const modulePath of modulePaths) {
		const notePath = toNotePath(modulePath, config);

		if (!notePath) {
			continue;
		}

		const segments = notePath.displayPath.split('/');
		const fileName = segments.pop();

		if (!fileName) {
			continue;
		}

		let parent = root;
		let parentPath = '';

		for (const segment of segments) {
			parentPath = parentPath ? `${parentPath}/${segment}` : segment;

			let directory = directoryLookup.get(parentPath);

			if (!directory) {
				directory = {
					kind: 'directory',
					name: segment,
					path: parentPath,
					children: []
				};

				directoryLookup.set(parentPath, directory);
				parent.children.push(directory);
			}

			parent = directory;
		}

		parent.children.push({
			kind: 'file',
			name: fileName,
			path: notePath.routePath,
			href: joinRouteBase(config.routeBase ?? '/notes', notePath.routePath)
		});
	}

	sortTree(root.children);
	return root.children;
}

export function countNoteFiles(nodes: NoteTreeNode[]): number {
	return nodes.reduce((count, node) => {
		if (node.kind === 'file') {
			return count + 1;
		}

		return count + countNoteFiles(node.children);
	}, 0);
}

export function countNoteDirectories(nodes: NoteTreeNode[]): number {
	return nodes.reduce((count, node) => {
		if (node.kind === 'file') {
			return count;
		}

		return count + 1 + countNoteDirectories(node.children);
	}, 0);
}

function sortTree(nodes: NoteTreeNode[]) {
	nodes.sort((a, b) => {
		if (a.kind !== b.kind) {
			return a.kind === 'directory' ? -1 : 1;
		}

		return a.name.localeCompare(b.name, undefined, sortOptions);
	});

	for (const node of nodes) {
		if (node.kind === 'directory') {
			sortTree(node.children);
		}
	}
}
