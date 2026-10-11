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

// What the WhatsApp and Telegram APIs answer, as far as Notifications.gs reads it
function reply(url, failing) {
	if (url.hostname === 'graph.facebook.com') {
		return failing
			? [401, { error: { message: 'Error validating access token', code: 190 } }]
			: [200, { messaging_product: 'whatsapp', messages: [{ id: 'wamid.TEST' }] }];
	}

	if (failing) {
		return [401, { ok: false, error_code: 401, description: 'Unauthorized' }];
	}

	if (url.pathname.endsWith('/getUpdates')) {
		return [
			200,
			{
				ok: true,
				result: [
					{
						update_id: 1,
						message: { text: '/start', chat: { id: 111, first_name: 'Novia' } },
					},
					{
						update_id: 2,
						message: { text: 'hola', chat: { id: 111, first_name: 'Novia' } },
					},
					{
						update_id: 3,
						message: { text: '/start', chat: { id: 222, first_name: 'Novio' } },
					},
				],
			},
		];
	}

	return [200, { ok: true, result: {} }];
}

// Runs the Apps Script files in a sandbox, with fakes for the Google services they use.
// `rows` is the RSVP tab, one array per row; arrays from the sandbox are copied into this
// realm so assert can compare them. `sent` collects the emails, the requests (URL, options
// and JSON payload) and what the scripts logged.
function load({ files = ['Code.gs'], rows = [], properties = {}, failing = false } = {}) {
	const sent = { emails: [], requests: [], logs: [] };
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
		console: {
			log: (...args) => sent.logs.push(args.join(' ')),
			warn: (...args) => sent.logs.push(args.join(' ')),
			error: (...args) => sent.logs.push(args.join(' ')),
		},
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
			getScriptProperties: () => ({
				getProperties: () => ({ ...properties }),
				getProperty: (name) => properties[name] ?? null,
			}),
		},
		MailApp: {
			sendEmail: (message) => {
				if (failing) throw new Error('Service invoked too many times for one day: email.');
				sent.emails.push({ ...message });
			},
		},
		UrlFetchApp: {
			fetch: (url, options = {}) => {
				const request = { url: new URL(url), options: { ...options } };
				request.payload = options.payload ? JSON.parse(options.payload) : null;
				sent.requests.push(request);

				const [status, body] = reply(request.url, failing);
				return {
					getResponseCode: () => status,
					getContentText: () => JSON.stringify(body),
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
		run: (name) => context[name](),
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

const EMAIL = { NOTIFY_EMAIL: 'novia@example.com, novio@example.com' };
const WHATSAPP = {
	WHATSAPP_TOKEN: 'EAAG-test-token',
	WHATSAPP_PHONE_ID: '106540352242922',
	WHATSAPP_TO: '+52 000 000 0000',
	WHATSAPP_TEMPLATE: 'nueva_respuesta',
};
const TELEGRAM = { TELEGRAM_TOKEN: '123456:ABC-test', TELEGRAM_CHAT_ID: '111' };
const ALL_CHANNELS = { ...EMAIL, ...WHATSAPP, ...TELEGRAM };
const WITH_NOTIFICATIONS = ['Code.gs', 'Notifications.gs'];

test('sends no notifications without Notifications.gs, even with the settings', () => {
	const { sent, post } = load({ properties: ALL_CHANNELS });

	assert.deepEqual(post(ANSWER), { ok: true });
	assert.equal(sent.emails.length + sent.requests.length, 0);
});

test('emails each answer to NOTIFY_EMAIL', () => {
	const { sent, post } = load({ files: WITH_NOTIFICATIONS, properties: EMAIL });

	post(ANSWER);
	assert.equal(sent.emails.length, 1);
	assert.equal(sent.emails[0].to, 'novia@example.com, novio@example.com');
	assert.equal(sent.emails[0].subject, 'Nueva respuesta: Invitada de Ejemplo (2 personas)');
	assert.match(
		sent.emails[0].body,
		/Personas: 2\nCeremonia: Sí\nRecepción: No\nTeléfono: \+52 000 000 00 00\nInvitación: Familia Ejemplo\nMensaje: ¡Felicidades!/,
	);
	assert.match(sent.emails[0].body, /docs\.google\.com\/spreadsheets/);
	assert.equal(sent.requests.length, 0);
});

test('sends each answer as an approved WhatsApp template through the Cloud API', () => {
	const { sent, post } = load({
		files: WITH_NOTIFICATIONS,
		properties: { ...WHATSAPP, WHATSAPP_TO: '+52 000 000 0000, 52 111 111 1111' },
	});

	post({ ...ANSWER, personas: 1 });
	assert.equal(sent.requests.length, 2, 'one message per number');

	const [first, second] = sent.requests;
	assert.equal(first.url.href, 'https://graph.facebook.com/v25.0/106540352242922/messages');
	assert.equal(first.options.method, 'post');
	assert.equal(first.options.headers.Authorization, 'Bearer EAAG-test-token');
	assert.deepEqual(first.payload, {
		messaging_product: 'whatsapp',
		recipient_type: 'individual',
		to: '520000000000',
		type: 'template',
		template: {
			name: 'nueva_respuesta',
			language: { code: 'es_MX' },
			components: [
				{
					type: 'body',
					parameters: [
						'Invitada de Ejemplo',
						'1 persona',
						'Sí',
						'No',
						'+52 000 000 00 00',
						'Invitación: Familia Ejemplo · Mensaje: ¡Felicidades!',
					].map((text) => ({ type: 'text', text })),
				},
			],
		},
	});
	assert.equal(second.payload.to, '521111111111');
});

test('gives WhatsApp template values without line breaks, and a dash for empty ones', () => {
	const { sent, post } = load({
		files: WITH_NOTIFICATIONS,
		properties: { ...WHATSAPP, WHATSAPP_LANGUAGE: 'es' },
	});

	post({ ...ANSWER, nombre: 'Ana\n\tLópez   Ruiz', mensaje: '', invitacion: '' });
	const { template } = sent.requests[0].payload;
	const values = template.components[0].parameters.map((parameter) => parameter.text);

	assert.equal(template.language.code, 'es');
	assert.equal(values[0], 'Ana López Ruiz');
	assert.equal(values[5], '—');
});

test('sends each answer to the Telegram chats, and lists the chats that wrote to the bot', () => {
	const { sent, post, run } = load({
		files: WITH_NOTIFICATIONS,
		properties: { ...TELEGRAM, TELEGRAM_CHAT_ID: '111, 222' },
	});

	post(ANSWER);
	assert.deepEqual(
		sent.requests.map((request) => request.url.href),
		[
			'https://api.telegram.org/bot123456:ABC-test/sendMessage',
			'https://api.telegram.org/bot123456:ABC-test/sendMessage',
		],
	);
	assert.deepEqual(
		sent.requests.map((request) => request.payload.chat_id),
		['111', '222'],
	);
	assert.equal(
		sent.requests[0].payload.text,
		'💌 Invitada de Ejemplo respondió a la invitación\nPersonas: 2\nCeremonia: Sí\nRecepción: No\nTeléfono: +52 000 000 00 00\nInvitación: Familia Ejemplo\nMensaje: ¡Felicidades!',
	);

	assert.deepEqual([...run('findTelegramChats')], [111, 222]);
	assert.ok(sent.logs.includes('Novia: 111') && sent.logs.includes('Novio: 222'));
});

test('a failed notification is logged and never loses the answer', () => {
	const { rows, sent, post } = load({
		files: WITH_NOTIFICATIONS,
		properties: ALL_CHANNELS,
		failing: true,
	});

	assert.deepEqual(post(ANSWER), { ok: true });
	assert.equal(rows.length, 2);
	assert.ok(sent.logs.some((log) => log.includes('WhatsApp answered HTTP 401')));
	assert.ok(sent.logs.some((log) => log.includes('Telegram answered HTTP 401: Unauthorized')));
});

test('notifies nothing for answers that are not stored', () => {
	const { sent, post } = load({ files: WITH_NOTIFICATIONS, properties: ALL_CHANNELS });

	post({ ...ANSWER, website: 'https://spam.example' });
	post({ ...ANSWER, telefono: '' });
	assert.equal(sent.emails.length + sent.requests.length, 0);
});
