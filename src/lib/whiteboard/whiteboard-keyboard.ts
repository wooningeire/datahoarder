import { keyToTool } from "./whiteboard-geometry.js";
import type { WhiteboardTool } from "./whiteboard.js";

type WhiteboardKeyboardContext = {
    clearInteraction: () => void,
    deleteSelected: () => void,
    fitToItems: () => void,
    selectTool: (tool: WhiteboardTool) => void,
};

export const createWhiteboardKeydownHandler = (context: WhiteboardKeyboardContext) => {
    return (event: KeyboardEvent): void => {
        const target = event.target as HTMLElement;

        if (target.closest("[contenteditable=\"true\"]")) {
            return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
            context.deleteSelected();
            event.preventDefault();
            return;
        }

        if (event.key === "Escape") {
            context.clearInteraction();
            event.preventDefault();
            return;
        }

        if (event.key === "0") {
            context.fitToItems();
            event.preventDefault();
            return;
        }

        const tool = keyToTool(event.key);

        if (tool) {
            context.selectTool(tool);
            event.preventDefault();
        }
    };
};
