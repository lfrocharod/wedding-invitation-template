/**
 * RSVP backend for the wedding invitation template.
 *
 * Bound to a Google Sheet (Extensions > Apps Script) and deployed as a web app, it
 * receives the RSVP form as JSON and appends one row per answer to the "RSVP" tab,
 * creating the tab and its header row on first use. Values go into the column with the
 * matching header, so the couple can reorder the columns or add their own (a table
 * number, say), and a tab made by an older version gets the headers it's missing added
 * at the end. Setup steps are in README.md.
 */

/* exported doGet, doPost */
/* global notifyRsvp */

const SHEET_NAME = 'RSVP';
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
const ANSWERS = ['Sí', 'No'];
const MAX_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 500;
const MAX_PEOPLE = 50;

function doPost(e) {
	const data = parseBody(e);

	if (!data) {
		return respond({ ok: false, error: 'invalid-json' });
	}

	// Honeypot: the form's hidden "website" field is only ever filled in by bots.
	// Answer "ok" so they have no reason to retry, but store nothing.
	if (data.website) {
		return respond({ ok: true });
	}

	const answer = {
		nombre: clean(data.nombre),
		telefono: clean(data.telefono),
		// How many people the answer is for, the guest included
		personas: people(data.personas),
		ceremonia: ANSWERS.includes(data.ceremonia) ? data.ceremonia : '',
		recepcion: ANSWERS.includes(data.recepcion) ? data.recepcion : '',
		mensaje: clean(data.mensaje, MAX_MESSAGE_LENGTH),
		// The guest name from a personalized link (?para=), when the guest opened one.
		invitacion: clean(data.invitacion),
	};

	if (
		!answer.nombre ||
		!answer.telefono ||
		!answer.personas ||
		!answer.ceremonia ||
		!answer.recepcion
	) {
		return respond({ ok: false, error: 'missing-fields' });
	}

	const values = new Map([
		['Fecha', new Date()],
		['Nombre', asText(answer.nombre)],
		['Teléfono', asText(answer.telefono)],
		// A number, so the sheet can add them up
		['Personas', answer.personas],
		['Ceremonia', answer.ceremonia],
		['Recepción', answer.recepcion],
		['Mensaje', asText(answer.mensaje)],
		['Invitación', asText(answer.invitacion)],
	]);

	// Serializes concurrent submissions so rows never overwrite each other.
	const lock = LockService.getScriptLock();

	if (!lock.tryLock(10000)) {
		return respond({ ok: false, error: 'busy' });
	}

	try {
		const { sheet, headers } = getSheet();
		sheet.appendRow(headers.map((header) => (values.has(header) ? values.get(header) : '')));
	} finally {
		lock.releaseLock();
	}

	// Email and WhatsApp notices, when Notifications.gs is part of the project. Without
	// it, the script never needs permission to send anything.
	if (typeof notifyRsvp === 'function') {
		notifyRsvp(answer);
	}

	return respond({ ok: true });
}

// Opening the web app URL in a browser shows this, to check that the deployment works.
function doGet() {
	return respond({ ok: true, message: 'RSVP endpoint is running.' });
}

// The site sends JSON as text/plain (see src/scripts/rsvp.js), which arrives as a raw string.
function parseBody(e) {
	try {
		const data = JSON.parse(e.postData.contents);
		return data && typeof data === 'object' ? data : null;
	} catch {
		return null;
	}
}

// The RSVP tab and its headers, in the order they're in the sheet. Writes the header row
// on first use, and adds any of ours a tab is missing (one made by an older version of
// this script, or whose header was renamed) at the end.
function getSheet() {
	const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
	const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
	const columns = sheet.getLastColumn();
	const headers = columns
		? sheet
				.getRange(1, 1, 1, columns)
				.getValues()[0]
				.map((header) => String(header).trim())
		: [];
	const missing = HEADERS.filter((header) => !headers.includes(header));

	if (missing.length) {
		sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
		sheet.setFrozenRows(1);
	}

	return { sheet, headers: headers.concat(missing) };
}

// Trims and caps guest input.
function clean(value, maxLength = MAX_LENGTH) {
	return String(value == null ? '' : value)
		.trim()
		.slice(0, maxLength);
}

// A whole number of people from 1 to MAX_PEOPLE, or 0 for anything else.
function people(value) {
	const count = Number(value);
	return Number.isInteger(count) && count >= 1 && count <= MAX_PEOPLE ? count : 0;
}

// Sheets would evaluate values starting with = + - @ as formulas (phone numbers like
// "+52 …" included), so those are stored as plain text.
function asText(value) {
	return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function respond(body) {
	return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
		ContentService.MimeType.JSON,
	);
}
