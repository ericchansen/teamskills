import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';

const sharedRules = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-console': 'off',
};

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    '.playwright-mcp/**',
    'frontend/dist/**',
  ]),
  js.configs.recommended,
  {
    files: ['backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: sharedRules,
  },
  {
    files: ['playwright.config.js', 'tests/e2e/**/*.js', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: sharedRules,
  },
  ...pluginVue.configs['flat/essential'],
  {
    files: ['frontend/src/**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: sharedRules,
  },
]);
