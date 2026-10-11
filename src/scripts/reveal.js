// ---- Scroll reveal animation ----
// main.scss only hides the header and sections when the `js` class is set (see index.html)
// and the visitor hasn't asked for reduced motion. With reduced motion there's nothing to
// animate, so everything is marked visible right away and no observer is created.
//
// It starts once the envelope is opened (see main.js), so the first screen animates in
// for the guest instead of behind the envelope.
const STAGGER_MS = 150;

export function initReveal() {
	const blocks = document.querySelectorAll('.invitation > :is(header, section)');
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (reduceMotion || !('IntersectionObserver' in window)) {
		blocks.forEach((block) => block.classList.add('is-visible'));
		return;
	}

	const revealObserver = new IntersectionObserver(
		(entries) => {
			entries
				.filter((entry) => entry.isIntersecting)
				.forEach((entry, index) => {
					// Blocks that come into view together, like the whole first screen,
					// appear one after another rather than all at once.
					entry.target.style.transitionDelay = `${index * STAGGER_MS}ms`;
					entry.target.classList.add('is-visible');
					revealObserver.unobserve(entry.target);
				});
		},
		{
			threshold: 0.15,
			rootMargin: '0px 0px -80px 0px',
		},
	);

	blocks.forEach((block) => revealObserver.observe(block));
}
