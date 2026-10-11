// ---- Envelope ----
// The invitation starts covered by an envelope (see index.html). Opening it runs the
// animations in _envelope.scss in two steps, `is-opening` (the seal, flap and letter)
// and `is-leaving` (the envelope dissolves), then hands over to the invitation.

// A link ending in ?para=Familia%20Pérez writes "Para Familia Pérez" on the envelope.
const GUEST_PARAM = 'para';
const GUEST_MAX_LENGTH = 60;
// Longer names get a smaller font, so they still fit in two lines.
const GUEST_LONG_LENGTH = 32;

// onOpen runs inside the guest's tap, which browsers require before playing sound.
// onOpened runs once the envelope is gone, to start the invitation's own animations.
export function initEnvelope({ onOpen, onOpened }) {
	const envelope = document.getElementById('envelope');
	const invitation = document.getElementById('invitation');

	// Without an envelope in index.html, the invitation is there from the start.
	if (!envelope) {
		onOpened();
		return;
	}

	const button = document.getElementById('envelope-button');
	let opened = false;

	writeGuestName();

	// While it's closed, keyboard focus and screen readers stay on the envelope.
	invitation.inert = true;

	button.addEventListener('click', async () => {
		if (opened) return;
		opened = true;

		onOpen();

		envelope.classList.add('is-opening');
		await animationsFinished(envelope);

		envelope.classList.add('is-leaving');
		await animationsFinished(envelope);

		envelope.hidden = true;
		invitation.inert = false;
		// The focused button is gone: carry on from the start of the invitation.
		invitation.focus({ preventScroll: true });
		onOpened();
	});
}

function writeGuestName() {
	const name = new URLSearchParams(window.location.search)
		.get(GUEST_PARAM)
		?.replace(/\s+/g, ' ')
		.trim()
		.slice(0, GUEST_MAX_LENGTH);

	if (!name) return;

	const guest = document.getElementById('envelope-guest');
	// textContent, never innerHTML: the name comes from the URL, so anyone can write it.
	document.getElementById('envelope-guest-name').textContent = name;
	guest.classList.toggle('envelope__guest--long', name.length > GUEST_LONG_LENGTH);
	guest.hidden = false;
}

// Resolves once the CSS animations and transitions now running inside `element` end,
// so their timing lives only in the stylesheet. With reduced motion there may be none.
// Endless ones (the pulsing hint) would never end, so they aren't waited for.
function animationsFinished(element) {
	const animations = element.getAnimations?.({ subtree: true }) ?? [];

	return Promise.allSettled(
		animations
			.filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
			.map((animation) => animation.finished),
	);
}
