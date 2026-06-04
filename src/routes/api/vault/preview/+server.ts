import { json } from '@sveltejs/kit';
import { renderOpenFolderPreviewFragment } from '$lib/server/open-folder.js';

export const prerender = false;

export async function POST({ request }) {
	try {
		const payload = await request.json() as {
			content?: unknown;
			interactiveTaskLists?: unknown;
			path?: unknown;
		};
		const html = await renderOpenFolderPreviewFragment({
			content: typeof payload.content === 'string' ? payload.content : undefined,
			interactiveTaskLists: Boolean(payload.interactiveTaskLists),
			path: assertString(payload.path, 'path')
		});

		return new Response(html, {
			headers: {
				'content-type': 'text/html;charset=utf-8'
			}
		});
	} catch (error) {
		return json({ message: getErrorMessage(error) }, { status: 400 });
	}
}

function assertString(value: unknown, name: string) {
	if (typeof value !== 'string') {
		throw new Error(`${name} is required.`);
	}

	return value;
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Unknown preview error.';
}
