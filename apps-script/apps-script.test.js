import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const HEADERS = [
	'Fecha',
	'Nombre',
	'Teléfono',
	'Personas',
	'Ceremonia',
	'Recepción',
	'Mensaje',
	'Invitación',
];
const ANSWER = {
	nombre: 'Invitada de Ejemplo',
	telefono: '+52 000 000 00 00',
	personas: 2,
	ceremonia: 'Sí',
	recepcion: 'No',
	mensaje: '¡Felicidades!',
	invitacion: 'Familia Ejemplo',
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
		getRange: (row, column, numRows, numColumns) => ({
			getValues: () => [
				Array.from({ length: numColumns }, (_, i) => rows[row - 1]?.[column - 1 + i] ?? ''),
			],
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

test('appends one row per answer, with the people, message and invitation', () => {
	const { rows, post } = load();

	assert.deepEqual(post(ANSWER), { ok: true });
	assert.deepEqual(rows[0], HEADERS);
	assert.deepEqual(rows[1].slice(1), [
		'Invitada de Ejemplo',
		"'+52 000 000 00 00",
		2,
		'Sí',
		'No',
		'¡Felicidades!',
		'Familia Ejemplo',
	]);
});

test('stores guest text that Sheets would read as a formula as plain text', () => {
	const { rows, post } = load();

	post({
		...ANSWER,
		nombre: '=HYPERLINK("https://example.com")',
		mensaje: '+1 de mi parte',
		invitacion: '@Familia',
	});
	assert.equal(rows[1][1], '\'=HYPERLINK("https://example.com")');
	assert.equal(rows[1][6], "'+1 de mi parte");
	assert.equal(rows[1][7], "'@Familia");
});

test('leaves the message and invitation empty when there are none', () => {
	const { rows, post } = load();

	post({ ...ANSWER, mensaje: '  ', invitacion: undefined });
	assert.equal(rows[1][6], '');
	assert.equal(rows[1][7], '');
});

test('caps the message at 500 characters', () => {
	const { rows, post } = load();

	post({ ...ANSWER, mensaje: 'a'.repeat(600) });
	assert.equal(rows[1][6].length, 500);
});

test('only takes a whole number of people from 1 to 50', () => {
	const { rows, post } = load();

	for (const personas of [0, -1, 51, 2.5, 'dos', null, undefined]) {
		assert.deepEqual(post({ ...ANSWER, personas }), { ok: false, error: 'missing-fields' });
	}

	assert.deepEqual(post({ ...ANSWER, personas: '3' }), { ok: true });
	assert.equal(rows[1][3], 3);
});

test('adds the missing headers to a tab made by an older version, at the end', () => {
	const old = ['Fecha', 'Nombre', 'Teléfono', 'Ceremonia', 'Recepción'];
	const { rows, post } = load({ rows: [[...old]] });

	post(ANSWER);
	assert.deepEqual(rows[0], [...old, 'Personas', 'Mensaje', 'Invitación']);
	assert.deepEqual(rows[1].slice(1), [
		'Invitada de Ejemplo',
		"'+52 000 000 00 00",
		'Sí',
		'No',
		2,
		'¡Felicidades!',
		'Familia Ejemplo',
	]);
});

test("fills each value under its header, leaving the couple's own columns alone", () => {
	const headers = ['Nombre', 'Mesa', ...HEADERS.filter((header) => header !== 'Nombre')];
	const { rows, post } = load({ rows: [[...headers]] });

	post(ANSWER);
	assert.deepEqual(rows[0], headers);
	assert.equal(rows[1][0], 'Invitada de Ejemplo');
	assert.equal(rows[1][1], '');
	// A Date from the sandbox's realm, so instanceof Date wouldn't do
	assert.equal(Object.prototype.toString.call(rows[1][2]), '[object Date]');
	assert.equal(rows[1][4], 2);
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
	CALLMEBOT_PHONE: '+52 000 000 0000',
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
	assert.equal(sent.emails[0].subject, 'Nueva respuesta: Invitada de Ejemplo');
	assert.match(
		sent.emails[0].body,
		/Personas: 2\nCeremonia: Sí\nRecepción: No\nTeléfono: \+52 000 000 00 00\nInvitación: Familia Ejemplo\nMensaje: ¡Felicidades!/,
	);
	assert.match(sent.emails[0].body, /docs\.google\.com\/spreadsheets/);
	assert.deepEqual(sent.urls, []);
});

test('sends each answer by WhatsApp through CallMeBot', () => {
	const { sent, post } = load({
		files: ['Code.gs', 'Notifications.gs'],
		properties: { CALLMEBOT_PHONE: ' +52 000 000 0000 ', CALLMEBOT_APIKEY: '123456' },
	});

	post({ ...ANSWER, invitacion: '' });
	assert.equal(sent.urls.length, 1);

	const url = sent.urls[0];
	assert.equal(url.origin + url.pathname, 'https://api.callmebot.com/whatsapp.php');
	assert.equal(url.searchParams.get('phone'), '+52 000 000 0000');
	assert.equal(url.searchParams.get('apikey'), '123456');
	assert.equal(
		url.searchParams.get('text'),
		'💌 *Invitada de Ejemplo* respondió a la invitación\nPersonas: 2\nCeremonia: Sí\nRecepción: No\nTeléfono: +52 000 000 00 00\nMensaje: ¡Felicidades!',
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
