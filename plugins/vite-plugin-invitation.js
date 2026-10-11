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
 */

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;
const TAG = /<[^>]+>/g;

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

// Values derived from the config, so index.html can stay free of logic.
function buildContext(config) {
	const { partner1, partner2, joiner } = config.couple;

	return {
		...config,
		site: { ...config.site, url: config.site.url.replace(/\/+$/, '') },
		couple: { ...config.couple, names: `${partner1} ${joiner} ${partner2}` },
		date: dateParts(config.date),
	};
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
