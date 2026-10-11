import { guestName } from './guest.js';

// ---- Envelope ----
// The invitation starts covered by an envelope (see index.html). Opening it runs the
// animations in _envelope.scss in two steps, `is-opening` (the seal, flap and letter)
// and `is-leaving` (the envelope dissolves), then hands over to the invitation.

// Guest names longer than this get a smaller font, so they still fit in two lines.
const GUEST_LONG_LENGTH = 32;

// How much of the wax seal's width the monogram's ink may cover.
const MONOGRAM_FILL = 0.9;

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
	whenSealFontLoads(fitMonogram);

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

// A link ending in ?para=Familia%20Pérez writes "Para Familia Pérez" on the envelope.
function writeGuestName() {
	const name = guestName();

	if (!name) return;

	const guest = document.getElementById('envelope-guest');
	document.getElementById('envelope-guest-name').textContent = name;
	guest.classList.toggle('envelope__guest--long', name.length > GUEST_LONG_LENGTH);
	guest.hidden = false;
}

// Asks for the seal's font explicitly: this runs before the first layout, when the
// browser may not have requested it yet. Runs `callback` whether it loads or not.
function whenSealFontLoads(callback) {
	const monogram = document.getElementById('envelope-monogram');

	if (!monogram || !document.fonts) return;

	const { fontFamily } = getComputedStyle(monogram);

	document.fonts
		.load(`16px ${fontFamily}`, monogram.textContent)
		.catch(() => {})
		.then(callback);
}

// Script capitals differ a lot in width (an M is much wider than an I) and their swashes
// reach past the letter, so letter boxes say little about the drawn shapes. Once the
// font is in, this measures the ink of the initials and joiner as laid out on the seal,
// then shrinks the monogram (never enlarges it) and shifts it so the ink sits centered.
function fitMonogram() {
	const monogram = document.getElementById('envelope-monogram');
	const joiner = monogram?.querySelector('.envelope__seal-joiner');
	const context = document.createElement('canvas').getContext('2d');

	if (!joiner || !context?.measureText) return;

	monogram.style.removeProperty('--monogram-scale');
	monogram.style.removeProperty('--monogram-shift');

	const { fontFamily, fontSize } = getComputedStyle(monogram);
	const joinerStyle = getComputedStyle(joiner);
	const size = parseFloat(fontSize);
	const joinerSize = parseFloat(joinerStyle.fontSize);
	const joinerMargin = parseFloat(joinerStyle.marginLeft);
	const measure = (text, px) => {
		context.font = `${px}px ${fontFamily}`;
		return context.measureText(text);
	};

	// The three parts side by side, as the browser lays them out
	const parts = [
		[monogram.firstChild.textContent, size],
		[joiner.textContent, joinerSize],
		[monogram.lastChild.textContent, size],
	];
	let x = 0;
	let left = Infinity;
	let right = -Infinity;

	parts.forEach(([text, px], index) => {
		const metrics = measure(text, px);
		const margin = index === 1 ? joinerMargin : 0;

		x += margin;
		left = Math.min(left, x - metrics.actualBoundingBoxLeft);
		right = Math.max(right, x + metrics.actualBoundingBoxRight);
		x += metrics.width + margin;
	});

	const ink = right - left;
	const room = MONOGRAM_FILL * monogram.parentElement.offsetWidth;

	if (!(ink > 0) || !(room > 0)) return;

	// Both in em, so they hold at any size: the seal is sized in container units.
	monogram.style.setProperty('--monogram-scale', Math.min(1, room / ink).toFixed(3));
	monogram.style.setProperty(
		'--monogram-shift',
		((x / 2 - (left + right) / 2) / size).toFixed(3),
	);
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
