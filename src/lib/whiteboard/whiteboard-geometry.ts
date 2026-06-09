import {
    createWhiteboardItemId,
    type WhiteboardDrawingItem,
    type WhiteboardItem,
    type WhiteboardPoint,
    type WhiteboardShapeKind,
    type WhiteboardShapeItem,
    type WhiteboardTextItem,
    type WhiteboardTool,
} from "./whiteboard.js";

export const resizeDirections = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

export const gridSize = 32;
export const majorGridSize = 160;
export const minItemSize = 48;
export const defaultStroke = "oklch(0.4 0.16 248)";

export type ResizeDirection = (typeof resizeDirections)[number];

export type WhiteboardInteraction =
    | {
        kind: "pan",
        pointerId: number,
        startX: number,
        startY: number,
        originX: number,
        originY: number,
    }
    | {
        kind: "move",
        pointerId: number,
        id: string,
        start: WhiteboardPoint,
        originX: number,
        originY: number,
    }
    | {
        kind: "resize",
        pointerId: number,
        id: string,
        direction: ResizeDirection,
        start: WhiteboardPoint,
        originX: number,
        originY: number,
        originWidth: number,
        originHeight: number,
    }
    | {
        kind: "draw",
        pointerId: number,
    };

export type DraftDrawing = {
    id: string,
    points: WhiteboardPoint[],
    stroke: string,
    strokeWidth: number,
};

export const createDraftDrawing = (point: WhiteboardPoint): DraftDrawing => ({
    id: createWhiteboardItemId("drawing"),
    points: [point],
    stroke: defaultStroke,
    strokeWidth: 4,
});

export const createTextItem = (point: WhiteboardPoint): WhiteboardTextItem => ({
    kind: "text",
    id: createWhiteboardItemId("text"),
    x: point.x,
    y: point.y,
    width: 240,
    height: 116,
    text: "New note",
    background: "oklch(0.98 0.04 95)",
    color: "oklch(0.24 0.04 260)",
});

export const createShapeItem = (
    shape: WhiteboardShapeKind,
    point: WhiteboardPoint,
): WhiteboardShapeItem => ({
    kind: "shape",
    id: createWhiteboardItemId(shape),
    x: point.x,
    y: point.y,
    width: 180,
    height: 112,
    shape,
    label: "Shape",
    fill: getShapeFill(shape),
    stroke: getShapeStroke(shape),
    strokeWidth: 2,
});

export const normalizeDrawing = (drawing: DraftDrawing): WhiteboardDrawingItem => {
    const xs = drawing.points.map((point) => point.x);
    const ys = drawing.points.map((point) => point.y);
    const pad = drawing.strokeWidth / 2 + 4;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad;
    const maxY = Math.max(...ys) + pad;

    return {
        kind: "drawing",
        id: drawing.id,
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        points: drawing.points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
        stroke: drawing.stroke,
        strokeWidth: drawing.strokeWidth,
    };
};

export const drawingPoints = (points: WhiteboardPoint[]): string =>
    points.map((point) => `${point.x},${point.y}`).join(" ");

export const diamondPoints = (item: { width: number, height: number }): string =>
    `${item.width / 2},0 ${item.width},${item.height / 2} ${item.width / 2},${item.height} 0,${item.height / 2}`;

export const getItemsBounds = (nextItems: WhiteboardItem[]) => {
    const xs = nextItems.flatMap((item) => [item.x, item.x + item.width]);
    const ys = nextItems.flatMap((item) => [item.y, item.y + item.height]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
        x,
        y,
        width: Math.max(1, maxX - x),
        height: Math.max(1, maxY - y),
    };
};

export const resizeBox = (
    resize: Extract<WhiteboardInteraction, { kind: "resize" }>,
    dx: number,
    dy: number,
) => {
    const next = {
        x: resize.originX,
        y: resize.originY,
        width: resize.originWidth,
        height: resize.originHeight,
    };

    if (resize.direction.includes("e")) {
        next.width = Math.max(minItemSize, resize.originWidth + dx);
    }

    if (resize.direction.includes("s")) {
        next.height = Math.max(minItemSize, resize.originHeight + dy);
    }

    if (resize.direction.includes("w")) {
        next.width = Math.max(minItemSize, resize.originWidth - dx);
        next.x = resize.originX + resize.originWidth - next.width;
    }

    if (resize.direction.includes("n")) {
        next.height = Math.max(minItemSize, resize.originHeight - dy);
        next.y = resize.originY + resize.originHeight - next.height;
    }

    return next;
};

export const getShapeFill = (shape: WhiteboardShapeKind): string => {
    if (shape === "ellipse") {
        return "oklch(0.91 0.08 175)";
    }

    if (shape === "diamond") {
        return "oklch(0.92 0.07 320)";
    }

    return "oklch(0.95 0.06 72)";
};

export const getShapeStroke = (shape: WhiteboardShapeKind): string => {
    if (shape === "ellipse") {
        return "oklch(0.45 0.12 175)";
    }

    if (shape === "diamond") {
        return "oklch(0.5 0.13 320)";
    }

    return "oklch(0.51 0.12 62)";
};

export const isShapeTool = (tool: WhiteboardTool): tool is WhiteboardShapeKind =>
    tool === "rectangle" || tool === "ellipse" || tool === "diamond";

export const keyToTool = (key: string): WhiteboardTool | null => {
    const tools: Record<string, WhiteboardTool> = {
        v: "select",
        h: "pan",
        t: "text",
        r: "rectangle",
        e: "ellipse",
        d: "diamond",
        p: "pen",
    };

    return tools[key] ?? null;
};

export const getResizeLabel = (direction: ResizeDirection): string => {
    const names: Record<ResizeDirection, string> = {
        nw: "Resize from top left",
        n: "Resize from top",
        ne: "Resize from top right",
        e: "Resize from right",
        se: "Resize from bottom right",
        s: "Resize from bottom",
        sw: "Resize from bottom left",
        w: "Resize from left",
    };

    return names[direction];
};

export const getCursorClass = (
    tool: WhiteboardTool,
    interaction: WhiteboardInteraction | null,
): string => {
    if (tool === "pan") {
        return interaction?.kind === "pan" ? "cursor-grabbing" : "cursor-grab";
    }

    if (tool === "pen") {
        return "cursor-crosshair";
    }

    if (tool === "select") {
        return interaction?.kind === "pan" ? "cursor-grabbing" : "";
    }

    return "cursor-copy";
};

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
