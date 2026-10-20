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
import { markChanges } from '../../diff';
import type { Highlighter } from 'shiki';
import { webKey } from '../../web-sources';

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

const FETCHERS = 'img, picture, source, video, audio, track, iframe, object, embed, link, style, image, use';
const URL_ATTRS = ['src', 'href', 'xlink:href', 'poster', 'data', 'srcset'];

/** Only what cannot leave the origin: a data URL, a same-origin path, a fragment. */
function stays(url: string): boolean {
	const u = url.trim();
	return /^data:/i.test(u) || (u.startsWith('/') && !u.startsWith('//')) || u.startsWith('#');
}

/**
 * A rendered answer must not fetch from anywhere: a remote image or url() in
 * agent output is a beacon that carries the conversation out in its query.
 * A remote image degrades to its alt text (or its address as a link).
 */
function dropFetchers(root: Element): void {
	for (const el of root.querySelectorAll(FETCHERS)) {
		const urls = URL_ATTRS.map((a) => el.getAttribute(a)).filter((v): v is string => v !== null);
		if (urls.every(stays)) continue;
		if (el.tagName === 'IMG') {
			const alt = el.getAttribute('alt')?.trim();
			const src = el.getAttribute('src')?.trim() ?? '';
			if (alt) el.replaceWith(root.ownerDocument.createTextNode(alt));
			else if (/^https?:\/\//i.test(src)) {
				const a = root.ownerDocument.createElement('a');
				a.setAttribute('href', src);
				a.textContent = src;
				el.replaceWith(a);
			} else el.remove();
		} else el.remove();
	}
}

/**
 * `markdown` as sanitised HTML. With `previous`, the version before it, each
 * block it changed is marked on the sanitised DOM, before its one serialisation.
 */
export function render(markdown: string, { streaming = false, previous }: { streaming?: boolean; previous?: string } = {}): string {
	const body = sanitised(streaming ? balance(markdown) : markdown);
	if (previous !== undefined && !streaming) markChanges(body, sanitised(previous));
	return body.innerHTML;
}

function sanitised(source: string): HTMLElement {
	const body = DOMPurify.sanitize(marked.parse(source, { async: false }), {
		ADD_ATTR: ['target', 'rel', 'data-cite', 'tabindex', 'role'],
		FORBID_TAGS: ['style', 'form', 'input', 'button'],
		FORBID_ATTR: ['style', 'srcset', 'onerror', 'onload'],
		RETURN_DOM: true
	}) as unknown as HTMLElement;
	dropFetchers(body);
	return body;
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

/** A turn's prose and the fenced blocks of a registered language, in order. */
export type Part =
	| { kind: 'md'; text: string }
	| { kind: 'visual'; lang: string; source: string; closed: boolean };

const OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * Cut `markdown` at each fenced block whose language `has` a renderer for.
 * A fence of another language (or none) is ordinary code and stays in the
 * prose, and so does anything inside one: an example of a visual's fence in a
 * code block is text. A block still open at the end is `closed: false`.
 */
export function splitVisuals(markdown: string, has: (lang: string) => boolean): Part[] {
	const parts: Part[] = [];
	let prose: string[] = [];
	let code: { fence: string; visual?: { lang: string; lines: string[] } } | null = null;

	const flush = () => {
		if (prose.join('').trim()) parts.push({ kind: 'md', text: prose.join('\n') });
		prose = [];
	};

	for (const line of markdown.split('\n')) {
		if (code) {
			const close = CLOSE.exec(line);
			if (close && close[1][0] === code.fence[0] && close[1].length >= code.fence.length) {
				if (code.visual) {
					parts.push({
						kind: 'visual',
						lang: code.visual.lang,
						source: code.visual.lines.join('\n'),
						closed: true
					});
				} else prose.push(line);
				code = null;
			} else if (code.visual) code.visual.lines.push(line);
			else prose.push(line);
			continue;
		}
		const open = OPEN.exec(line);
		if (open) {
			const lang = open[2];
			if (lang && has(lang)) {
				flush();
				code = { fence: open[1], visual: { lang, lines: [] } };
			} else {
				code = { fence: open[1] };
				prose.push(line);
			}
			continue;
		}
		prose.push(line);
	}
	if (code?.visual)
		parts.push({
			kind: 'visual',
			lang: code.visual.lang,
			source: code.visual.lines.join('\n'),
			closed: false
		});
	else flush();
	return parts;
}

/**
 * Turn each link to a numbered web page into its citation chip: the link's
 * text stays, unlinked, and the chip after it carries the page's number and
 * opens the page. Against the rendered DOM, for the reason `markCitations` is.
 */
export function markWebLinks(root: HTMLElement, numbers: Map<string, number>): void {
	if (numbers.size === 0) return;
	for (const link of root.querySelectorAll('a[href]')) {
		const href = link.getAttribute('href') ?? '';
		const n = numbers.get(webKey(href));
		if (n === undefined) continue;
		const chip = document.createElement('sup');
		chip.className = 'ds-cite';
		chip.dataset.cite = String(n);
		chip.dataset.web = href;
		chip.setAttribute('role', 'button');
		chip.setAttribute('tabindex', '0');
		chip.setAttribute('aria-label', `Web page ${n}`);
		chip.textContent = String(n);
		link.replaceWith(...link.childNodes, chip);
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
