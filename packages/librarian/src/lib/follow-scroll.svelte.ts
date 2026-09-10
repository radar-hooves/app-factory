/**
 * Follow the stream until the reader disagrees.
 *
 * The whole behaviour is one rule stated three ways: a viewport already at the
 * bottom is following; a reader who scrolls UP has stopped following; a reader
 * who comes back to the bottom is following again. Nothing else — no timers,
 * no "was that scroll ours or theirs" bookkeeping — because the auto-scroll
 * this drives always lands AT the bottom, which the first clause re-affirms
 * rather than fights.
 *
 * Growing content moves the bottom away from a parked reader without moving
 * their scrollTop, so distance alone cannot say who moved: the direction of
 * scrollTop can, and that is the only thing `measure` remembers between calls.
 */

/** Distance from the bottom, in px, still counted as being at the bottom.
 *  A line of prose is ~28px; two lines of slack survives sub-pixel layout
 *  rounding and a caret-height change without unpinning the reader. */
export const FOLLOW_THRESHOLD = 64;

export interface ScrollMetrics {
	scrollTop: number;
	clientHeight: number;
	scrollHeight: number;
}

export function distanceFromBottom(m: ScrollMetrics): number {
	return m.scrollHeight - m.scrollTop - m.clientHeight;
}

export function atBottom(m: ScrollMetrics, threshold = FOLLOW_THRESHOLD): boolean {
	return distanceFromBottom(m) <= threshold;
}

export class FollowScroll {
	/** True while the viewport should be dragged along with new content. */
	following = $state(true);
	#lastTop = 0;

	/** Feed every scroll event, and the metrics after every content change. */
	measure(m: ScrollMetrics, threshold = FOLLOW_THRESHOLD): void {
		// 1px of tolerance: a trackpad's fractional scrollTop otherwise reads as
		// an upward flick on a viewport that has not actually moved.
		const wentUp = m.scrollTop < this.#lastTop - 1;
		this.#lastTop = m.scrollTop;
		if (atBottom(m, threshold)) {
			this.following = true;
			return;
		}
		if (wentUp) this.following = false;
	}

	/** A new question re-pins: the reader asked for the thing about to arrive. */
	pin(): void {
		this.following = true;
	}
}
