// ---- Guest from the link ----
// A link ending in ?para=Familia%20Pérez&pases=4 is addressed to that guest: the
// envelope shows the name, the RSVP records which invitation each answer came from and
// offers up to that many people.
const NAME_PARAM = 'para';
const PASSES_PARAM = 'pases';
const MAX_LENGTH = 60;
const MAX_PASSES = 50;

// The name from the link, tidied up, or '' when the link has none. It comes from the URL,
// so anyone can write it: show it with textContent, never innerHTML.
export function guestName() {
	const name = new URLSearchParams(window.location.search).get(NAME_PARAM) ?? '';
	return name.replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
}

// How many people the invitation is for, or null when the link doesn't say (or says
// something that isn't a whole number from 1 to 50).
export function guestPasses() {
	const value = new URLSearchParams(window.location.search).get(PASSES_PARAM)?.trim() ?? '';
	const passes = Number(value);

	return /^\d+$/.test(value) && passes >= 1 && passes <= MAX_PASSES ? passes : null;
}
