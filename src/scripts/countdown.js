import invitation from '../invitation.config.js';

// ---- Countdown ----
// Counts down to the ceremony start set in src/invitation.config.js.
const WEDDING_DATE = new Date(invitation.date);

export function initCountdown() {
	const daysEl = document.getElementById('cd-days');
	const hoursEl = document.getElementById('cd-hours');
	const minutesEl = document.getElementById('cd-minutes');
	const secondsEl = document.getElementById('cd-seconds');

	const timer = setInterval(updateCountdown, 1000);
	updateCountdown();

	function updateCountdown() {
		const now = new Date();
		const diff = WEDDING_DATE - now;

		if (diff <= 0) {
			daysEl.textContent = '00';
			hoursEl.textContent = '00';
			minutesEl.textContent = '00';
			secondsEl.textContent = '00';
			clearInterval(timer);
			return;
		}

		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
		const minutes = Math.floor((diff / (1000 * 60)) % 60);
		const seconds = Math.floor((diff / 1000) % 60);

		daysEl.textContent = String(days).padStart(2, '0');
		hoursEl.textContent = String(hours).padStart(2, '0');
		minutesEl.textContent = String(minutes).padStart(2, '0');
		secondsEl.textContent = String(seconds).padStart(2, '0');
	}
}
