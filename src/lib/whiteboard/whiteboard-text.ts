type EditableTextParams = {
    value: string,
    onchange: (value: string) => void,
};

export const editableText = (
    node: HTMLElement,
    params: EditableTextParams,
) => {
    let currentParams = params;

    const syncText = (value: string): void => {
        if (document.activeElement === node || node.textContent === value) {
            return;
        }

        node.textContent = value;
    };

    const handleInput = (): void => {
        currentParams.onchange(node.textContent ?? "");
    };

    syncText(currentParams.value);
    node.addEventListener("input", handleInput);

    return {
        update(nextParams: EditableTextParams) {
            currentParams = nextParams;
            syncText(currentParams.value);
        },
        destroy() {
            node.removeEventListener("input", handleInput);
        },
    };
};
