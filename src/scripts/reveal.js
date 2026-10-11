// ---- Scroll reveal animation ----
// main.scss only hides sections when the `js` class is set (see index.html) and the
// visitor hasn't asked for reduced motion. With reduced motion there's nothing to
// animate, so every section is marked visible right away and no observer is created.
export function initReveal() {
	const sections = document.querySelectorAll('.invitation > section');
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (reduceMotion || !('IntersectionObserver' in window)) {
		sections.forEach((section) => section.classList.add('is-visible'));
		return;
	}

	const revealObserver = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add('is-visible');
					revealObserver.unobserve(entry.target);
				}
			});
		},
		{
			threshold: 0.15,
			rootMargin: '0px 0px -80px 0px',
		},
	);

	sections.forEach((section) => revealObserver.observe(section));
}
