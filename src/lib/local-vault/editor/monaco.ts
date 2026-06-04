import type { editor as MonacoEditorNamespace } from 'monaco-editor/esm/vs/editor/editor.api.js';

export type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api.js');
export type MonacoEditor = MonacoEditorNamespace.IStandaloneCodeEditor;

let monacoApi: MonacoApi | null = null;

export async function loadMonaco() {
	if (monacoApi) {
		return monacoApi;
	}

	const [monaco] = await Promise.all([
		import('monaco-editor/esm/vs/editor/editor.api.js'),
		import('monaco-editor/esm/vs/basic-languages/css/css.contribution.js'),
		import('monaco-editor/esm/vs/basic-languages/html/html.contribution.js'),
		import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'),
		import('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js'),
		import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'),
		import('monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js')
	]);
	monacoApi = monaco;

	return monacoApi;
}
