/**
 * Optional RSVP notifications for Code.gs: an email and/or a WhatsApp message with each
 * answer, so the couple hears about it without opening the sheet.
 *
 * Add this file to the Apps Script project next to Code.gs, then turn on what you want in
 * Project Settings > Script properties (setup steps in README.md):
 *
 *   NOTIFY_EMAIL      one or more email addresses, separated by commas
 *   CALLMEBOT_PHONE   the WhatsApp number to notify, with its country code
 *   CALLMEBOT_APIKEY  that number's CallMeBot API key
 *
 * Run sendTestNotification once from the editor: it asks for the permissions this file
 * needs (sending email, calling CallMeBot) and sends a test answer to each channel.
 */

/* exported notifyRsvp, sendTestNotification */

const CALLMEBOT_URL = 'https://api.callmebot.com/whatsapp.php';

// Called by doPost once the answer is in the sheet. Returns how many channels it tried.
function notifyRsvp(answer) {
	const settings = PropertiesService.getScriptProperties().getProperties();
	const email = (settings.NOTIFY_EMAIL || '').trim();
	const phone = (settings.CALLMEBOT_PHONE || '').trim();
	const apiKey = (settings.CALLMEBOT_APIKEY || '').trim();
	const details = [
		`Personas: ${answer.personas}`,
		`Ceremonia: ${answer.ceremonia}`,
		`Recepción: ${answer.recepcion}`,
		`Teléfono: ${answer.telefono}`,
	];

	if (answer.invitacion) {
		details.push(`Invitación: ${answer.invitacion}`);
	}

	if (answer.mensaje) {
		details.push(`Mensaje: ${answer.mensaje}`);
	}

	let channels = 0;

	if (email) {
		channels++;
		attempt('email', () =>
			MailApp.sendEmail({
				to: email,
				name: 'Invitación de boda',
				subject: `Nueva respuesta: ${answer.nombre}`,
				body: [
					`${answer.nombre} respondió a la invitación.`,
					'',
					...details,
					'',
					`Todas las respuestas: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`,
				].join('\n'),
			}),
		);
	}

	if (phone && apiKey) {
		channels++;
		attempt('WhatsApp', () => {
			const text = [`💌 *${answer.nombre}* respondió a la invitación`, ...details].join('\n');
			const response = UrlFetchApp.fetch(
				`${CALLMEBOT_URL}?phone=${encodeURIComponent(phone)}` +
					`&apikey=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(text)}`,
				{ muteHttpExceptions: true },
			);
			// CallMeBot replies with a short HTML page; keep its text for the log.
			const reply = response
				.getContentText()
				.replace(/<[^>]*>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 200);

			if (response.getResponseCode() !== 200) {
				throw new Error(`CallMeBot answered HTTP ${response.getResponseCode()}: ${reply}`);
			}

			return `CallMeBot: ${reply}`;
		});
	}

	return channels;
}

// Run it from the Apps Script editor (select it in the toolbar, then Run) to grant the
// permissions and check that the messages arrive. The results show up in the log.
function sendTestNotification() {
	const channels = notifyRsvp({
		nombre: 'Invitado de prueba',
		telefono: '+52 000 000 00 00',
		personas: 2,
		ceremonia: 'Sí',
		recepcion: 'Sí',
		mensaje: '¡Muchas felicidades!',
		invitacion: 'Familia de prueba',
	});

	if (!channels) {
		console.warn(
			'Nothing to send: add NOTIFY_EMAIL, or CALLMEBOT_PHONE and CALLMEBOT_APIKEY, ' +
				'in Project Settings > Script properties.',
		);
	}
}

// A notification that fails is logged (see Executions), never thrown: the answer is
// already in the sheet, and the guest shouldn't be told it wasn't saved.
function attempt(channel, send) {
	try {
		const result = send();
		console.log(`RSVP notification sent by ${channel}.`, result || '');
	} catch (error) {
		console.error(`RSVP notification by ${channel} failed:`, error);
	}
}
