/**
 * Fills the {{ placeholders }} in index.html with values from src/invitation.config.js.
 *
 * It runs at build time (and on each dev-server request), so the content ships as
 * static HTML: link-preview crawlers like WhatsApp's don't run JavaScript.
 *
 *   {{ couple.partner1 }}  value at that path in the config, HTML-escaped
 *   in text               "\n" and array items become <br /> line breaks
 *   in attributes         newlines collapse to spaces, arrays join with ", "
 *
 * An unknown placeholder fails the build instead of showing "{{ … }}" to guests.
 *
 * It also makes the "Agregar al calendario" event: a Google Calendar link for the page,
 * and an .ics file (iPhone, Outlook) that the dev server serves and the build writes to
 * dist/, as a real file served as text/calendar is what iPhones offer to add.
 */

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;
const TAG = /<[^>]+>/g;
const CALENDAR_FILE = 'boda.ics';

const MONTHS = [
	'Enero',
	'Febrero',
	'Marzo',
	'Abril',
	'Mayo',
	'Junio',
	'Julio',
	'Agosto',
	'Septiembre',
	'Octubre',
	'Noviembre',
	'Diciembre',
];

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

// The parts are read straight from the ISO string, i.e. the calendar date at the
// venue, so the time zone of the machine running the build can't shift the day.
function dateParts(iso) {
	const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(iso);

	if (!match || Number.isNaN(Date.parse(iso))) {
		throw new Error(
			`[invitation] "date" must be an ISO 8601 date-time such as 2027-05-15T17:00:00-06:00 (got "${iso}").`,
		);
	}

	const [, year, month, day] = match;
	const monthName = MONTHS[Number(month) - 1];

	return {
		iso,
		day: String(Number(day)),
		month: monthName,
		monthShort: monthName.slice(0, 3),
		year,
	};
}

// First letter of a name, for the monogram on the envelope's wax seal.
function initial(name) {
	const [letter] = String(name ?? '').trim();

	if (!letter) {
		throw new Error('[invitation] "couple.partner1" and "couple.partner2" need a name.');
	}

	return letter.toLocaleUpperCase('es');
}

// Values derived from the config, so index.html can stay free of logic.
function buildContext(config) {
	const { partner1, partner2, joiner } = config.couple;
	const site = { ...config.site, url: config.site.url.replace(/\/+$/, '') };
	const names = `${partner1} ${joiner} ${partner2}`;
	const event = calendarEvent(config, site.url, names);

	return {
		...config,
		site,
		couple: {
			...config.couple,
			names,
			initials: { partner1: initial(partner1), partner2: initial(partner2) },
		},
		date: dateParts(config.date),
		calendar: {
			...config.calendar,
			google: googleCalendarUrl(event),
			// The site's base path comes from site.url, as in vite.config.js.
			ics: `${new URL(site.url).pathname.replace(/\/?$/, '/')}${CALENDAR_FILE}`,
		},
		event,
	};
}

// ---- Calendar ----
// One event from the ceremony start, lasting calendar.hours, at the ceremony venue, with
// both venues and the invitation link in its description.
function calendarEvent(config, siteUrl, names) {
	const hours = Number(config.calendar?.hours);

	if (!(hours > 0)) {
		throw new Error(
			'[invitation] "calendar.hours" must be how long the celebration lasts, in hours (e.g. 8).',
		);
	}

	const oneLine = (text) => String(text).replaceAll('\n', ' ');
	const start = new Date(config.date);
	const { ceremony, reception } = config;

	return {
		title: `Boda de ${names}`,
		start,
		end: new Date(start.getTime() + hours * 60 * 60 * 1000),
		location: oneLine(ceremony.venue),
		details: [
			`Ceremonia: ${oneLine(ceremony.venue)}, ${ceremony.time}`,
			ceremony.mapsUrl,
			'',
			`Recepción: ${oneLine(reception.venue)}, ${reception.time}`,
			reception.mapsUrl,
			'',
			`Invitación: ${siteUrl}/`,
		].join('\n'),
		url: `${siteUrl}/`,
		uid: `boda-${utcStamp(start)}@${new URL(siteUrl).hostname}`,
	};
}

// 2027-05-15T17:00:00-06:00 -> 20270515T230000Z, the UTC form both formats accept.
function utcStamp(date) {
	return date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
}

function googleCalendarUrl(event) {
	const params = {
		action: 'TEMPLATE',
		text: event.title,
		dates: `${utcStamp(event.start)}/${utcStamp(event.end)}`,
		details: event.details,
		location: event.location,
	};
	const query = Object.entries(params)
		.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
		.join('&');

	return `https://calendar.google.com/calendar/render?${query}`;
}

// An iCalendar (RFC 5545) file with the event, CRLF line endings included.
function icsFile(event, now = new Date()) {
	// Text values escape backslashes, semicolons, commas and line breaks.
	const text = (value) => value.replace(/[\\;,]/g, '\\$&').replaceAll('\n', '\\n');
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//wedding-invitation-template//ES',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${event.uid}`,
		`DTSTAMP:${utcStamp(now)}`,
		`DTSTART:${utcStamp(event.start)}`,
		`DTEND:${utcStamp(event.end)}`,
		`SUMMARY:${text(event.title)}`,
		`LOCATION:${text(event.location)}`,
		`DESCRIPTION:${text(event.details)}`,
		`URL:${event.url}`,
		'END:VEVENT',
		'END:VCALENDAR',
	];

	return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

// iCalendar lines can't exceed 75 bytes: longer ones continue on lines that start with a
// space, split between characters (never inside one, as accents take two bytes).
function foldLine(line) {
	const parts = [''];

	for (const character of line) {
		const limit = parts.length === 1 ? 75 : 74;

		if (Buffer.byteLength(parts.at(-1) + character) > limit) {
			parts.push('');
		}

		parts[parts.length - 1] += character;
	}

	return parts.join('\r\n ');
}

function lookup(context, path) {
	const value = path.split('.').reduce((node, key) => node?.[key], context);

	if (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)) {
		return value;
	}

	throw new Error(
		`[invitation] index.html uses {{ ${path} }}, but src/invitation.config.js has no text at that path.`,
	);
}

export default function invitation(config) {
	const context = buildContext(config);
	const calendarFile = icsFile(context.event);

	const asText = (path) => {
		const value = lookup(context, path);
		const lines = Array.isArray(value) ? value : String(value).split('\n');
		return lines.map(escapeHtml).join('<br />');
	};

	const asAttribute = (path) => {
		const value = lookup(context, path);
		return escapeHtml(
			Array.isArray(value) ? value.join(', ') : String(value).replaceAll('\n', ' '),
		);
	};

	return {
		name: 'invitation-config',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (!req.url?.split('?')[0].endsWith(`/${CALENDAR_FILE}`)) {
					next();
					return;
				}

				res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
				res.end(calendarFile);
			});
		},
		generateBundle() {
			this.emitFile({ type: 'asset', fileName: CALENDAR_FILE, source: calendarFile });
		},
		transformIndexHtml: {
			// Run before Vite resolves src/href URLs, so it sees the real image paths.
			order: 'pre',
			handler(html) {
				return html
					.replace(TAG, (tag) => tag.replace(PLACEHOLDER, (_, path) => asAttribute(path)))
					.replace(PLACEHOLDER, (_, path) => asText(path));
			},
		},
	};
}
