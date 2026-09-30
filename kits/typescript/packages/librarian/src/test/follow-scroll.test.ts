/**
 * The one rule, from three directions: a viewport at the bottom follows, a
 * reader who scrolls up stops it, and growing content never does either on
 * the reader's behalf.
 */
import { describe, it, expect } from 'vitest';
import { atBottom, distanceFromBottom, FollowScroll } from '$lib/follow-scroll.svelte';

const at = (scrollTop: number, scrollHeight = 2000, clientHeight = 800) => ({
	scrollTop,
	scrollHeight,
	clientHeight
});

describe('atBottom()', () => {
	it('counts the last few pixels as the bottom', () => {
		expect(distanceFromBottom(at(1200))).toBe(0);
		expect(atBottom(at(1200))).toBe(true);
		expect(atBottom(at(1160))).toBe(true);
		expect(atBottom(at(1000))).toBe(false);
	});
});

describe('FollowScroll', () => {
	it('starts following, so the first answer is watched without a gesture', () => {
		expect(new FollowScroll().following).toBe(true);
	});

	it('stops following when the reader scrolls up', () => {
		const follow = new FollowScroll();
		follow.measure(at(1200));
		follow.measure(at(400));
		expect(follow.following).toBe(false);
	});

	it('keeps following while content grows under a reader parked at the bottom', () => {
		const follow = new FollowScroll();
		follow.measure(at(1200, 2000));
		// The stream appends and the auto-scroll lands at the new bottom.
		follow.measure(at(1700, 2500));
		follow.measure(at(2200, 3000));
		expect(follow.following).toBe(true);
	});

	it('does not re-follow just because the answer grew past a parked reader', () => {
		const follow = new FollowScroll();
		follow.measure(at(1200, 2000));
		follow.measure(at(400, 2000));
		expect(follow.following).toBe(false);
		// scrollTop unchanged, the document taller: not a gesture, not a re-pin.
		follow.measure(at(400, 3000));
		follow.measure(at(400, 4000));
		expect(follow.following).toBe(false);
	});

	it('follows again once the reader returns to the bottom', () => {
		const follow = new FollowScroll();
		follow.measure(at(1200));
		follow.measure(at(400));
		follow.measure(at(1200));
		expect(follow.following).toBe(true);
	});

	it('does not read a sub-pixel scrollTop wobble as an upward gesture', () => {
		const follow = new FollowScroll();
		// Mid-document, still following because nothing has been scrolled up.
		follow.measure(at(1000));
		follow.measure(at(999.6));
		expect(follow.following).toBe(true);
	});

	it('re-pins on a new question, wherever the reader was reading', () => {
		const follow = new FollowScroll();
		follow.measure(at(1200));
		follow.measure(at(0));
		expect(follow.following).toBe(false);
		follow.pin();
		expect(follow.following).toBe(true);
	});
});
