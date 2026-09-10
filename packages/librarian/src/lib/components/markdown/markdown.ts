/**
 * Markdown for a STREAMING agent transcript.
 *
 * Two things separate this from calling `marked()` on a string, and both are
 * what make a streaming transcript look finished rather than glitchy:
 *
 * 1. Half-arrived markdown is not valid markdown. A code fence that has opened
 *    and not yet closed makes `marked` treat the rest of the answer as code, so
 *    the message visibly flips between prose and a grey slab on every token.
 *    Unterminated constructs are closed before parsing.
 * 2. Highlighting every code block on every token is wasted work the user never
 *    sees — the block changes again a few milliseconds later. Highlighting is a
 *    separate pass the caller runs once the text has settled.
 *
 * Sanitised on the way out, always. The content is model output rendered as
 * HTML, which is exactly the case DOMPurify exists for.
 */

import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';
import type { Highlighter } from 'shiki';

marked.setOptions({ gfm: true, breaks: false });

/** Close anything the stream has opened but not yet finished. */
export function balance(markdown: string): string {
	let text = markdown;

	// An odd number of ``` fences means one is still open.
	const fences = text.match(/^```/gm)?.length ?? 0;
	if (fences % 2 === 1) text += '\n```';

	// A trailing pipe row with no separator renders as a paragraph of pipes;
	// leaving the partial row out reads as the table simply still growing.
	const lines = text.split('\n');
	const last = lines.at(-1) ?? '';
	if (last.startsWith('|') && !last.endsWith('|') && lines.length > 1) {
		lines.pop();
		text = lines.join('\n');
	}

	return text;
}

export function render(markdown: string, { streaming = false } = {}): string {
	const source = streaming ? balance(markdown) : markdown;
	const html = marked.parse(source, { async: false });
	return DOMPurify.sanitize(html, {
		ADD_ATTR: ['target', 'rel', 'data-cite', 'tabindex', 'role'],
		FORBID_TAGS: ['style', 'form', 'input', 'button'],
		FORBID_ATTR: ['style', 'onerror', 'onload']
	});
}

let highlighterPromise: Promise<Highlighter> | null = null;

/** Loaded once, lazily — shiki's engine and grammars are not small. */
async function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = import('shiki').then((shiki) =>
			shiki.createHighlighter({
				// Dual themes emit CSS variables, so one render serves both colour
				// schemes and the app's existing theme switch drives it — no
				// re-highlight on toggle, no second copy of the DOM.
				themes: ['github-light', 'github-dark'],
				langs: [
					'bash',
					'python',
					'typescript',
					'javascript',
					'json',
					'yaml',
					'markdown',
					'sql',
					'html',
					'css',
					'diff'
				]
			})
		);
	}
	return highlighterPromise;
}

/**
 * Mark every inline `code` span that names a known collection.
 *
 * The agent puts identifiers in backticks — document titles, requirement
 * numbers, collection names — and they all render alike. Matching against
 * the caller's real list rather than a prompt convention means the prompt
 * cannot drift out of sync with the rendering.
 */
export function markCollections(root: HTMLElement, collections: Set<string>): void {
	if (collections.size === 0) return;
	for (const code of root.querySelectorAll('code')) {
		if (code.parentElement?.tagName === 'PRE') continue;
		const name = (code.textContent ?? '').trim();
		if (collections.has(name)) code.dataset.collection = 'true';
	}
}

/**
 * Turn every inline `[n]` marker into a citation chip.
 *
 * Done against the rendered DOM rather than the markdown string, for the same
 * reason `markCollections` is: a `[3]` inside a fenced code block or a link
 * label is not a citation, and `closest()` settles that in one call where a
 * string-level regex would need to re-implement the parser to know.
 *
 * `sup` rather than `button`: the sanitiser strips `button` (it is in
 * `FORBID_TAGS`, and rightly — this is model output), so the chip carries the
 * button ROLE and a tab stop, and the component delegates the events.
 */
export function markCitations(root: HTMLElement, valid: Set<number>): void {
	if (valid.size === 0) return;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const targets: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node as Text;
		if (text.parentElement?.closest('pre, code, a, sup')) continue;
		if (/\[\d{1,3}\]/.test(text.data)) targets.push(text);
	}

	for (const text of targets) {
		const fragment = document.createDocumentFragment();
		let cursor = 0;
		for (const match of text.data.matchAll(/\[(\d{1,3})\]/g)) {
			const n = Number(match[1]);
			if (!valid.has(n) || match.index === undefined) continue;
			fragment.append(text.data.slice(cursor, match.index));
			const chip = document.createElement('sup');
			chip.className = 'ds-cite';
			chip.dataset.cite = String(n);
			chip.setAttribute('role', 'button');
			chip.setAttribute('tabindex', '0');
			chip.setAttribute('aria-label', `Source ${n}`);
			chip.textContent = String(n);
			fragment.append(chip);
			cursor = match.index + match[0].length;
		}
		if (cursor === 0) continue;
		fragment.append(text.data.slice(cursor));
		text.replaceWith(fragment);
	}
}

/**
 * Replace every `<pre><code>` in a rendered fragment with a highlighted one.
 * Runs against the DOM node rather than the HTML string so it can be applied
 * after paint without re-parsing the markdown.
 */
export async function highlight(root: HTMLElement): Promise<void> {
	const blocks = root.querySelectorAll('pre > code');
	if (blocks.length === 0) return;

	const highlighter = await getHighlighter();
	const supported = new Set(highlighter.getLoadedLanguages());

	for (const block of blocks) {
		const pre = block.parentElement;
		if (!pre || pre.dataset.highlighted === 'true') continue;
		const declared = [...block.classList]
			.find((c) => c.startsWith('language-'))
			?.slice('language-'.length);
		const lang = declared && supported.has(declared) ? declared : 'text';
		const code = block.textContent ?? '';
		try {
			const html = highlighter.codeToHtml(code, {
				lang,
				themes: { light: 'github-light', dark: 'github-dark' },
				defaultColor: false
			});
			const replacement = new DOMParser().parseFromString(html, 'text/html').body.firstElementChild;
			if (!replacement) continue;
			if (replacement instanceof HTMLElement) {
				replacement.dataset.highlighted = 'true';
				replacement.dataset.lang = lang;
			}
			pre.replaceWith(replacement);
		} catch {
			// An unknown grammar is not worth failing a message over.
			pre.dataset.highlighted = 'true';
		}
	}
}
