import {
    filterCollectionRecords,
    getCollectionTimelineItems,
    getCollectionViewDateField,
    getCollectionViewGroupBy,
    groupCollectionRecordsForKanban,
    isDatahoarderCollectionFile,
    isObsidianBaseFile,
    resolveDatahoarderCollection,
    resolveObsidianBaseCollection,
    sortCollectionRecords,
    sortCollectionRecordsForTimeline,
    summarizeCollectionRecords,
    type ResolvedCollection,
} from "../../collections/index.js";
import type { LocalVaultFile } from "../../vault/local-files.js";
import type { VaultIndex } from "../../vault/index.js";

export {
    getCollectionRecordCreationError,
    getCollectionViewDateField,
    getCollectionViewGroupBy,
    isDatahoarderCollectionFile,
    isObsidianBaseFile,
    type ResolvedCollection,
} from "../../collections/index.js";

export const resolveSelectedCollection = (
    selectedFile: LocalVaultFile | null,
    selectedContent: string,
    vaultIndex: VaultIndex,
    selectedCollectionViewIndex: number,
): ResolvedCollection | null => {
    if (!selectedFile) {
        return null;
    }

    if (isDatahoarderCollectionFile(selectedFile.path)) {
        return resolveDatahoarderCollection(
            selectedContent,
            selectedFile.path,
            vaultIndex,
            selectedCollectionViewIndex,
        );
    }

    if (isObsidianBaseFile(selectedFile.path)) {
        return resolveObsidianBaseCollection(
            selectedContent,
            selectedFile.path,
            vaultIndex,
            selectedCollectionViewIndex,
        );
    }

    return null;
};

export const getCollectionRecordsForView = (
    selectedCollection: ResolvedCollection | null,
    collectionFilter: string,
    collectionSortColumn: string,
    collectionSortDirection: "asc" | "desc",
    collectionTimelineDateField: string,
) => {
    if (!selectedCollection) {
        return [];
    }

    const filteredRecords = filterCollectionRecords(
        selectedCollection.records,
        collectionFilter,
        selectedCollection.columns,
    );

    if (selectedCollection.view.type.toLowerCase() === "timeline") {
        return sortCollectionRecordsForTimeline(filteredRecords, collectionTimelineDateField);
    }

    const sortColumn = selectedCollection.columns.includes(collectionSortColumn)
        ? collectionSortColumn
        : (selectedCollection.columns[0] ?? "title");

    return sortCollectionRecords(filteredRecords, sortColumn, collectionSortDirection);
};

export const getKanbanGroupsForView = (
    selectedCollection: ResolvedCollection | null,
    collectionRecords: ReturnType<typeof getCollectionRecordsForView>,
    collectionKanbanGroupBy: string,
) => selectedCollection?.view.type.toLowerCase() === "kanban"
    ? groupCollectionRecordsForKanban(collectionRecords, collectionKanbanGroupBy)
    : [];

export const getTimelineItemsForView = (
    selectedCollection: ResolvedCollection | null,
    collectionRecords: ReturnType<typeof getCollectionRecordsForView>,
    collectionTimelineDateField: string,
) => selectedCollection?.view.type.toLowerCase() === "timeline"
    ? getCollectionTimelineItems(collectionRecords, collectionTimelineDateField)
    : [];

export const getCollectionSummariesForView = (
    selectedCollection: ResolvedCollection | null,
    collectionRecords: ReturnType<typeof getCollectionRecordsForView>,
) => selectedCollection
    ? summarizeCollectionRecords(collectionRecords, selectedCollection.definition.summaries)
    : [];
