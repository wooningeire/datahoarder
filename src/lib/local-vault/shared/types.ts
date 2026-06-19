export type CollectionCellEdit = {
	column: string;
	recordPath: string;
	value: string;
};

export type RequestDialogInputKind = 'date' | 'number' | 'search' | 'select' | 'text';

export type RequestDialogOption = {
	label: string;
	value: string;
};

export type RequestDialogField = {
	help?: string;
	id: string;
	inputKind?: RequestDialogInputKind;
	label: string;
	options?: RequestDialogOption[];
	placeholder?: string;
	required?: boolean;
	value: string;
};

export type RequestDialogConfig = {
	description?: string;
	fields: RequestDialogField[];
	submitLabel?: string;
	title: string;
};

export type RequestDialogValues = Record<string, string>;

export type RequestTextOptions = {
	description?: string;
	inputKind?: Exclude<RequestDialogInputKind, 'select'>;
	label?: string;
	placeholder?: string;
	required?: boolean;
	submitLabel?: string;
	title: string;
	value?: string;
};

export type InlineFileCreateKind = 'collection-record' | 'drawing' | 'folder' | 'note' | 'template';

export type InlineFileCreateRequest = {
	directoryPath: string;
	extension: string;
	fileName: string;
	inputLabel: string;
	kind: InlineFileCreateKind;
	submitLabel: string;
	title: string;
};

export type InlineFileCreate = InlineFileCreateRequest & {
	id: string;
};

export type CommandPaletteItem = {
	detail: string;
	id: string;
	keywords?: string[];
	run: () => Promise<void> | void;
	title: string;
};
