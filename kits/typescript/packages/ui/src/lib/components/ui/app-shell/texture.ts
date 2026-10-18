/**
 * The content texture: the house "atmosphere" the shell paints on its own
 * scrolling content region.
 *
 * Two apps had independently built the same thing — a faint dot-grid floor with
 * a soft accent vignette in one corner — under two names, in two app.css files,
 * with two sets of local variables. Neither was wrong; between them they are
 * exactly the drift this package exists to end. Worse, one of them applied it as
 * a helper class per route: four routes out of about fifteen carried it, so
 * whether a page wore the house atmosphere came down to which page someone had
 * happened to touch. A texture an app has to REMEMBER to apply is not a texture,
 * it is a coin toss with a stylesheet.
 *
 * So it moves onto the shell, where there is exactly one place to say it and no
 * per-route decision left to get wrong. `grid` is the default: an opt-in house
 * style measured who remembered it, not what the house looks like.
 *
 * It is one texture, not a menu. Both apps wanted the same picture, and the
 * axes they actually differed on — how dark the dots are, how the vignette is
 * tinted, how far apart the dots sit — are values, not designs. They are
 * `--ds-shell-texture-*` custom properties an app retunes in one declaration
 * (see `styles.css`), which is also how a "plain wash" is reached without a
 * second name in this union: set the grid ink to `transparent` and the vignette
 * remains.
 */

/**
 * - `grid` — the house atmosphere: a dot-grid floor plus a corner vignette. The default.
 * - `none` — no texture: the region exactly as it rendered before the feature.
 */
export type ShellTexture = 'none' | 'grid';

/** Every texture, the untextured form first — the order it is documented in. */
export const SHELL_TEXTURES = ['none', 'grid'] as const satisfies readonly ShellTexture[];
