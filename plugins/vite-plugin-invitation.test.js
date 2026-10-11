import { test } from 'node:test';
import assert from 'node:assert/strict';
import invitation from './vite-plugin-invitation.js';

const config = {
	site: { url: 'https://example.com/boda/', description: 'Línea 1\nLínea 2' },
	couple: { partner1: 'ángela', partner2: 'Daniel', joiner: '&' },
	date: '2027-05-15T17:00:00-06:00',
	gifts: { details: ['Banco: <Ejemplo>', 'CLABE: 000'] },
};

function render(html, overrides = {}) {
	return invitation({ ...config, ...overrides }).transformIndexHtml.handler(html);
}

test('fills text placeholders, escaping HTML and turning line breaks into <br />', () => {
	assert.equal(render('<p>{{ site.description }}</p>'), '<p>Línea 1<br />Línea 2</p>');
	assert.equal(
		render('<p>{{ gifts.details }}</p>'),
		'<p>Banco: &lt;Ejemplo&gt;<br />CLABE: 000</p>',
	);
});

test('in attributes, collapses line breaks and joins lists with commas', () => {
	assert.equal(
		render('<meta content="{{ site.description }}" />'),
		'<meta content="Línea 1 Línea 2" />',
	);
	assert.equal(
		render('<img alt="{{ gifts.details }}" />'),
		'<img alt="Banco: &lt;Ejemplo&gt;, CLABE: 000" />',
	);
});

test('derives the names, the initials for the wax seal and the date parts', () => {
	assert.equal(render('{{ couple.names }}'), 'ángela &amp; Daniel');
	assert.equal(render('{{ couple.initials.partner1 }}{{ couple.initials.partner2 }}'), 'ÁD');
	assert.equal(
		render('{{ date.day }} {{ date.month }} {{ date.monthShort }} {{ date.year }}'),
		'15 Mayo May 2027',
	);
});

test('takes the calendar date at the venue, whatever the time zone of the build', () => {
	// 23:30 in Mexico City is already the 16th in UTC.
	assert.equal(render('{{ date.day }}', { date: '2027-05-15T23:30:00-06:00' }), '15');
});

test('drops the trailing slash from site.url', () => {
	assert.equal(render('{{ site.url }}/'), 'https://example.com/boda/');
});

test('fails the build on a placeholder the config does not have', () => {
	assert.throws(() => render('{{ couple.nickname }}'), /couple\.nickname/);
});

test('fails the build on a date without a time', () => {
	assert.throws(() => render('', { date: '2027-05-15' }), /ISO 8601/);
});

test('fails the build when a partner has no name', () => {
	assert.throws(() => render('', { couple: { ...config.couple, partner2: ' ' } }), /partner/);
});
