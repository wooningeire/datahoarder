export const columnCollapseDuration = 220;

export const areColumnKeysEqual = (left: string[], right: string[]): boolean =>
    left.length === right.length && left.every((key, index) => key === right[index]);

export const getRemovedColumnSpace = (
    node: HTMLElement,
    nextKeySet: Set<string>,
): number => {
    const removedColumns = Array.from(node.querySelectorAll<HTMLElement>(".note-column")).filter(
        (column) => !nextKeySet.has(column.dataset.columnKey ?? ""),
    );

    if (!removedColumns.length) {
        return 0;
    }

    const firstColumnRect = removedColumns[0].getBoundingClientRect();
    const lastColumnRect = removedColumns[removedColumns.length - 1].getBoundingClientRect();
    const removedWidth = lastColumnRect.right - firstColumnRect.left;

    return Math.max(0, removedWidth + getColumnGap(node));
};

export const scrollColumnIntoView = (node: HTMLElement, active: boolean) => {
    const scroll = () => {
        if (!active) {
            return;
        }

        requestAnimationFrame(() => {
            const columns = node.closest<HTMLElement>(".note-columns");

            if (!columns) {
                return;
            }

            columns.scrollTo({
                left: getHorizontalScrollTarget(columns, node, "end"),
                behavior: "smooth",
            });
        });
    };

    scroll();

    return {
        update(nextActive: boolean) {
            active = nextActive;
            scroll();
        },
    };
};

export const scrollCurrentNote = (node: HTMLElement, active: boolean) => {
    const scroll = () => {
        if (!active) {
            return;
        }

        requestAnimationFrame(() => {
            const columns = node.closest<HTMLElement>(".note-columns");
            const scrollport = node.closest<HTMLElement>(".note-column-items") ?? columns;

            if (!columns || !scrollport) {
                return;
            }

            const nextScrollTop = Math.max(0, getVerticalScrollTarget(scrollport, node));

            if (scrollport === columns) {
                columns.scrollTo({
                    top: nextScrollTop,
                    left: getHorizontalScrollTarget(columns, node),
                    behavior: "smooth",
                });
                return;
            }

            scrollport.scrollTo({
                top: nextScrollTop,
                behavior: "smooth",
            });

            columns.scrollTo({
                left: getHorizontalScrollTarget(columns, node),
                behavior: "smooth",
            });
        });
    };

    scroll();

    return {
        update(nextActive: boolean) {
            active = nextActive;
            scroll();
        },
    };
};

const getColumnGap = (node: HTMLElement): number => {
    const gap = Number.parseFloat(window.getComputedStyle(node).columnGap);

    return Number.isFinite(gap) ? gap : 0;
};

const getHorizontalScrollTarget = (
    columns: HTMLElement,
    node: HTMLElement,
    alignment: "nearest" | "end" = "nearest",
): number => {
    const columnsRect = columns.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const inset = 8;

    if (alignment === "end") {
        return Math.max(0, columns.scrollLeft + nodeRect.right - columnsRect.right + inset);
    }

    if (nodeRect.right > columnsRect.right - inset) {
        return Math.max(0, columns.scrollLeft + nodeRect.right - columnsRect.right + inset);
    }

    if (nodeRect.left < columnsRect.left + inset) {
        return Math.max(0, columns.scrollLeft + nodeRect.left - columnsRect.left - inset);
    }

    return columns.scrollLeft;
};

const getVerticalScrollTarget = (
    scrollport: HTMLElement,
    node: HTMLElement,
): number => {
    const scrollportRect = scrollport.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();

    return (
        scrollport.scrollTop +
        nodeRect.top +
        nodeRect.height / 2 -
        (scrollportRect.top + scrollport.clientHeight / 2)
    );
};
