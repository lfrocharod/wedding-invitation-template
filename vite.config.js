import { defineConfig, loadEnv } from 'vite';
import invitationConfig from './src/invitation.config.js';
import invitation from './plugins/vite-plugin-invitation.js';

const RSVP_MODES = ['demo', 'apps-script'];

export default defineConfig(({ mode }) => {
	// Fail the build early rather than ship an RSVP form that can't submit.
	const env = loadEnv(mode, process.cwd());
	const rsvpMode = env.VITE_RSVP_MODE || 'demo';

	if (!RSVP_MODES.includes(rsvpMode)) {
		throw new Error(
			`VITE_RSVP_MODE must be one of: ${RSVP_MODES.join(', ')} (got "${rsvpMode}").`,
		);
	}

	if (rsvpMode === 'apps-script' && !env.VITE_RSVP_ENDPOINT) {
		throw new Error('VITE_RSVP_MODE=apps-script needs VITE_RSVP_ENDPOINT. See .env.example.');
	}

	return {
		plugins: [invitation(invitationConfig)],
	};
});
