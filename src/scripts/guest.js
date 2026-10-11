// ---- Guest from the link ----
// A link ending in ?para=Familia%20Pérez is addressed to that guest: the envelope shows
// the name, and the RSVP records which invitation each answer came from.
const PARAM = 'para';
const MAX_LENGTH = 60;

// The name from the link, tidied up, or '' when the link has none. It comes from the URL,
// so anyone can write it: show it with textContent, never innerHTML.
export function guestName() {
	const name = new URLSearchParams(window.location.search).get(PARAM) ?? '';
	return name.replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
}
