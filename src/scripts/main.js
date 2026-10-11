import '../styles/main.scss';
import { initEnvelope } from './envelope.js';
import { initMusic, playMusic } from './music.js';
import { initReveal } from './reveal.js';
import { initCountdown } from './countdown.js';
import { initRsvp } from './rsvp.js';

initMusic();
initEnvelope({
	// The guest's tap on the envelope is what allows the song to play.
	onOpen: playMusic,
	// The invitation animates in once the envelope is gone.
	onOpened: initReveal,
});
initCountdown();
initRsvp();
