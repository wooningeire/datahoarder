import { json } from '@sveltejs/kit';
import { renderOpenFolderPreviewDocument } from '$lib/server/open-folder.js';

export const prerender = false;

export async function GET({ params }) {
	try {
		const html = await renderOpenFolderPreviewDocument({ path: params.path });

		return new Response(html, {
			headers: {
				'content-type': 'text/html;charset=utf-8'
			}
		});
	} catch (error) {
		return json({ message: getErrorMessage(error) }, { status: 400 });
	}
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Unknown preview error.';
}
