import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const HEADERS = ['Fecha', 'Nombre', 'Teléfono', 'Ceremonia', 'Recepción', 'Invitación'];
const ANSWER = {
	nombre: 'Ana López',
	telefono: '+52 555 000 00 00',
	ceremonia: 'Sí',
	recepcion: 'No',
	invitacion: 'Familia López',
};

// Runs the Apps Script files in a sandbox, with fakes for the Google services they use.
// `rows` is the RSVP tab, one array per row; arrays from the sandbox are copied into this
// realm so assert can compare them. `sent` collects the emails and fetched URLs.
function load({ files = ['Code.gs'], rows = [], properties = {}, failing = false } = {}) {
	const sent = { emails: [], urls: [] };
	const sheet = {
		getLastColumn: () => Math.max(0, ...rows.map((row) => row.length)),
		appendRow: (row) => rows.push([...row]),
		setFrozenRows: () => {},
		getRange: (row, column) => ({
			setValues: ([values]) => {
				rows[row - 1] ??= [];
				[...values].forEach((value, i) => {
					rows[row - 1][column - 1 + i] = value;
				});
			},
		}),
	};
	const context = vm.createContext({
		console: { log() {}, warn() {}, error() {} },
		ContentService: {
			MimeType: { JSON: 'application/json' },
			createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }),
		},
		LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
		SpreadsheetApp: {
			getActiveSpreadsheet: () => ({
				getSheetByName: () => sheet,
				insertSheet: () => sheet,
				getUrl: () => 'https://docs.google.com/spreadsheets/d/example',
			}),
		},
		PropertiesService: {
			getScriptProperties: () => ({ getProperties: () => ({ ...properties }) }),
		},
		MailApp: {
			sendEmail: (message) => {
				if (failing) throw new Error('Service invoked too many times for one day: email.');
				sent.emails.push({ ...message });
			},
		},
		UrlFetchApp: {
			fetch: (url) => {
				sent.urls.push(new URL(url));
				return {
					getResponseCode: () => (failing ? 500 : 200),
					getContentText: () => '<p>Message queued.</p>',
				};
			},
		},
	});

	for (const file of files) {
		vm.runInContext(readFileSync(new URL(file, import.meta.url), 'utf8'), context);
	}

	return {
		rows,
		sent,
		post: (data) => context.doPost({ postData: { contents: JSON.stringify(data) } }),
		postText: (text) => context.doPost({ postData: { contents: text } }),
	};
}

test('appends one row per answer, with the invitation it came from', () => {
	const { rows, post } = load();

	assert.deepEqual(post(ANSWER), { ok: true });
	assert.deepEqual(rows[0], HEADERS);
	assert.deepEqual(rows[1].slice(1), [
		'Ana López',
		"'+52 555 000 00 00",
		'Sí',
		'No',
		'Familia López',
	]);
});

test('stores guest text that Sheets would read as a formula as plain text', () => {
	const { rows, post } = load();

	post({ ...ANSWER, nombre: '=HYPERLINK("https://example.com")', invitacion: '@Familia' });
	assert.equal(rows[1][1], '\'=HYPERLINK("https://example.com")');
	assert.equal(rows[1][5], "'@Familia");
});

test('leaves the invitation empty when the guest had no personalized link', () => {
	const { rows, post } = load();

	post({ ...ANSWER, invitacion: undefined });
	assert.equal(rows[1][5], '');
});

test('adds the missing headers to a tab made by an older version', () => {
	const { rows, post } = load({ rows: [HEADERS.slice(0, 5)] });

	post(ANSWER);
	assert.deepEqual(rows[0], HEADERS);
	assert.equal(rows.length, 2);
});

test('stores nothing for honeypot submissions, incomplete answers or bad JSON', () => {
	const { rows, post, postText } = load();

	assert.deepEqual(post({ ...ANSWER, website: 'https://spam.example' }), { ok: true });
	assert.deepEqual(post({ ...ANSWER, recepcion: 'Tal vez' }), {
		ok: false,
		error: 'missing-fields',
	});
	assert.deepEqual(post({ ...ANSWER, nombre: '   ' }), { ok: false, error: 'missing-fields' });
	assert.deepEqual(postText('nombre=Ana'), { ok: false, error: 'invalid-json' });
	assert.equal(rows.length, 0);
});

const BOTH_CHANNELS = {
	NOTIFY_EMAIL: 'novia@example.com, novio@example.com',
	CALLMEBOT_PHONE: '+52 55 1234 5678',
	CALLMEBOT_APIKEY: '123456',
};

test('sends no notifications without Notifications.gs, even with the settings', () => {
	const { sent, post } = load({ properties: BOTH_CHANNELS });

	assert.deepEqual(post(ANSWER), { ok: true });
	assert.deepEqual(sent, { emails: [], urls: [] });
});

test('emails each answer to NOTIFY_EMAIL', () => {
	const { sent, post } = load({
		files: ['Code.gs', 'Notifications.gs'],
		properties: { NOTIFY_EMAIL: BOTH_CHANNELS.NOTIFY_EMAIL },
	});

	post(ANSWER);
	assert.equal(sent.emails.length, 1);
	assert.equal(sent.emails[0].to, 'novia@example.com, novio@example.com');
	assert.equal(sent.emails[0].subject, 'Nueva respuesta: Ana López');
	assert.match(sent.emails[0].body, /Ceremonia: Sí\nRecepción: No\nTeléfono: \+52 555 000 00 00/);
	assert.match(sent.emails[0].body, /Invitación: Familia López/);
	assert.match(sent.emails[0].body, /docs\.google\.com\/spreadsheets/);
	assert.deepEqual(sent.urls, []);
});

test('sends each answer by WhatsApp through CallMeBot', () => {
	const { sent, post } = load({
		files: ['Code.gs', 'Notifications.gs'],
		properties: { CALLMEBOT_PHONE: ' +52 55 1234 5678 ', CALLMEBOT_APIKEY: '123456' },
	});

	post({ ...ANSWER, invitacion: '' });
	assert.equal(sent.urls.length, 1);

	const url = sent.urls[0];
	assert.equal(url.origin + url.pathname, 'https://api.callmebot.com/whatsapp.php');
	assert.equal(url.searchParams.get('phone'), '+52 55 1234 5678');
	assert.equal(url.searchParams.get('apikey'), '123456');
	assert.equal(
		url.searchParams.get('text'),
		'💌 *Ana López* respondió a la invitación\nCeremonia: Sí\nRecepción: No\nTeléfono: +52 555 000 00 00',
	);
	assert.deepEqual(sent.emails, []);
});

test('a failed notification never loses the answer', () => {
	const { rows, post } = load({
		files: ['Code.gs', 'Notifications.gs'],
		properties: BOTH_CHANNELS,
		failing: true,
	});

	assert.deepEqual(post(ANSWER), { ok: true });
	assert.equal(rows.length, 2);
});

test('notifies nothing for answers that are not stored', () => {
	const { sent, post } = load({
		files: ['Code.gs', 'Notifications.gs'],
		properties: BOTH_CHANNELS,
	});

	post({ ...ANSWER, website: 'https://spam.example' });
	post({ ...ANSWER, telefono: '' });
	assert.deepEqual(sent, { emails: [], urls: [] });
});
