/* Boot sequence.
   Order is deliberate: structure and chrome first, heavy canvas next, content
   widgets after, and the entry scene last. Last matters twice over — it splits
   headings and casts every element in the composition, so it has to run against
   a settled layout, and the project cards it choreographs do not exist until
   portfolio.js has built them. */
(function (Aura) {
	"use strict";

	var ORDER = [
		"theme",
		"backdrop",
		"header",
		"cards",
		"hero-aura",
		"portal",
		"terminal",
		"process",
		"portfolio",
		"form",
		"waves",
		"ripples",
		"thread",
		"enter"
	];

	/* The five modules that own a canvas or rebuild a path every frame. Each
	   one paints something that is either behind the entry plate or below the
	   fold for as long as the plate is up, so on a weak device not one of them
	   has a reason to be competing with the opening for the same core.

	   Measured on a 2-core/4GB profile at 1/6 CPU: booting all fourteen in one
	   task gave the opening 4.8fps, a 117ms median frame, and one frame that
	   took 966ms. */
	var HEAVY = ["backdrop", "hero-aura", "waves", "ripples", "thread"];

	var started = false;
	function heavy() {
		if (started) return;
		started = true;
		HEAVY.forEach(function (name) {
			Aura.run(name);
		});
	}

	function boot() {
		var root = document.documentElement;

		/* `enter-armed` is written by a blocking script in the head, so this is
		   already decided by the time boot runs - and it is absent in exactly
		   the cases where there is no scene to protect: reduced motion, or the
		   watchdog having already given up. A full-power device boots everything
		   at once exactly as before; there is nothing to win by staggering a
		   machine that was not dropping frames in the first place. */
		var stage =
			Aura.MOBILE &&
			root.classList.contains("enter-armed") &&
			!root.classList.contains("enter-done");

		ORDER.forEach(function (name) {
			if (stage && HEAVY.indexOf(name) !== -1) return;
			Aura.run(name);
		});

		if (!stage) {
			heavy();
			return;
		}

		/* The scene reports its own end, and the watchdog in the head guarantees
		   that report inside 3.6s even if enter.js threw or never loaded - so
		   this cannot strand the page without its canvases. Tested once up front
		   in case the class landed while the modules above were still booting,
		   which on a slow device is a real window and not a theoretical one. */
		if (root.classList.contains("enter-done")) {
			heavy();
			return;
		}
		var mo = new MutationObserver(function () {
			if (root.classList.contains("enter-done")) {
				mo.disconnect();
				heavy();
			}
		});
		mo.observe(root, { attributes: true, attributeFilter: ["class"] });
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}
})(window.Aura);
