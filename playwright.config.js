import { defineConfig, devices } from '@playwright/test';
import invitationConfig from './src/invitation.config.js';

// End-to-end tests: the built site, served by `vite preview`, in a phone-sized Chromium
// (Android) and WebKit (Safari's engine, as on iPhones). Run with `npm run test:e2e`.
const PORT = 4173;
const BASE = new URL(invitationConfig.site.url).pathname.replace(/\/?$/, '/');

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	// Two browsers at a time, and room for the envelope's animations on a busy machine
	workers: 2,
	expect: { timeout: 10_000 },
	use: {
		baseURL: `http://localhost:${PORT}${BASE}`,
		trace: 'on-first-retry',
	},
	projects: [
		{ name: 'android', use: { ...devices['Pixel 7'] } },
		{ name: 'iphone', use: { ...devices['iPhone 15'] } },
	],
	webServer: {
		// The RSVP runs in demo mode here, whatever .env.local says
		command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}${BASE}`,
		env: { VITE_RSVP_MODE: 'demo' },
		reuseExistingServer: !process.env.CI,
	},
});
