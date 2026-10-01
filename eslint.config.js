import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'data/**'] },
  js.configs.recommended,
  {
    files: ['shared/**/*.js', 'server/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
    },
  },
  {
    rules: {
      // React: shadcn/ui files keep `import * as React` although JSX doesn't need it.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|React$)' }],
      eqeqeq: ['error', 'always'],
    },
  },
  prettier,
];
