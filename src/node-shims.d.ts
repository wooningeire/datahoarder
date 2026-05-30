declare module 'node:fs' {
	export type Dirent = {
		isDirectory(): boolean;
		isFile(): boolean;
		name: string;
	};

	export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
}

declare module 'node:path' {
	export function basename(path: string): string;
	export function relative(from: string, to: string): string;
	export function resolve(...paths: string[]): string;
	export const sep: string;
}
