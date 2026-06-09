import type {
    WhiteboardPoint,
    WhiteboardViewport,
} from "./whiteboard.js";

export const getWorldPoint = (
    event: PointerEvent | WheelEvent,
    viewportElement: HTMLElement | null,
    viewport: WhiteboardViewport,
): WhiteboardPoint => {
    const rect = viewportElement?.getBoundingClientRect();

    if (!rect) {
        return { x: 0, y: 0 };
    }

    return {
        x: (event.clientX - rect.left - viewport.x) / viewport.scale,
        y: (event.clientY - rect.top - viewport.y) / viewport.scale,
    };
};
