import { standaloneHtmlBaseCss } from "./html-export-base-styles.js";
import { standaloneHtmlCollectionCss } from "./html-export-collection-styles.js";

export const standaloneHtmlCss = [
    standaloneHtmlBaseCss,
    standaloneHtmlCollectionCss,
].join("\n\n");
