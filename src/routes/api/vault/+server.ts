import { json } from '@sveltejs/kit';
import { getOpenFolderMetadata } from '$lib/server/open-folder.js';

export const prerender = false;

export async function GET() {
	return json(await getOpenFolderMetadata());
}
