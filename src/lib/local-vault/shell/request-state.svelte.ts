import type {
    InlineFileCreate,
    InlineFileCreateRequest,
    RequestDialogConfig,
    RequestDialogValues,
    RequestTextOptions,
} from "../shared/types.js";

type ActiveInputRequest = {
    config: RequestDialogConfig,
    resolve: (values: RequestDialogValues | null) => void,
    values: RequestDialogValues,
};

type ActiveInlineFileCreate = {
    id: string,
    request: InlineFileCreateRequest,
    fileName: string,
    resolve: (fileName: string | null) => void,
};

type ShellRequestStateOptions = {
    clearVaultSearchQuery: () => void,
};

export class ShellRequestState {
    inputRequest = $state<ActiveInputRequest | null>(null);
    inlineFileCreate = $state<ActiveInlineFileCreate | null>(null);
    #inlineFileCreateSequence = 0;
    #options: ShellRequestStateOptions;

    constructor(options: ShellRequestStateOptions) {
        this.#options = options;
    }

    requestForm = (config: RequestDialogConfig): Promise<RequestDialogValues | null> => {
        this.inputRequest?.resolve(null);
        this.inlineFileCreate?.resolve(null);
        this.inlineFileCreate = null;

        return new Promise<RequestDialogValues | null>((resolve) => {
            this.inputRequest = {
                config,
                resolve,
                values: Object.fromEntries(config.fields.map((field) => [field.id, field.value])),
            };
        });
    };

    requestText = async (options: RequestTextOptions): Promise<string | null> => {
        const result = await this.requestForm({
            description: options.description,
            fields: [
                {
                    id: "value",
                    inputKind: options.inputKind ?? "text",
                    label: options.label ?? options.title,
                    placeholder: options.placeholder,
                    required: options.required,
                    value: options.value ?? "",
                },
            ],
            submitLabel: options.submitLabel,
            title: options.title,
        });

        return result?.value ?? null;
    };

    requestInlineFileCreate = (request: InlineFileCreateRequest): Promise<string | null> => {
        this.inputRequest?.resolve(null);
        this.inputRequest = null;
        this.inlineFileCreate?.resolve(null);
        this.#options.clearVaultSearchQuery();

        return new Promise<string | null>((resolve) => {
            this.#inlineFileCreateSequence += 1;
            this.inlineFileCreate = {
                fileName: getInlineFileCreateStem(request.fileName, request.extension),
                id: `inline-file-create-${this.#inlineFileCreateSequence}`,
                request,
                resolve,
            };
        });
    };

    updateInputRequestValue = (id: string, value: string): void => {
        if (!this.inputRequest) {
            return;
        }

        this.inputRequest = {
            ...this.inputRequest,
            values: {
                ...this.inputRequest.values,
                [id]: value,
            },
        };
    };

    cancelInputRequest = (): void => {
        const activeRequest = this.inputRequest;

        if (!activeRequest) {
            return;
        }

        this.inputRequest = null;
        activeRequest.resolve(null);
    };

    submitInputRequest = (values: RequestDialogValues): void => {
        const activeRequest = this.inputRequest;

        if (!activeRequest) {
            return;
        }

        this.inputRequest = null;
        activeRequest.resolve(values);
    };

    getInlineFileCreateProps = (): InlineFileCreate | null => {
        if (!this.inlineFileCreate) {
            return null;
        }

        return {
            ...this.inlineFileCreate.request,
            fileName: this.inlineFileCreate.fileName,
            id: this.inlineFileCreate.id,
        };
    };

    updateInlineFileCreateName = (fileName: string): void => {
        if (!this.inlineFileCreate) {
            return;
        }

        this.inlineFileCreate = {
            ...this.inlineFileCreate,
            fileName,
        };
    };

    cancelInlineFileCreate = (): void => {
        const activeRequest = this.inlineFileCreate;

        if (!activeRequest) {
            return;
        }

        this.inlineFileCreate = null;
        activeRequest.resolve(null);
    };

    submitInlineFileCreate = (): void => {
        const activeRequest = this.inlineFileCreate;

        if (!activeRequest) {
            return;
        }

        this.inlineFileCreate = null;
        activeRequest.resolve(activeRequest.fileName);
    };
}

export const createShellRequestState = (
    options: ShellRequestStateOptions,
): ShellRequestState => new ShellRequestState(options);

const getInlineFileCreateStem = (fileName: string, extension: string): string => {
    const normalizedExtension = extension.trim();

    if (!normalizedExtension) {
        return fileName;
    }

    return fileName.toLowerCase().endsWith(normalizedExtension.toLowerCase())
        ? fileName.slice(0, -normalizedExtension.length)
        : fileName;
};
