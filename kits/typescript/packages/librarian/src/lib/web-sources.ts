/**
 * The web pages an answer drew on, listed apart from the library's numbered
 * sources: the pages the turn's supacrawl calls read, and the Markdown links
 * in the answer itself. A search's results are what it found, not what the
 * answer drew on, so they stay in the search's own row (`searchPages`). The
 * page numbers them after the library's, since the persona cites a page by its
 * link and nothing here is a passage it was handed with a number.
 */

import type { Block, ToolBlock } from './transcript.svelte';

export interface WebSource {
	url: string;
	/** The page's title, or its host where nothing gave one. */
	title: string;
	host: string;
	/** The turn read this page whole (a scrape), rather than only linking it. */
	read?: true;
	/** The page's own date, as it gave it, where it gave one. */
	date?: string;
}

/** A page a search found, for its step's expansion. */
export interface FoundPage {
	url: string;
	title: string;
	host: string;
	snippet: string;
}

/** The key two spellings of one page share. */
export const webKey = (url: string): string => url.replace(/#.*$/, '').replace(/\/$/, '');

/** A URL's host without a leading `www.`; the text as given where it is no URL. */
export function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function isWeb(url: unknown): url is string {
	return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function parse(text: string | undefined): unknown {
	try {
		return text ? JSON.parse(text) : undefined;
	} catch {
		return undefined;
	}
}

/** The pages a successful web search step found. */
export function searchPages(block: ToolBlock): FoundPage[] {
	if (block.name !== 'mcp__supacrawl__supacrawl_search' || block.isError) return [];
	const found = parse(block.result) as { results?: unknown } | undefined;
	if (!Array.isArray(found?.results)) return [];
	const pages: FoundPage[] = [];
	for (const item of found.results as Array<Record<string, unknown>>) {
		if (typeof item !== 'object' || item === null || !isWeb(item.url)) continue;
		const host = hostOf(item.url);
		const title = [item.title, host].find((t) => typeof t === 'string' && t.trim()) as string;
		const snippet = [item.snippet, item.description, item.content].find(
			(t) => typeof t === 'string' && t.trim()
		);
		pages.push({ url: item.url, title: title.trim(), host, snippet: ((snippet as string) ?? '').trim() });
	}
	return pages;
}

function fromTool(block: ToolBlock): Array<{ url: string; title?: string; date?: string }> {
	if (!block.name.startsWith('mcp__supacrawl__') || !block.name.endsWith('_scrape') || block.isError) return [];
	const input = parse(block.rawInput) as { url?: unknown } | undefined;
	if (!isWeb(input?.url)) return [];
	const page = parse(block.result) as
		| { title?: unknown; metadata?: Record<string, unknown> }
		| undefined;
	const title = [page?.title, page?.metadata?.title].find((t) => typeof t === 'string');
	const date = [
		page?.metadata?.publishedTime,
		page?.metadata?.published,
		page?.metadata?.date,
		page?.metadata?.modifiedTime
	].find((d) => typeof d === 'string' && !Number.isNaN(Date.parse(d)));
	return [{ url: input.url, title: title as string | undefined, date: date as string | undefined }];
}

/** The pages, once each, in the order the turn met them. */
export function webSources(blocks: Block[], answer: string): WebSource[] {
	const seen = new Map<string, WebSource>();
	const add = (url: string, title?: string, read?: { date?: string }) => {
		const key = webKey(url);
		if (seen.has(key)) return;
		const host = hostOf(url);
		if (host === url) return;
		seen.set(key, {
			url,
			title: title?.trim() || host,
			host,
			...(read ? { read: true as const, date: read.date } : {})
		});
	};
	for (const block of blocks)
		if (block.kind === 'tool') for (const p of fromTool(block)) add(p.url, p.title, { date: p.date });
	for (const match of answer.matchAll(LINK)) add(match[2], match[1]);
	return [...seen.values()];
}
