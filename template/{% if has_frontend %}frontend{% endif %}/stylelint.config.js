/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard', 'stylelint-config-html/svelte'],
  rules: {
    'color-no-hex': true,
  },
};
