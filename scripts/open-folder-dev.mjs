#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const parsed = parseArgs(process.argv.slice(2));
const env = { ...process.env };

if (parsed.folder) {
	const folder = resolve(parsed.folder);

	if (!existsSync(folder) || !statSync(folder).isDirectory()) {
		console.error(`Open folder does not exist: ${folder}`);
		process.exit(1);
	}

	env.DATAHOARDER_OPEN_FOLDER = folder;
}

if (parsed.previewOrigin) {
	env.DATAHOARDER_PREVIEW_ORIGIN = parsed.previewOrigin;
}

if (parsed.previewRouteBase) {
	env.DATAHOARDER_PREVIEW_ROUTE_BASE = parsed.previewRouteBase;
}

const runtime = parsed.runtime ?? env.DATAHOARDER_VITE_RUNTIME ?? 'node';
const command =
	runtime === 'deno'
		? {
				args: ['run', '-A', 'npm:vite', 'dev', ...parsed.viteArgs],
				bin: 'deno'
			}
		: {
				args: ['./node_modules/vite/bin/vite.js', 'dev', ...parsed.viteArgs],
				bin: process.execPath
			};

const child = spawn(command.bin, command.args, {
	env,
	stdio: 'inherit',
	windowsHide: false
});

child.on('exit', (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}

	process.exit(code ?? 0);
});

function parseArgs(args) {
	const parsed = {
		folder: '',
		previewOrigin: '',
		previewRouteBase: '',
		runtime: '',
		viteArgs: []
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--') {
			parsed.viteArgs.push(...args.slice(index + 1));
			break;
		}

		if (arg === '--folder' || arg === '--open-folder' || arg === '--root') {
			parsed.folder = args[index + 1] ?? '';
			index += 1;
			continue;
		}

		if (arg === '--preview-origin') {
			parsed.previewOrigin = args[index + 1] ?? '';
			index += 1;
			continue;
		}

		if (arg === '--preview-route-base') {
			parsed.previewRouteBase = args[index + 1] ?? '';
			index += 1;
			continue;
		}

		if (arg === '--runtime') {
			parsed.runtime = args[index + 1] ?? '';
			index += 1;
			continue;
		}

		if (!parsed.folder && !arg.startsWith('-')) {
			parsed.folder = arg;
			continue;
		}

		parsed.viteArgs.push(arg);
	}

	return parsed;
}
