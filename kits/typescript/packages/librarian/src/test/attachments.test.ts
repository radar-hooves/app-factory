/**
 * The limits are the wire's, so they are enforced before the wire: ten files,
 * 20 MB each, and only what Milton can actually read.
 */
import { describe, it, expect } from 'vitest';
import { acceptFiles, formatSize, MAX_BYTES } from '$lib/attachments';

// `size` is derived from the blob parts, and allocating 20 MB to prove a 20 MB
// file is rejected is a silly way to spend a test run.
function file(name: string, type: string, size = 1024): File {
	const made = new File([''], name, { type });
	Object.defineProperty(made, 'size', { value: size });
	return made;
}

describe('acceptFiles()', () => {
	it('takes the types Milton can read', () => {
		const { accepted, rejected } = acceptFiles(
			[],
			[file('brief.pdf', 'application/pdf'), file('shot.png', 'image/png')]
		);
		expect(accepted.map((f) => f.name)).toEqual(['brief.pdf', 'shot.png']);
		expect(rejected).toEqual([]);
	});

	it('takes a .md file a browser reports with no type at all', () => {
		const { accepted } = acceptFiles([], [file('notes.md', '')]);
		expect(accepted).toHaveLength(1);
	});

	it('rejects a type by name, so the reader is told which file and why', () => {
		const { accepted, rejected } = acceptFiles([], [file('archive.zip', 'application/zip')]);
		expect(accepted).toEqual([]);
		expect(rejected).toEqual([{ name: 'archive.zip', reason: 'type' }]);
	});

	it('rejects a file over 20 MB', () => {
		const { rejected } = acceptFiles([], [file('scan.pdf', 'application/pdf', MAX_BYTES + 1)]);
		expect(rejected).toEqual([{ name: 'scan.pdf', reason: 'size' }]);
	});

	it('stops at ten and says the eleventh will not fit', () => {
		const existing = Array.from({ length: 10 }, (_, i) => file(`p${i}.png`, 'image/png'));
		const { accepted, rejected } = acceptFiles(existing, [file('p10.png', 'image/png')]);
		expect(accepted).toHaveLength(10);
		expect(rejected).toEqual([{ name: 'p10.png', reason: 'count' }]);
	});

	it('ignores a file already attached rather than attaching it twice', () => {
		const already = [file('brief.pdf', 'application/pdf')];
		const { accepted, rejected } = acceptFiles(already, [file('brief.pdf', 'application/pdf')]);
		expect(accepted).toHaveLength(1);
		expect(rejected).toEqual([]);
	});
});

describe('formatSize()', () => {
	it('reads as a size a person would say', () => {
		expect(formatSize(900)).toBe('900 B');
		expect(formatSize(2048)).toBe('2 KB');
		expect(formatSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
	});
});
