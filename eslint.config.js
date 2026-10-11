import js from '@eslint/js';
import globals from 'globals';

export default [
	{
		ignores: ['dist/'],
	},
	js.configs.recommended,
	{
		rules: {
			'no-unused-vars': 'warn',
		},
	},
	{
		// Site code, bundled by Vite for the browser
		files: ['src/**/*.js'],
		languageOptions: {
			globals: globals.browser,
		},
	},
	{
		// Build tooling: Vite config and plugins run in Node
		files: ['*.js', 'plugins/**/*.js'],
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		// Google Apps Script runs .gs files as classic scripts with its own services as globals
		files: ['apps-script/**/*.gs'],
		languageOptions: {
			sourceType: 'script',
			globals: {
				ContentService: 'readonly',
				LockService: 'readonly',
				SpreadsheetApp: 'readonly',
			},
		},
	},
];
