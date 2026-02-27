import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['playwright.config.js', 'tests/e2e/**/*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    ignores: ['node_modules/', 'frontend/', 'coverage/', 'eslint.config.mjs'],
  },
];
