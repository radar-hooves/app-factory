/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard', 'stylelint-config-html/svelte'],
  rules: {
    'color-no-hex': true,
    // Tailwind v4's own docs and every consuming app use the bare string
    // form (`@import 'tailwindcss';`), not the config-standard url() default.
    'import-notation': 'string',
    // The household oklch() convention is unitless (`oklch(0.55 0.12 145)`),
    // not the CSS-spec deg/% forms stylelint-config-standard defaults to.
    'hue-degree-notation': 'number',
    'lightness-notation': 'number',
    // Tailwind v4 at-rules the standard config doesn't know about.
    'at-rule-no-unknown': [true, { ignoreAtRules: ['theme', 'source', 'custom-variant', 'apply'] }],
    // app.css's five-block structure (docs/master/templates/golden-patterns/
    // app-shape-and-frontend.md §"Token consumption") deliberately repeats
    // `:root`/`.dark` once per block for readability.
    'no-duplicate-selectors': null,
  },
};
