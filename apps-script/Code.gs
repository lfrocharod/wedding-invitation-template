/**
 * RSVP backend for the wedding invitation template.
 *
 * Bound to a Google Sheet (Extensions > Apps Script) and deployed as a web app, it
 * receives the RSVP form as JSON and appends one row per answer to the "RSVP" tab,
 * creating the tab and its header row on first use (a tab made by an older version
 * gets the headers of the columns added since). Setup steps are in README.md.
 */

/* exported doGet, doPost */

const SHEET_NAME = 'RSVP';
const HEADERS = ['Fecha', 'Nombre', 'Teléfono', 'Ceremonia', 'Recepción', 'Invitación'];
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

	const answer = {
		nombre: clean(data.nombre),
		telefono: clean(data.telefono),
		ceremonia: ANSWERS.includes(data.ceremonia) ? data.ceremonia : '',
		recepcion: ANSWERS.includes(data.recepcion) ? data.recepcion : '',
		// The guest name from a personalized link (?para=), when the guest opened one.
		invitacion: clean(data.invitacion),
	};

	if (!answer.nombre || !answer.telefono || !answer.ceremonia || !answer.recepcion) {
		return respond({ ok: false, error: 'missing-fields' });
	}

	const row = [
		new Date(),
		asText(answer.nombre),
		asText(answer.telefono),
		answer.ceremonia,
		answer.recepcion,
		asText(answer.invitacion),
	];

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
	const columns = sheet.getLastColumn();

	// Writes the header row on first use, or the headers a tab made by an older version
	// of this script is missing.
	if (columns < HEADERS.length) {
		sheet
			.getRange(1, columns + 1, 1, HEADERS.length - columns)
			.setValues([HEADERS.slice(columns)]);
		sheet.setFrozenRows(1);
	}

	return sheet;
}

// Trims and caps guest input.
function clean(value) {
	return String(value == null ? '' : value)
		.trim()
		.slice(0, MAX_LENGTH);
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
