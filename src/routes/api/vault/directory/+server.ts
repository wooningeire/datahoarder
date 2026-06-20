import { json } from "@sveltejs/kit";
import { createOpenFolderDirectory } from "$lib/server/open-folder.js";
import { moveOpenFolderDirectory } from "$lib/server/open-folder-directory-mutations.js";

export const prerender = false;

export async function POST({ request }) {
    try {
        const payload = await request.json() as { path?: unknown };
        const path = assertString(payload.path, "path");
        const createdPath = await createOpenFolderDirectory(path);

        return json({ path: createdPath }, { status: 201 });
    } catch (error) {
        return json({ message: getErrorMessage(error) }, { status: 400 });
    }
}

export async function PATCH({ request }) {
    try {
        const payload = await request.json() as {
            currentPath?: unknown,
            nextPath?: unknown,
        };
        const currentPath = assertString(payload.currentPath, "currentPath");
        const nextPath = assertString(payload.nextPath, "nextPath");
        const movedPath = await moveOpenFolderDirectory(currentPath, nextPath);

        return json({ path: movedPath });
    } catch (error) {
        return json({ message: getErrorMessage(error) }, { status: 400 });
    }
}

function assertString(value: unknown, name: string) {
    if (typeof value !== "string") {
        throw new Error(`${name} is required.`);
    }

    return value;
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown server vault error.";
}
