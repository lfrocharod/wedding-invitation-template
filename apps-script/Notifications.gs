/**
 * Optional RSVP notifications for Code.gs: each answer by email, WhatsApp and/or Telegram,
 * so the couple hears about it without opening the sheet.
 *
 * Add this file to the Apps Script project next to Code.gs, then turn on the channels you
 * want in Project Settings > Script properties (setup steps in README.md):
 *
 *   NOTIFY_EMAIL       one or more email addresses, separated by commas
 *
 *   WHATSAPP_TOKEN     access token for the WhatsApp Business Platform (Meta's Cloud API)
 *   WHATSAPP_PHONE_ID  ID of the WhatsApp number the messages come from
 *   WHATSAPP_TO        numbers to notify, with their country code, separated by commas
 *   WHATSAPP_TEMPLATE  name of the approved message template (its text is in README.md)
 *   WHATSAPP_LANGUAGE  the template's language code; optional, es_MX by default
 *
 *   TELEGRAM_TOKEN     the token @BotFather gives your bot
 *   TELEGRAM_CHAT_ID   chats to notify, separated by commas (findTelegramChats lists them)
 *
 * Run sendTestNotification once from the editor: it asks for the permissions this file
 * needs (sending email, connecting to WhatsApp and Telegram) and sends a test answer to
 * each channel that's set up.
 */

/* exported notifyRsvp, sendTestNotification, findTelegramChats */

const WHATSAPP_API = 'https://graph.facebook.com/v25.0';
const TELEGRAM_API = 'https://api.telegram.org';

// Called by doPost once the answer is in the sheet. Returns how many channels it tried.
function notifyRsvp(answer) {
	const settings = PropertiesService.getScriptProperties().getProperties();
	const setting = (name) => String(settings[name] || '').trim();
	const list = (name) =>
		setting(name)
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	const people = `${answer.personas} ${answer.personas === 1 ? 'persona' : 'personas'}`;
	const details = [
		`Personas: ${answer.personas}`,
		`Ceremonia: ${answer.ceremonia}`,
		`Recepción: ${answer.recepcion}`,
		`Teléfono: ${answer.telefono}`,
	];
	const notes = [];

	if (answer.invitacion) {
		notes.push(`Invitación: ${answer.invitacion}`);
	}

	if (answer.mensaje) {
		notes.push(`Mensaje: ${answer.mensaje}`);
	}

	let channels = 0;

	if (setting('NOTIFY_EMAIL')) {
		channels++;
		attempt('email', () =>
			MailApp.sendEmail({
				to: setting('NOTIFY_EMAIL'),
				name: 'Invitación de boda',
				subject: `Nueva respuesta: ${answer.nombre} (${people})`,
				body: [
					`${answer.nombre} respondió a la invitación.`,
					'',
					...details,
					...notes,
					'',
					`Todas las respuestas: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`,
				].join('\n'),
			}),
		);
	}

	const whatsappTo = list('WHATSAPP_TO');

	if (
		setting('WHATSAPP_TOKEN') &&
		setting('WHATSAPP_PHONE_ID') &&
		setting('WHATSAPP_TEMPLATE') &&
		whatsappTo.length
	) {
		channels++;
		attempt('WhatsApp', () => {
			// The template's {{1}} to {{6}}, in order (see README.md)
			const values = [
				answer.nombre,
				people,
				answer.ceremonia,
				answer.recepcion,
				answer.telefono,
				notes.join(' · '),
			].map(templateValue);

			return whatsappTo
				.map((to) =>
					sendWhatsApp({
						token: setting('WHATSAPP_TOKEN'),
						phoneId: setting('WHATSAPP_PHONE_ID'),
						template: setting('WHATSAPP_TEMPLATE'),
						language: setting('WHATSAPP_LANGUAGE') || 'es_MX',
						to,
						values,
					}),
				)
				.join(', ');
		});
	}

	const telegramChats = list('TELEGRAM_CHAT_ID');

	if (setting('TELEGRAM_TOKEN') && telegramChats.length) {
		channels++;
		attempt('Telegram', () => {
			const text = [
				`💌 ${answer.nombre} respondió a la invitación`,
				...details,
				...notes,
			].join('\n');

			return telegramChats
				.map((chat) => sendTelegram(setting('TELEGRAM_TOKEN'), chat, text))
				.join(', ');
		});
	}

	return channels;
}

// Business-initiated WhatsApp messages have to use a template Meta has approved. Returns
// the message ID WhatsApp gives back.
function sendWhatsApp({ token, phoneId, template, language, to, values }) {
	const response = UrlFetchApp.fetch(`${WHATSAPP_API}/${encodeURIComponent(phoneId)}/messages`, {
		method: 'post',
		contentType: 'application/json',
		headers: { Authorization: `Bearer ${token}` },
		payload: JSON.stringify({
			messaging_product: 'whatsapp',
			recipient_type: 'individual',
			to: to.replace(/\D/g, ''),
			type: 'template',
			template: {
				name: template,
				language: { code: language },
				components: [
					{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) },
				],
			},
		}),
		muteHttpExceptions: true,
	});
	const reply = parseJson(response.getContentText());

	if (response.getResponseCode() !== 200) {
		const reason = reply.error ? reply.error.message : response.getContentText();
		throw new Error(`WhatsApp answered HTTP ${response.getResponseCode()}: ${reason}`);
	}

	return reply.messages && reply.messages[0] ? reply.messages[0].id : 'sent';
}

// WhatsApp rejects template values with line breaks, tabs or runs of spaces, and empty ones.
function templateValue(value) {
	return (
		String(value == null ? '' : value)
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 300) || '—'
	);
}

function sendTelegram(token, chatId, text) {
	const response = UrlFetchApp.fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
		method: 'post',
		contentType: 'application/json',
		payload: JSON.stringify({ chat_id: chatId, text }),
		muteHttpExceptions: true,
	});
	const reply = parseJson(response.getContentText());

	if (!reply.ok) {
		throw new Error(
			`Telegram answered HTTP ${response.getResponseCode()}: ${reply.description || 'no reason given'}`,
		);
	}

	return `chat ${chatId}`;
}

// Run it from the editor once each person has sent /start to the Telegram bot: it logs the
// chats the bot has heard from in the last 24 hours, with the ID for TELEGRAM_CHAT_ID.
function findTelegramChats() {
	const token = String(
		PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN') || '',
	).trim();

	if (!token) {
		console.warn('Add TELEGRAM_TOKEN in Project Settings > Script properties first.');
		return [];
	}

	const response = UrlFetchApp.fetch(`${TELEGRAM_API}/bot${token}/getUpdates`, {
		muteHttpExceptions: true,
	});
	const reply = parseJson(response.getContentText());

	if (!reply.ok) {
		console.error(`Telegram answered HTTP ${response.getResponseCode()}:`, reply.description);
		return [];
	}

	const chats = new Map();

	reply.result.forEach((update) => {
		const chat = update.message && update.message.chat;

		if (chat) {
			const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
			chats.set(chat.id, name || chat.title || chat.username || '');
		}
	});

	if (!chats.size) {
		console.warn('No chats yet: send /start to your bot from Telegram, then run this again.');
	}

	chats.forEach((name, id) => console.log(`${name}: ${id}`));
	return [...chats.keys()];
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
			'Nothing to send: add NOTIFY_EMAIL, the WHATSAPP_ or the TELEGRAM_ settings in ' +
				'Project Settings > Script properties.',
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

function parseJson(text) {
	try {
		return JSON.parse(text) || {};
	} catch {
		return {};
	}
}
