/**
 * The web pages an answer drew on, listed apart from the library's numbered
 * sources: the pages the turn's supacrawl calls read, and the Markdown links
 * in the answer itself. A search's results are what it found, not what the
 * answer drew on, so they stay in the search's own row. Never numbered,
 * because nothing here is a passage the persona was handed to cite.
 */

import type { Block, ToolBlock } from './transcript.svelte';

export interface WebSource {
	url: string;
	/** The page's title, or its host where nothing gave one. */
	title: string;
	host: string;
}

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

function fromTool(block: ToolBlock): Array<{ url: string; title?: string }> {
	if (!block.name.startsWith('mcp__supacrawl__') || !block.name.endsWith('_scrape') || block.isError) return [];
	const input = parse(block.rawInput) as { url?: unknown } | undefined;
	if (!isWeb(input?.url)) return [];
	const page = parse(block.result) as { title?: unknown; metadata?: { title?: unknown } } | undefined;
	const title = [page?.title, page?.metadata?.title].find((t) => typeof t === 'string');
	return [{ url: input.url, title: title as string | undefined }];
}

/** The pages, once each, in the order the turn met them. */
export function webSources(blocks: Block[], answer: string): WebSource[] {
	const seen = new Map<string, WebSource>();
	const add = (url: string, title?: string) => {
		const key = url.replace(/#.*$/, '').replace(/\/$/, '');
		if (seen.has(key)) return;
		const host = hostOf(url);
		if (host === url) return;
		seen.set(key, { url, title: title?.trim() || host, host });
	};
	for (const block of blocks) if (block.kind === 'tool') for (const p of fromTool(block)) add(p.url, p.title);
	for (const match of answer.matchAll(LINK)) add(match[2], match[1]);
	return [...seen.values()];
}
