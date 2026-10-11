/**
 * Everything that changes from one wedding to the next lives here.
 *
 * plugins/vite-plugin-invitation.js injects these values into index.html at build
 * time (and on every dev-server request), so the visible text and the Open Graph
 * tags used for WhatsApp link previews are part of the static HTML.
 *
 * In text values, "\n" becomes a line break; arrays render one item per line.
 * The site copy is in Spanish.
 */
export default {
	site: {
		// Public URL of the deployed site, without a trailing slash. Used for og:url and
		// for the absolute og:image URL that WhatsApp needs to show the preview image.
		// Its path is also the base the site is built for (e.g. /<repo>/ on GitHub Pages).
		url: 'https://lfrocharod.github.io/wedding-invitation-template',
		description: 'Acompáñanos a celebrar esta nueva etapa.',
		ogImage: '/assets/images/og-image.jpg',
		ogImageAlt: 'Ilustración de un auto de recién casados con el texto «¡Vámonos a celebrar!»',
	},

	couple: {
		partner1: 'Valeria',
		partner2: 'Daniel',
		// Joins the two names in the page title, link preview and header ("&" or "y").
		joiner: '&',
		photo: '/assets/images/photo-placeholder.svg',
	},

	// Ceremony start in ISO 8601 with the venue's UTC offset (Mexico City: -06:00).
	// The countdown targets this moment and the displayed date is derived from it.
	date: '2027-05-15T17:00:00-06:00',

	intro: 'Acompáñanos a celebrar\nesta nueva etapa',

	ceremony: {
		venue: 'Parroquia de Ejemplo',
		time: '5:00 pm',
		// Paste the venue's "Share" link from Google Maps here.
		mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Parroquia+de+Ejemplo',
	},

	reception: {
		venue: 'Salón de Ejemplo',
		time: '7:30 pm',
		mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Sal%C3%B3n+de+Ejemplo',
	},

	// "Agregar al calendario" under the countdown: a Google Calendar link and an .ics file
	// (iPhone, Outlook) for one event that starts at `date`, at the ceremony venue, with
	// both venues and the invitation link in its description.
	calendar: {
		// How long the celebration lasts, in hours.
		hours: 8,
	},

	dressCode: {
		// Drawn into dresscode.webp; repeated here as text for screen readers.
		style: 'Etiqueta rigurosa',
		note: 'hombres estrictamente con traje en tonos oscuros',
		// Inspiration boards behind the "Mujer" / "Hombre" buttons of the illustration.
		inspiration: {
			women: 'https://www.pinterest.com/search/pins/?q=vestido%20de%20gala',
			men: 'https://www.pinterest.com/search/pins/?q=traje%20oscuro%20formal',
		},
	},

	gifts: {
		message:
			'Nuestro mayor regalo es contar con\nsu compañía, sin embargo, si deseas\nhacernos un obsequio, te compartimos\nnuestros datos bancarios.\n¡Te agradecemos de corazón!',
		// Example data only. A gift registry name and event number work here too.
		details: [
			'Nombre de Ejemplo',
			'Banco: Banco de Ejemplo',
			'CLABE: 000 000 00000000000 0',
			'(datos de ejemplo)',
		],
	},

	rsvp: {
		intro: 'Agradecemos responder este formulario indicando la confirmación o no de su asistencia a los siguientes eventos',
		note: '¡No niños!',
		success: '¡Gracias por confirmar! Nos vemos pronto.',
	},

	// Background song. It starts when the guest opens the envelope (browsers only allow
	// sound after a tap) and has no visible player. MP3 plays in every browser.
	music: {
		// Add #t=<seconds> to skip a long intro, e.g. '/assets/audio/song.mp3#t=12'.
		src: '/assets/audio/song.mp3',
		// From 0 to 1. iPhones ignore it and play at the device volume.
		volume: 0.7,
	},
};
