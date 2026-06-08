import type {
    CollectionFieldDerive,
    CollectionFieldDeriveContext,
    CollectionSource,
    CollectionSummaryDefinition,
    CollectionView,
} from "./types.js";

export type CollectionFieldInput = string | CollectionFieldInputObject;

export interface CollectionSchemaInput {
    [key: string]: CollectionFieldInput;
}

export type CollectionFieldInputObject = {
    derive?: CollectionFieldDerive;
    fields?: CollectionSchemaInput;
    formula?: string;
    options?: string[];
    readOnly?: boolean;
    type?: string;
};

export type TypeScriptCollectionInput = {
    name?: string;
    readOnly?: boolean;
    schema?: CollectionSchemaInput;
    source?: Partial<CollectionSource>;
    summaries?: Partial<CollectionSummaryDefinition>[];
    views?: Partial<CollectionView>[];
};

export const collection = (definition: TypeScriptCollectionInput) => definition;

export const textField = () => field("text");

export const numberField = () => field("number");

export const booleanField = () => field("boolean");

export const enumField = (options: string[]) => ({
    ...field("enum"),
    options,
});

export const objectField = (fields: CollectionSchemaInput) => ({
    fields,
    type: "object",
});

export const derived = (
    derive: CollectionFieldDerive,
    options: {
        type?: string;
    } = {},
) => ({
    derive,
    readOnly: true,
    type: options.type ?? "computed",
});

export const value = (context: CollectionFieldDeriveContext, path: string) => context.value(path);

const field = (type: string) => ({
    type,
});
