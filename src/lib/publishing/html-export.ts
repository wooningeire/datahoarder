import {
    formatCollectionRecordValue,
    getCollectionTimelineItems,
    getCollectionViewDateField,
    getCollectionViewGroupBy,
    groupCollectionRecordsForKanban,
    type CollectionSummaryResult,
    type CollectionView,
} from "../collections/index.js";
import type { VaultRecord } from "../vault/index.js";
import { standaloneHtmlCss } from "./html-export-styles.js";

export type StandaloneHtmlDocumentOptions = {
    bodyHtml: string,
    sourcePath?: string,
    subtitle?: string,
    title: string,
};

export const createStandaloneHtmlDocument = ({
    bodyHtml,
    sourcePath = "",
    subtitle = "Datahoarder export",
    title,
}: StandaloneHtmlDocumentOptions) => {
    return [
        "<!doctype html>",
        "<html lang=\"en\">",
        "<head>",
        "<meta charset=\"utf-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        `<title>${escapeHtml(title)}</title>`,
        `<style lang="scss">${standaloneHtmlCss}</style>`,
        "</head>",
        "<body>",
        "<main>",
        "<header>",
        `<p>${escapeHtml(subtitle)}</p>`,
        `<h1>${escapeHtml(title)}</h1>`,
        sourcePath ? `<span>${escapeHtml(sourcePath)}</span>` : "",
        "</header>",
        `<article>${bodyHtml}</article>`,
        "</main>",
        "</body>",
        "</html>",
    ].filter(Boolean).join("\n");
};

export const renderCollectionTableHtml = (records: VaultRecord[], columns: string[]) => {
    const headerHtml = columns.map((column) => `<th>${escapeHtml(getColumnLabel(column))}</th>`).join("");
    const bodyHtml = records.map((record) => {
        const cells = columns
            .map((column) => `<td>${escapeHtml(formatCollectionRecordValue(record, column))}</td>`)
            .join("");

        return `<tr>${cells}</tr>`;
    }).join("\n");

    return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
};

export const renderCollectionSummariesHtml = (summaries: CollectionSummaryResult[]) => {
    if (!summaries.length) {
        return "";
    }

    const summaryHtml = summaries.map((summary) => {
        const items = summary.items.map((item) => {
            return `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></li>`;
        }).join("");

        return [
            "<section class=\"collection-summary\">",
            `<span>${escapeHtml(summary.label)}</span>`,
            `<strong>${escapeHtml(summary.value)}</strong>`,
            items ? `<ul>${items}</ul>` : "",
            "</section>",
        ].filter(Boolean).join("");
    }).join("");

    return `<div class="collection-summary-grid">${summaryHtml}</div>`;
};

export const renderCollectionKanbanHtml = (records: VaultRecord[], columns: string[], view: CollectionView) => {
    const groupBy = getCollectionViewGroupBy(view);
    const displayColumns = columns.filter((column) => !["title", groupBy].includes(column.toLowerCase()));
    const lanes = groupCollectionRecordsForKanban(records, groupBy).map((group) => {
        const cards = group.records.map((record) => {
            const fields = displayColumns.map((column) => {
                const value = formatCollectionRecordValue(record, column);

                return value
                    ? `<li><span>${escapeHtml(getColumnLabel(column))}</span><strong>${escapeHtml(value)}</strong></li>`
                    : "";
            }).filter(Boolean).join("");

            return [
                "<article class=\"kanban-card\">",
                `<h2>${escapeHtml(formatCollectionRecordValue(record, "title"))}</h2>`,
                fields ? `<ul>${fields}</ul>` : "",
                "</article>",
            ].filter(Boolean).join("");
        }).join("\n");

        return [
            "<section class=\"kanban-lane\">",
            `<h2>${escapeHtml(group.label)}</h2>`,
            `<p>${group.records.length} records</p>`,
            cards || "<p>No records.</p>",
            "</section>",
        ].join("");
    }).join("\n");

    return `<div class="kanban-board">${lanes || "<p>No records.</p>"}</div>`;
};

export const renderCollectionTimelineHtml = (records: VaultRecord[], columns: string[], view: CollectionView) => {
    const dateField = getCollectionViewDateField(view);
    const skippedColumns = new Set(["title", dateField.toLowerCase()]);
    const displayColumns = columns.filter((column) => !skippedColumns.has(column.toLowerCase()));
    const items = getCollectionTimelineItems(records, dateField).map((item) => {
        const fields = displayColumns.map((column) => {
            const value = formatCollectionRecordValue(item.record, column);

            return value
                ? `<li><span>${escapeHtml(getColumnLabel(column))}</span><strong>${escapeHtml(value)}</strong></li>`
                : "";
        }).filter(Boolean).join("");

        return [
            "<article class=\"timeline-item\">",
            `<time>${escapeHtml(item.dateLabel)}</time>`,
            "<div class=\"timeline-card\">",
            `<h2>${escapeHtml(formatCollectionRecordValue(item.record, "title"))}</h2>`,
            fields ? `<ul>${fields}</ul>` : "",
            "</div>",
            "</article>",
        ].filter(Boolean).join("");
    }).join("\n");

    return `<div class="timeline-list">${items || "<p>No records.</p>"}</div>`;
};

export const renderSourceHtml = (content: string) => {
    return `<pre>${escapeHtml(content)}</pre>`;
};

export const escapeHtml = (text: string) => {
    return text.replace(/[&<>"']/gu, (character) => {
        switch (character) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case "\"":
                return "&quot;";
            case "'":
                return "&#39;";
            default:
                return character;
        }
    });
};

const getColumnLabel = (column: string) => {
    return column.replace(/[-_]+/gu, " ").replace(/\b\w/gu, (character) => character.toUpperCase());
};
