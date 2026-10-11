import { test } from 'node:test';
import assert from 'node:assert/strict';
import invitation from './vite-plugin-invitation.js';

const config = {
	site: { url: 'https://example.com/boda/', description: 'Línea 1\nLínea 2' },
	couple: { partner1: 'ángela', partner2: 'Novio', joiner: '&' },
	date: '2027-05-15T17:00:00-06:00',
	ceremony: {
		venue: 'Parroquia de San José',
		time: '5:00 pm',
		mapsUrl: 'https://maps.example/a',
	},
	reception: { venue: 'Jardín Las Flores', time: '7:30 pm', mapsUrl: 'https://maps.example/b' },
	calendar: { hours: 8 },
	gifts: { details: ['Banco: <Ejemplo>', 'CLABE: 000'] },
};

function render(html, overrides = {}) {
	return invitation({ ...config, ...overrides }).transformIndexHtml.handler(html);
}

// The .ics file as the build writes it to dist/.
function emittedCalendar() {
	let file;
	invitation(config).generateBundle.call({ emitFile: (emitted) => (file = emitted) });
	return file;
}

test('fills text placeholders, escaping HTML and turning line breaks into <br />', () => {
	assert.equal(render('<p>{{ site.description }}</p>'), '<p>Línea 1<br />Línea 2</p>');
	assert.equal(
		render('<p>{{ gifts.details }}</p>'),
		'<p>Banco: &lt;Ejemplo&gt;<br />CLABE: 000</p>',
	);
});

test('in attributes, collapses line breaks and joins lists with commas', () => {
	assert.equal(
		render('<meta content="{{ site.description }}" />'),
		'<meta content="Línea 1 Línea 2" />',
	);
	assert.equal(
		render('<img alt="{{ gifts.details }}" />'),
		'<img alt="Banco: &lt;Ejemplo&gt;, CLABE: 000" />',
	);
});

test('turns a list of { name, url } into links, and an empty one into nothing', () => {
	const gifts = {
		...config.gifts,
		registries: [
			{ name: 'Mesa "A" & B', url: 'https://registry.example/?a=1&b=2' },
			{ name: 'Otra', url: 'https://other.example/' },
		],
	};

	assert.equal(
		render('<p>{{ gifts.registries }}</p>', { gifts }),
		'<p><a href="https://registry.example/?a=1&amp;b=2" target="_blank" rel="noopener">Mesa &quot;A&quot; &amp; B</a> ' +
			'<a href="https://other.example/" target="_blank" rel="noopener">Otra</a></p>',
	);
	assert.equal(
		render('<p title="{{ gifts.registries }}"></p>', { gifts }),
		'<p title="Mesa &quot;A&quot; &amp; B, Otra"></p>',
	);
	assert.equal(render('<p>{{ gifts.registries }}</p>', { gifts: { registries: [] } }), '<p></p>');
});

test('fails the build on a link that is not http(s)', () => {
	const gifts = { registries: [{ name: 'X', url: 'javascript:alert(1)' }] };
	assert.throws(() => render('{{ gifts.registries }}', { gifts }), /gifts\.registries/);
});

test('derives the names, the initials for the wax seal and the date parts', () => {
	assert.equal(render('{{ couple.names }}'), 'ángela &amp; Novio');
	assert.equal(render('{{ couple.initials.partner1 }}{{ couple.initials.partner2 }}'), 'ÁN');
	assert.equal(
		render('{{ date.day }} {{ date.month }} {{ date.monthShort }} {{ date.year }}'),
		'15 Mayo May 2027',
	);
});

test('takes the calendar date at the venue, whatever the time zone of the build', () => {
	// 23:30 in Mexico City is already the 16th in UTC.
	assert.equal(render('{{ date.day }}', { date: '2027-05-15T23:30:00-06:00' }), '15');
});

test('keeps the site out of search results unless site.searchable is true', () => {
	const robots = '<meta name="robots" content="{{ site.robots }}" />';

	assert.equal(render(robots), '<meta name="robots" content="noindex, nofollow" />');
	assert.equal(
		render(robots, { site: { ...config.site, searchable: true } }),
		'<meta name="robots" content="index, follow" />',
	);
});

test('drops the trailing slash from site.url', () => {
	assert.equal(render('{{ site.url }}/'), 'https://example.com/boda/');
});

test('fails the build on a placeholder the config does not have', () => {
	assert.throws(() => render('{{ couple.nickname }}'), /couple\.nickname/);
});

test('fails the build on a date without a time, or a day the month does not have', () => {
	assert.throws(() => render('', { date: '2027-05-15' }), /ISO 8601/);
	assert.throws(() => render('', { date: '2027-02-30T17:00:00-06:00' }), /ISO 8601/);
});

test('fails the build when a partner has no name', () => {
	assert.throws(() => render('', { couple: { ...config.couple, partner2: ' ' } }), /partner/);
});

test('links to a Google Calendar event from the ceremony start, lasting calendar.hours', () => {
	const href = render('{{ calendar.google }}');
	const url = new URL(href.replaceAll('&amp;', '&'));

	assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
	assert.equal(url.searchParams.get('dates'), '20270515T230000Z/20270516T070000Z');
	assert.equal(url.searchParams.get('text'), 'Boda de ángela & Novio');
	assert.equal(url.searchParams.get('location'), 'Parroquia de San José');
	assert.match(url.searchParams.get('details'), /\nRecepción: Jardín Las Flores, 7:30 pm\n/);
});

test('links the .ics file under the base path of site.url', () => {
	assert.equal(render('{{ calendar.ics }}'), '/boda/boda.ics');
	assert.equal(
		render('{{ calendar.ics }}', { site: { url: 'https://boda.example' } }),
		'/boda.ics',
	);
});

test('writes an iCalendar file with escaped text and lines of at most 75 bytes', () => {
	const { fileName, source } = emittedCalendar();
	const lines = source.split('\r\n');
	const unfolded = source.replaceAll('\r\n ', '');

	assert.equal(fileName, 'boda.ics');
	assert.ok(source.endsWith('\r\n') && !/[^\r]\n/.test(source), 'CRLF line endings only');
	assert.ok(
		lines.every((line) => Buffer.byteLength(line) <= 75),
		'lines folded at 75 bytes',
	);
	assert.match(unfolded, /\r\nDTSTART:20270515T230000Z\r\nDTEND:20270516T070000Z\r\n/);
	assert.match(unfolded, /\r\nSUMMARY:Boda de ángela & Novio\r\n/);
	assert.match(
		unfolded,
		/\r\nDESCRIPTION:Ceremonia: Parroquia de San José\\, 5:00 pm\\nhttps:\/\/maps\.example\/a\\n/,
	);
});

test('serves the .ics file from the dev server', () => {
	let middleware;
	invitation(config).configureServer({ middlewares: { use: (fn) => (middleware = fn) } });

	const response = { headers: {}, setHeader: (k, v) => (response.headers[k] = v) };
	response.end = (body) => (response.body = body);
	middleware({ url: '/boda/boda.ics?v=2' }, response, () => assert.fail('not served'));

	assert.equal(response.headers['Content-Type'], 'text/calendar; charset=utf-8');
	assert.match(response.body, /^BEGIN:VCALENDAR\r\n/);

	let passedOn = false;
	middleware({ url: '/boda/' }, response, () => (passedOn = true));
	assert.ok(passedOn, 'other requests go on to Vite');
});

test('turns rsvp.deadline into the text shown and the end of that day at the venue', () => {
	const html = '<p data-closes="{{ rsvp.closesAt }}">{{ rsvp.deadlineText }}</p>';

	assert.equal(
		render(html, { rsvp: { deadline: '2027-04-01' } }),
		'<p data-closes="2027-04-01T23:59:59-06:00">1\u00a0de\u00a0abril</p>',
	);
	assert.equal(render(html, { rsvp: { deadline: '' } }), '<p data-closes=""></p>');
	assert.equal(render(html, { rsvp: {} }), '<p data-closes=""></p>');
});

test('fails the build on an RSVP deadline that is not a date before the wedding', () => {
	assert.throws(() => render('', { rsvp: { deadline: '15/04/2027' } }), /rsvp\.deadline/);
	assert.throws(() => render('', { rsvp: { deadline: '2027-02-30' } }), /rsvp\.deadline/);
	assert.throws(() => render('', { rsvp: { deadline: '2027-05-15' } }), /before the wedding/);
});

test('fails the build without calendar.hours', () => {
	assert.throws(() => render('', { calendar: {} }), /calendar\.hours/);
});
