import invitation from '../invitation.config.js';

// ---- Background music ----
// The <audio> in index.html has no controls, so there's no visible player. Browsers only
// let a page play sound once the visitor has interacted with it, and Safari only from
// inside that interaction, so playMusic() runs straight from the tap that opens the
// envelope rather than when its animation ends.
//
// On iPhones the volume can't be set from a page (it plays at the device's media volume)
// and, like a video, the song plays even with the silent switch on.
const FADE_IN_MS = 2500;

let audio;
let toggle;
let volume = 1;
let fadeFrame = 0;
// Whether the song should be playing: from the envelope's tap until the guest pauses it.
let wanted = false;

export function initMusic() {
	audio = document.getElementById('music');
	toggle = document.getElementById('music-toggle');

	if (!audio) return;

	// Pause while the tab is in the background, e.g. after a "ubicación" link opens Google
	// Maps, and pick up again on return unless the guest paused it.
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
			audio.pause();
		} else if (wanted) {
			play();
		}
	});

	if (!toggle) return;

	toggle.addEventListener('click', () => {
		wanted = audio.paused;

		if (wanted) {
			play();
		} else {
			audio.pause();
		}
	});

	const syncToggle = () => {
		toggle.textContent = audio.paused ? 'Reproducir música' : 'Pausar música';
	};
	audio.addEventListener('play', syncToggle);
	audio.addEventListener('pause', syncToggle);
}

// Must be called synchronously from a tap or click handler (see above).
export function playMusic() {
	if (!audio) return;

	volume = toVolume(invitation.music?.volume);
	audio.volume = 0;
	wanted = true;
	play();
}

function play() {
	audio
		.play()
		.then(() => {
			if (toggle) toggle.hidden = false;
			// Only the first time: later plays (back from another tab) keep the volume.
			if (audio.volume < volume) fadeIn();
		})
		.catch((error) => {
			// An AbortError only means the tab was hidden before the song started; it
			// plays on return. Anything else (blocked, file missing) and the invitation
			// simply goes on without music.
			if (error.name !== 'AbortError') {
				console.warn('[music] The song could not play:', error);
			}
		});
}

// Eases the song in instead of starting at full volume. iPhones don't let pages change
// the volume, so there it starts at the device volume straight away.
function fadeIn() {
	const start = performance.now();
	const from = audio.volume;

	cancelAnimationFrame(fadeFrame);
	fadeFrame = requestAnimationFrame(function step() {
		const progress = Math.min((performance.now() - start) / FADE_IN_MS, 1);
		audio.volume = from + (volume - from) * progress;

		if (progress < 1) fadeFrame = requestAnimationFrame(step);
	});
}

// HTMLMediaElement.volume throws outside 0–1, so a typo in the config can't break the page.
function toVolume(value) {
	const number = Number(value ?? 1);
	return Number.isFinite(number) ? Math.min(Math.max(number, 0), 1) : 1;
}
