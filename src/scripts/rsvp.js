import { guestName } from './guest.js';

// ---- RSVP form ----
// VITE_RSVP_MODE picks where answers go (checked at build time in vite.config.js):
//   demo         default. No network call: success is simulated, so a public demo
//                never collects real guest data.
//   apps-script  POSTs to the Google Apps Script web app at VITE_RSVP_ENDPOINT,
//                which appends a row to a Google Sheet (see apps-script/Code.gs).
const RSVP_MODE = import.meta.env.VITE_RSVP_MODE || 'demo';
const RSVP_ENDPOINT = import.meta.env.VITE_RSVP_ENDPOINT;
const DEMO_DELAY_MS = 800;

// ---- Phone number formatting ----
// Strips anything that isn't a digit or a leading "+", then groups the
// local 10 digits as XXX XXX XX XX. If a country code is present
// (digits beyond the last 10, only when the value starts with "+"),
// it's kept separate: "+52 000 000 00 00".
function formatPhoneInput(raw) {
	const hasPlus = raw.trim().startsWith('+');
	const digits = raw.replace(/\D/g, '');

	let countryCode = '';
	let local = digits;

	if (hasPlus && digits.length > 10) {
		countryCode = digits.slice(0, digits.length - 10);
		local = digits.slice(-10);
	}

	const groupSizes = [3, 3, 2, 2];
	let localFormatted = '';
	let idx = 0;
	for (const size of groupSizes) {
		if (idx >= local.length) break;
		if (localFormatted) localFormatted += ' ';
		localFormatted += local.slice(idx, idx + size);
		idx += size;
	}

	if (hasPlus) {
		let result = `+${countryCode}`;
		if (localFormatted) result += ` ${localFormatted}`;
		return result;
	}

	return localFormatted;
}

function sendDemo(payload) {
	console.info('[RSVP demo] Nothing was sent. This is what would be saved:', payload);
	return new Promise((resolve) => setTimeout(resolve, DEMO_DELAY_MS));
}

async function sendToAppsScript(payload) {
	// A text/plain body keeps this a "simple" CORS request: no preflight (which Apps
	// Script can't answer), and the JSON reply from Code.gs stays readable, so a
	// failed save is reported to the guest instead of assumed to have worked.
	const response = await fetch(RSVP_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'text/plain;charset=utf-8' },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(`RSVP endpoint responded with HTTP ${response.status}`);
	}

	const result = await response.json();

	if (!result.ok) {
		throw new Error(`RSVP endpoint rejected the answer: ${result.error}`);
	}
}

const send = RSVP_MODE === 'apps-script' ? sendToAppsScript : sendDemo;

export function initRsvp() {
	const form = document.getElementById('rsvp-form');
	const fields = document.getElementById('rsvp-fields');
	const answers = document.getElementById('rsvp-answers');
	const successMessage = document.getElementById('rsvp-success');
	const errorMessage = document.getElementById('rsvp-error');
	const submitButton = form.querySelector('.rsvp-form__submit');
	const nombreInput = document.getElementById('rsvp-nombre');
	const telefonoInput = document.getElementById('rsvp-telefono');
	const toggles = form.querySelectorAll('.rsvp-form__toggle');

	// The message sits under the submit button in a role="alert" element, so screen
	// readers announce it. Focus goes to the field that needs fixing, if there is one.
	function showError(message, field) {
		errorMessage.textContent = message;
		field?.focus();
	}

	// Any change means the guest is fixing things; the next submit checks again.
	function clearError() {
		errorMessage.textContent = '';
	}

	form.addEventListener('input', clearError);

	telefonoInput.addEventListener('input', (event) => {
		const cursorAtEnd = event.target.selectionStart === event.target.value.length;
		event.target.value = formatPhoneInput(event.target.value);

		// Reformatting moves the cursor to the end by default; only worth
		// preserving "end position" typing (the common case), not mid-string edits.
		if (cursorAtEnd) {
			event.target.setSelectionRange(event.target.value.length, event.target.value.length);
		}
	});

	const attendance = {
		ceremonia: null,
		recepcion: null,
	};

	toggles.forEach((toggle) => {
		const eventName = toggle.dataset.event;

		toggle.querySelectorAll('.rsvp-form__pill').forEach((pill) => {
			pill.addEventListener('click', () => {
				toggle.querySelectorAll('.rsvp-form__pill').forEach((p) => {
					p.classList.remove('rsvp-form__pill--active');
					p.setAttribute('aria-pressed', 'false');
				});

				pill.classList.add('rsvp-form__pill--active');
				pill.setAttribute('aria-pressed', 'true');
				attendance[eventName] = pill.dataset.value;
				toggle.classList.remove('rsvp-form__toggle--missing');
				clearError();
			});
		});
	});

	// The fields and answers give way to a message inside the frame. The frame's parts keep
	// their height, so it doesn't shrink and pull the rest of the page up.
	function replaceForm(message) {
		form.querySelectorAll('.confirmacion__top, .confirmacion__bottom').forEach((part) => {
			part.style.minHeight = `${part.offsetHeight}px`;
		});
		fields.hidden = true;
		answers.hidden = true;
		message.hidden = false;
	}

	function showSuccess() {
		replaceForm(successMessage);
		// The focused submit button just disappeared; move focus so screen
		// readers announce the confirmation.
		successMessage.focus();
	}

	form.addEventListener('submit', async (event) => {
		event.preventDefault();

		// Honeypot: people never see this field, so a value means a bot filled it in.
		// Pretend it worked so the bot has no reason to try again, but send nothing.
		if (form.elements.website.value) {
			showSuccess();
			return;
		}

		clearError();

		// Empty fields are caught by the browser (they're `required`); this catches
		// names and phones made of spaces only.
		const nombre = nombreInput.value.trim();
		const telefono = telefonoInput.value.trim();

		if (!nombre || !telefono) {
			showError(
				'Por favor completa tu nombre y teléfono.',
				nombre ? telefonoInput : nombreInput,
			);
			return;
		}

		const unanswered = [...toggles].filter((toggle) => !attendance[toggle.dataset.event]);
		unanswered.forEach((toggle) => toggle.classList.add('rsvp-form__toggle--missing'));

		if (unanswered.length) {
			showError(
				'Por favor responde para ambos eventos.',
				unanswered[0].querySelector('.rsvp-form__pill'),
			);
			return;
		}

		const payload = {
			nombre,
			telefono,
			ceremonia: attendance.ceremonia,
			recepcion: attendance.recepcion,
			// The guest name from a personalized link, so the couple can tell which
			// invitation the answer is for ('' without one).
			invitacion: guestName(),
		};

		const submitLabel = submitButton.textContent;
		submitButton.disabled = true;
		submitButton.textContent = 'Enviando…';

		try {
			await send(payload);
			showSuccess();
		} catch (error) {
			console.error('RSVP submission failed:', error);
			showError('Hubo un problema al enviar tu confirmación. Intenta de nuevo.');
		} finally {
			submitButton.disabled = false;
			submitButton.textContent = submitLabel;
		}
	});
}
