import * as monaco from 'monaco-editor';

export type MonacoApi = typeof monaco;
export type MonacoEditor = monaco.editor.IStandaloneCodeEditor;

export async function loadMonaco(): Promise<MonacoApi> {
	return monaco;
}
