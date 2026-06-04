export type CollectionCellEdit = {
	column: string;
	recordPath: string;
	value: string;
};

export type CommandPaletteItem = {
	detail: string;
	id: string;
	keywords?: string[];
	run: () => Promise<void> | void;
	title: string;
};
