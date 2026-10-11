// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'legacy-java/**',
      'test-results/**',
      'playwright-report/**',
      'saves/**',
      'docs/**',
      // separate Vite starter projects a collaborator added; not part of this app
      'DND/**',
      'vite-project/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.server.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-syntax': 'off',
    },
  },
  {
    // The engine is pure: no DOM, no IO, no wall clock, no ambient randomness.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../app/*', '../ui/*', '../assets/client*', 'node:*', 'fs', 'path', 'hono', 'hono/*'],
              message: 'src/engine must stay pure: no app, UI, IO or server imports.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'engine is DOM-free' },
        { name: 'document', message: 'engine is DOM-free' },
        { name: 'localStorage', message: 'engine is DOM-free' },
        { name: 'fetch', message: 'engine does no IO' },
        { name: 'setTimeout', message: 'engine has no clock' },
        { name: 'setInterval', message: 'engine has no clock' },
        { name: 'performance', message: 'engine has no clock' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'use the injected Rng' },
        { object: 'Date', property: 'now', message: 'engine has no clock' },
        { object: 'crypto', property: 'getRandomValues', message: 'use the injected Rng' },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'e2e/**/*.ts', 'scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { project: null, projectService: false },
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        document: 'readonly',
      },
    },
  },
  prettier,
);
