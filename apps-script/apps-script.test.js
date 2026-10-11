import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const HEADERS = ['Fecha', 'Nombre', 'Teléfono', 'Ceremonia', 'Recepción', 'Invitación'];
const ANSWER = {
	nombre: 'Invitada de Ejemplo',
	telefono: '+52 000 000 00 00',
	ceremonia: 'Sí',
	recepcion: 'No',
	invitacion: 'Familia Ejemplo',
};

// Runs the Apps Script files in a sandbox, with fakes for the Google services they use.
// `rows` is the RSVP tab, one array per row; arrays from the sandbox are copied into this
// realm so assert can compare them.
function load({ files = ['Code.gs'], rows = [] } = {}) {
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
			getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }),
		},
	});

	for (const file of files) {
		vm.runInContext(readFileSync(new URL(file, import.meta.url), 'utf8'), context);
	}

	return {
		rows,
		post: (data) => context.doPost({ postData: { contents: JSON.stringify(data) } }),
		postText: (text) => context.doPost({ postData: { contents: text } }),
	};
}

test('appends one row per answer, with the invitation it came from', () => {
	const { rows, post } = load();

	assert.deepEqual(post(ANSWER), { ok: true });
	assert.deepEqual(rows[0], HEADERS);
	assert.deepEqual(rows[1].slice(1), [
		'Invitada de Ejemplo',
		"'+52 000 000 00 00",
		'Sí',
		'No',
		'Familia Ejemplo',
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
