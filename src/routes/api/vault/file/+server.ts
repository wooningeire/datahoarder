import { json, text } from '@sveltejs/kit';
import {
	createOpenFolderTextFile,
	deleteOpenFolderTextFile,
	moveOpenFolderTextFile,
	readOpenFolderTextFile,
	writeOpenFolderTextFile
} from '$lib/server/open-folder.js';

export const prerender = false;

export async function GET({ url }) {
	const path = url.searchParams.get('path') ?? '';

	try {
		return text(await readOpenFolderTextFile(path));
	} catch (error) {
		return json({ message: getErrorMessage(error) }, { status: 400 });
	}
}

export async function POST({ request }) {
	try {
		const { content, path } = await readFilePayload(request);
		const createdPath = await createOpenFolderTextFile(path, content);

		return json({ path: createdPath }, { status: 201 });
	} catch (error) {
		return json({ message: getErrorMessage(error) }, { status: 400 });
	}
}

export async function PUT({ request }) {
	try {
		const { content, path } = await readFilePayload(request);

		await writeOpenFolderTextFile(path, content);

		return json({ path });
	} catch (error) {
		return json({ message: getErrorMessage(error) }, { status: 400 });
	}
}

export async function PATCH({ request }) {
	try {
		const payload = await request.json() as {
			content?: unknown;
			currentPath?: unknown;
			nextPath?: unknown;
		};
		const currentPath = assertString(payload.currentPath, 'currentPath');
		const nextPath = assertString(payload.nextPath, 'nextPath');
		const content = assertString(payload.content, 'content');
		const movedPath = await moveOpenFolderTextFile(currentPath, nextPath, content);

		return json({ path: movedPath });
	} catch (error) {
		return json({ message: getErrorMessage(error) }, { status: 400 });
	}
}

export async function DELETE({ request }) {
	try {
		const payload = await request.json() as { path?: unknown };
		const path = assertString(payload.path, 'path');

		await deleteOpenFolderTextFile(path);

		return new Response(null, { status: 204 });
	} catch (error) {
		return json({ message: getErrorMessage(error) }, { status: 400 });
	}
}

async function readFilePayload(request: Request) {
	const payload = await request.json() as { content?: unknown; path?: unknown };

	return {
		content: assertString(payload.content, 'content'),
		path: assertString(payload.path, 'path')
	};
}

function assertString(value: unknown, name: string) {
	if (typeof value !== 'string') {
		throw new Error(`${name} is required.`);
	}

	return value;
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Unknown server vault error.';
}
