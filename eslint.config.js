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
		// Build tooling and tests run in Node
		files: ['*.js', 'plugins/**/*.js', 'apps-script/**/*.js'],
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		// End-to-end tests run in Node, with callbacks that run in the page
		files: ['e2e/**/*.js'],
		languageOptions: {
			globals: { ...globals.node, ...globals.browser },
		},
	},
	{
		// Google Apps Script runs .gs files as classic scripts with its own services as globals
		files: ['apps-script/**/*.gs'],
		languageOptions: {
			sourceType: 'script',
			globals: {
				console: 'readonly',
				ContentService: 'readonly',
				LockService: 'readonly',
				MailApp: 'readonly',
				PropertiesService: 'readonly',
				SpreadsheetApp: 'readonly',
				UrlFetchApp: 'readonly',
			},
		},
	},
];
