export type MathJaxApi = {
	loader?: Record<string, unknown>;
	options?: Record<string, unknown>;
	startup?: {
		promise?: Promise<void>;
	};
	svg?: Record<string, unknown>;
	tex?: Record<string, unknown>;
	typesetPromise?: (elements?: Element[]) => Promise<void>;
};

type MathJaxWindow = Window & {
	MathJax?: MathJaxApi;
};

const mathJaxScriptSrc = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';

let mathJaxLoadPromise: Promise<MathJaxApi | null> | null = null;

export async function loadMathJax() {
	const existingMathJax = (window as MathJaxWindow).MathJax;

	if (existingMathJax?.typesetPromise) {
		return existingMathJax;
	}

	mathJaxLoadPromise ??= new Promise<MathJaxApi | null>((resolve) => {
		configureMathJax();

		const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${mathJaxScriptSrc}"]`);
		const script = existingScript ?? document.createElement('script');

		script.async = true;
		script.addEventListener('load', () => resolve((window as MathJaxWindow).MathJax ?? null), { once: true });
		script.addEventListener('error', () => resolve(null), { once: true });

		if (!existingScript) {
			script.src = mathJaxScriptSrc;
			document.head.append(script);
		}
	});

	return mathJaxLoadPromise;
}

export function hasMath(content: string) {
	return /(?:\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\(.+?\\\)|(^|[^\\])\$[^\s$](?:[^$]*[^\s$])?\$)/u.test(
		content
	);
}

function configureMathJax() {
	const mathJaxWindow = window as MathJaxWindow;

	mathJaxWindow.MathJax = {
		...mathJaxWindow.MathJax,
		loader: {
			load: ['[tex]/ams']
		},
		tex: {
			...mathJaxWindow.MathJax?.tex,
			packages: { '[+]': ['ams'] },
			displayMath: [
				['$$', '$$'],
				['\\[', '\\]']
			],
			inlineMath: [
				['$', '$'],
				['\\(', '\\)']
			],
			processEscapes: true,
			processEnvironments: true
		},
		svg: {
			fontCache: 'global'
		},
		options: {
			skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
		}
	};
}
