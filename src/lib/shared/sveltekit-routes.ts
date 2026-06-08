const routeFilePattern = /^\+(?:page|layout)(?:@[^.]+)?(?:\.server)?\.(?:svelte|ts|js)$/u;

export function getSvelteKitRoutePath(path: string) {
    const routeFilePath = getSvelteKitRouteFilePath(path);

    if (routeFilePath === null) {
        return null;
    }

    const segments = routeFilePath.split("/").filter(Boolean);
    const fileName = segments.pop() ?? "";

    if (!routeFilePattern.test(fileName)) {
        return null;
    }

    const routeSegments = segments
        .map(getSvelteKitPreviewRouteSegment)
        .filter((segment) => segment !== "");

    return `/${routeSegments.map(encodeURIComponent).join("/")}`;
}

export function isSvelteKitRoutePreviewFile(path: string) {
    return getSvelteKitRoutePath(path) !== null;
}

function getSvelteKitRouteFilePath(path: string) {
    const normalizedPath = path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
    const sourceRoutePrefix = "src/routes/";
    const sourceRoutePrefixIndex = normalizedPath.indexOf(sourceRoutePrefix);

    if (sourceRoutePrefixIndex >= 0) {
        return normalizedPath.slice(sourceRoutePrefixIndex + sourceRoutePrefix.length);
    }

    if (normalizedPath.startsWith("routes/")) {
        return normalizedPath.slice("routes/".length);
    }

    if (normalizedPath.split("/").includes("src")) {
        return null;
    }

    return normalizedPath;
}

function getSvelteKitPreviewRouteSegment(segment: string) {
    if (/^\(.+\)$/u.test(segment) || segment.startsWith("@")) {
        return "";
    }

    if (/^\[\[?\.{3}.+\]?\]$/u.test(segment) || /^\[.+\]$/u.test(segment)) {
        return "";
    }

    return segment;
}
