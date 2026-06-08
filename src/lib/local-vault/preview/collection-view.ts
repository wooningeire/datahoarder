import {
	getCollectionField,
	isComputedCollectionColumn,
	type ResolvedCollection
} from '../../collections/index.js';

export function getCollectionViewDefaultsKey(collection: ResolvedCollection) {
	return [
		collection.definition.path,
		collection.viewIndex,
		collection.view.filter,
		collection.view.sortColumn,
		collection.view.sortDirection
	].join('\0');
}

export function getCollectionViewSortColumn(collection: ResolvedCollection) {
	return collection.view.sortColumn && collection.columns.includes(collection.view.sortColumn)
		? collection.view.sortColumn
		: 'title';
}

export function getCollectionSortIndicator(column: string, sortColumn: string, sortDirection: 'asc' | 'desc') {
	if (sortColumn !== column) {
		return '';
	}

	return sortDirection;
}

export function getCollectionColumnLabel(column: string) {
	return column.replace(/[-_]+/gu, ' ').replace(/\b\w/gu, (character) => character.toUpperCase());
}

export function getCollectionCellInputKind(
	collection: ResolvedCollection | null,
	column: string,
	currentValue = ''
) {
	const type = collection ? (getCollectionField(collection.definition, column)?.type.toLowerCase() ?? '') : '';
	const options = getCollectionCellOptions(collection, column, currentValue);

	if (options.length || type === 'select') {
		return 'select';
	}

	if (type === 'number' || type === 'integer' || type === 'float') {
		return 'number';
	}

	if (type === 'date') {
		return 'date';
	}

	if (type === 'boolean' || type === 'bool') {
		return 'boolean';
	}

	return 'text';
}

export function getCollectionCellOptions(
	collection: ResolvedCollection | null,
	column: string,
	currentValue = ''
) {
	const field = collection ? getCollectionField(collection.definition, column) : null;
	const options = field?.options ?? [];
	const value = currentValue.trim();

	if (!options.length) {
		return [];
	}

	return value && !options.some((option) => option.toLowerCase() === value.toLowerCase())
		? [value, ...options]
		: options;
}

export function isEditableCollectionColumn(collection: ResolvedCollection | null, column: string) {
	return (
		!collection?.definition.readOnly &&
		![
			'basename',
			'file.ctime',
			'file.folder',
			'file.mtime',
			'file.name',
			'file.path',
			'file.size',
			'folder',
			'path',
			'preview',
			'size',
			'tags',
			'title',
			'updatedat'
		].includes(column.toLowerCase()) &&
		(!collection || !isComputedCollectionColumn(collection.definition, column))
	);
}

export function hasOwnCaseInsensitiveProperty(properties: Record<string, unknown>, key: string) {
	const normalizedKey = key.trim().toLowerCase();

	return Object.keys(properties).some((propertyKey) => propertyKey.trim().toLowerCase() === normalizedKey);
}
