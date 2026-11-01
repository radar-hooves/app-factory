// The @fontsource-variable packages are CSS-only and ship no types; TypeScript 6 checks the
// side-effect imports in lib/fonts.ts and fails on them without this.
declare module '@fontsource-variable/*';
