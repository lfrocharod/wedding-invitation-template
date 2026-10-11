/**
 * RSVP backend for the wedding invitation template.
 *
 * Bound to a Google Sheet (Extensions > Apps Script) and deployed as a web app, it
 * receives the RSVP form as JSON and appends one row per answer to the "RSVP" tab,
 * creating the tab and its header row on first use. Setup steps are in README.md.
 */

/* exported doGet, doPost */

const SHEET_NAME = 'RSVP';
const HEADERS = ['Fecha', 'Nombre', 'Teléfono', 'Ceremonia', 'Recepción'];
const ANSWERS = ['Sí', 'No'];
const MAX_LENGTH = 100;

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

	const row = [
		new Date(),
		clean(data.nombre),
		clean(data.telefono),
		ANSWERS.includes(data.ceremonia) ? data.ceremonia : '',
		ANSWERS.includes(data.recepcion) ? data.recepcion : '',
	];

	if (row.slice(1).some((value) => !value)) {
		return respond({ ok: false, error: 'missing-fields' });
	}

	// Serializes concurrent submissions so rows never overwrite each other.
	const lock = LockService.getScriptLock();

	if (!lock.tryLock(10000)) {
		return respond({ ok: false, error: 'busy' });
	}

	try {
		getSheet().appendRow(row);
	} finally {
		lock.releaseLock();
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

function getSheet() {
	const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
	const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);

	if (sheet.getLastRow() === 0) {
		sheet.appendRow(HEADERS);
		sheet.setFrozenRows(1);
	}

	return sheet;
}

// Trims and caps guest input. Sheets would evaluate values starting with = + - @ as
// formulas (phone numbers like "+52 …" included), so those are stored as plain text.
function clean(value) {
	const text = String(value == null ? '' : value)
		.trim()
		.slice(0, MAX_LENGTH);
	return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function respond(body) {
	return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
		ContentService.MimeType.JSON,
	);
}
