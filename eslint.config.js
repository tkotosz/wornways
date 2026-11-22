import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      'coverage/**',
      'data/**',
      'out/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...vue.configs['flat/recommended'],
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  { languageOptions: { globals: globals.node } },
  {
    files: ['apps/web/src/**'],
    // WORNWAYS_VERSION is written in by the build (apps/web/version-build.ts).
    languageOptions: {
      globals: { ...globals.browser, ...globals.worker, WORNWAYS_VERSION: 'readonly' },
    },
  },
  {
    rules: {
      // A `!` states something the code already checked; it is explicit, so allow it.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
);
