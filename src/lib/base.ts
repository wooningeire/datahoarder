export type BaseView = {
	name: string;
	type: string;
};

export function getBaseViews(content: string) {
	const views: BaseView[] = [];
	const lines = content.split(/\r?\n/u);
	let inViews = false;
	let viewsIndent = 0;
	let currentView: Partial<BaseView> | null = null;

	for (const line of lines) {
		const trimmed = line.trim();

		if (!trimmed) {
			continue;
		}

		const indent = line.search(/\S/u);

		if (/^views:\s*$/u.test(trimmed)) {
			inViews = true;
			viewsIndent = indent;
			continue;
		}

		if (!inViews) {
			continue;
		}

		if (indent <= viewsIndent && !trimmed.startsWith('- ')) {
			break;
		}

		const type = trimmed.match(/^-\s+type:\s*(.+)$/u);

		if (type) {
			if (currentView?.type) {
				views.push(toCompleteBaseView(currentView));
			}

			currentView = { type: cleanYamlScalar(type[1]) };
			continue;
		}

		const name = trimmed.match(/^name:\s*(.+)$/u);

		if (currentView && name) {
			currentView.name = cleanYamlScalar(name[1]);
		}
	}

	if (currentView?.type) {
		views.push(toCompleteBaseView(currentView));
	}

	return views;
}

function toCompleteBaseView(view: Partial<BaseView>) {
	return {
		name: view.name || 'Untitled view',
		type: view.type || 'unknown'
	};
}

function cleanYamlScalar(value: string) {
	return value.trim().replace(/^(['"])(.*)\1$/u, '$2');
}
