import { json } from '@sveltejs/kit';
import {
	renderOpenFolderPreviewFragment,
	renderPostedNotePreviewFragment
} from '$lib/server/open-folder.js';
import { isSvelteMarkupNotePreviewFile } from '$lib/server/svelte-note.js';

export const prerender = false;

export async function POST({ request }) {
	try {
		const payload = await request.json() as {
			content?: unknown;
			interactiveTaskLists?: unknown;
			path?: unknown;
			root?: unknown;
		};
		const path = assertString(payload.path, 'path');
		const content = typeof payload.content === 'string' ? payload.content : undefined;
		const root = typeof payload.root === 'string' ? payload.root : undefined;
		const renderPreview = content !== undefined && isSvelteMarkupNotePreviewFile(path)
			? renderPostedNotePreviewFragment
			: renderOpenFolderPreviewFragment;
		const html = await renderPreview({
			content,
			interactiveTaskLists: Boolean(payload.interactiveTaskLists),
			path,
			root
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
