import { test, expect } from '@playwright/test';
import config from '../src/invitation.config.js';

const NAMES = `${config.couple.partner1} ${config.couple.joiner} ${config.couple.partner2}`;
const FIELDS = ['rsvp-nombre', 'rsvp-telefono', 'rsvp-personas', 'rsvp-mensaje'];

// The envelope's button pulses for as long as it waits, so it never holds still the way
// Playwright likes before clicking: check it's there, then tap it as a guest would.
async function tapEnvelope(page) {
	const button = page.getByRole('button', { name: 'Toca para abrir' });

	await expect(button).toBeVisible();
	await button.click({ force: true });
}

// Opens the envelope the way a guest does, and waits for the invitation to take over.
async function openInvitation(page, query = '') {
	await page.goto(query);
	await tapEnvelope(page);
	await expect(page.locator('#envelope')).toBeHidden({ timeout: 15_000 });
}

test('a tap opens the envelope and hands over to the invitation', async ({ page }) => {
	await page.goto('?para=Familia%20P%C3%A9rez');
	await expect(page.locator('#envelope-guest')).toContainText('Familia Pérez');
	await expect(page.locator('#invitation')).toHaveJSProperty('inert', true);

	await tapEnvelope(page);
	await expect(page.locator('#envelope')).toBeHidden({ timeout: 15_000 });
	await expect(page.locator('#invitation')).toHaveJSProperty('inert', false);
	await expect(page.locator('#invitation')).toBeFocused();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAMES);
});

test('the same tap starts the music', async ({ page, browserName }) => {
	test.skip(browserName === 'webkit', 'headless WebKit on Linux may have no audio output');

	await openInvitation(page);
	await expect
		.poll(() =>
			page.locator('#music').evaluate((audio) => !audio.paused && audio.currentTime > 0),
		)
		.toBe(true);
});

test('a link with passes says so and caps the number of people', async ({ page }) => {
	await openInvitation(page, '?para=Familia%20P%C3%A9rez&pases=4');
	await expect(page.locator('#rsvp-pases')).toHaveText('Pase para 4 personas');
	await expect(page.locator('#rsvp-personas option')).toHaveText(['–', '1', '2', '3', '4']);
});

test('the RSVP asks for what is missing, sends in demo mode and is remembered', async ({
	page,
}) => {
	await openInvitation(page);
	await page.getByLabel('Nombre completo').fill('Invitado de Ejemplo');
	await page.getByLabel('Teléfono').fill('+520000000000');
	await expect(page.getByLabel('Teléfono')).toHaveValue('+52 000 000 00 00');
	await page.getByLabel('Personas').selectOption('2');
	await page.getByLabel('Mensaje para los novios').fill('¡Felicidades!');

	const send = page.getByRole('button', { name: 'Enviar confirmación' });
	await send.click();
	await expect(page.locator('#rsvp-error')).toHaveText('Por favor responde para ambos eventos.');

	const answer = (event, value) =>
		page.getByRole('group', { name: `¿Asistirás a la ${event}?` }).getByRole('button', {
			name: value,
			exact: true,
		});
	await answer('ceremonia', 'Sí').click();
	await answer('recepción', 'No').click();
	await send.click();
	await expect(page.locator('#rsvp-success')).toBeVisible();
	await expect(page.locator('#rsvp-success')).toBeFocused();

	// Coming back on the same device
	await openInvitation(page);
	await expect(page.getByText('Ya recibimos tu respuesta. ¡Gracias!')).toBeVisible();
	await page.getByRole('button', { name: 'Enviar otra respuesta' }).click();
	await expect(page.getByLabel('Nombre completo')).toBeFocused();
});

test('form fields use 16px text, so iPhones do not zoom in on them', async ({ page }) => {
	await openInvitation(page);

	for (const id of FIELDS) {
		const size = await page
			.locator(`#${id}`)
			.evaluate((field) => parseFloat(getComputedStyle(field).fontSize));
		expect(size, id).toBeGreaterThanOrEqual(16);
	}
});

test('on the wedding day the countdown has arrived and the RSVP is closed', async ({ page }) => {
	test.skip(!config.rsvp.deadline, 'no rsvp.deadline in the config');

	await page.clock.setFixedTime(new Date(config.date));
	await openInvitation(page);
	await expect(page.locator('#cd-done')).toBeVisible();
	await expect(page.locator('#rsvp-closed')).toBeVisible();
	await expect(page.locator('#rsvp-fields')).toBeHidden();
});

test('loads nothing from other sites', async ({ page, baseURL }) => {
	const origins = new Set();
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.protocol.startsWith('http')) origins.add(url.origin);
	});

	await openInvitation(page);
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.waitForLoadState('networkidle');
	expect([...origins]).toEqual([new URL(baseURL).origin]);
});

test('serves the calendar file the add-to-calendar link points to', async ({ page }) => {
	await page.goto('');
	const href = await page.getByRole('link', { name: 'iPhone / Outlook' }).getAttribute('href');
	const response = await page.request.get(new URL(href, page.url()).href);

	expect(response.headers()['content-type']).toContain('text/calendar');
	expect(await response.text()).toContain(`SUMMARY:Boda de ${NAMES}`);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the invitation shows right away, with no envelope', async ({ page }) => {
		await page.goto('');
		await expect(page.locator('#envelope')).toBeHidden();
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	});
});

test.describe('with reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('the envelope fades away and the content is there, unanimated', async ({ page }) => {
		await openInvitation(page);
		await expect(page.locator('.invitation > header')).toHaveCSS('opacity', '1');
	});
});
