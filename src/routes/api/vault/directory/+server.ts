import { json } from "@sveltejs/kit";
import { createOpenFolderDirectory } from "$lib/server/open-folder.js";

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

function assertString(value: unknown, name: string) {
    if (typeof value !== "string") {
        throw new Error(`${name} is required.`);
    }

    return value;
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown server vault error.";
}
