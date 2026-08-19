// App-owned lint debt — the ONE sanctioned home for pre-existing findings.
//
// This file is NOT template-owned: the parity gate never checks it, so an app
// banks debt here without drifting from the factory, and copier update never
// clobbers what is banked (_skip_if_exists in copier.yaml, beside the design
// baselines). It ships EMPTY, which is a valid no-op — an empty array spreads to
// no config block and changes nothing.
//
// eslint.config.js spreads this array LAST, so every block here overrides the
// error-setting blocks above it. Turn a rule OFF only for a NAMED, EXISTING set
// of files — never a glob that would let new files inherit the exemption. The
// rule stays `error` for every other file, so the debt cannot grow: delete a
// path as its file is fixed, and delete the block when its list empties.
//
// Shape (mirrors the flat-config blocks it is spread beside):
//
//   export default [
//     {
//       // Why this debt exists and how it retires.
//       files: ['src/routes/(protected)/legacy/+page.svelte'],
//       rules: { 'svelte/no-restricted-html-elements': 'off' }
//     }
//   ];
export default [];
