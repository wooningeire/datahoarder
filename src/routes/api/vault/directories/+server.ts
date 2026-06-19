import { json } from "@sveltejs/kit";
import { listOpenFolderDirectories } from "$lib/server/open-folder.js";

export const prerender = false;

export async function GET() {
    try {
        return json(await listOpenFolderDirectories());
    } catch (error) {
        return json({ message: getErrorMessage(error) }, { status: 400 });
    }
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown server vault error.";
}
