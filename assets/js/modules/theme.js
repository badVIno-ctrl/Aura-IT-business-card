/* Theme
   ---------------------------------------------------------------------------
   Owns one piece of state: `data-theme` on <html>, either "dark" or "light".

   The stored value is applied by a tiny inline script in <head> *before* the
   stylesheet paints, so there is no flash of the wrong palette. This module
   then takes over: it syncs the checkbox, persists changes, updates the
   browser UI colour, and broadcasts `aura:theme` so the canvas can re-bake
   its sprites for the new background.

   `theme-boot` suppresses transitions during the first paint — without it
   every themed property would animate from its default on load. */
(function (Aura) {
	"use strict";

	var KEY = "aura-theme";
	var root = document.documentElement;

	function read() {
		try {
			var v = localStorage.getItem(KEY);
			return v === "light" || v === "dark" ? v : null;
		} catch (e) {
			return null;
		}
	}

	function write(mode) {
		try {
			localStorage.setItem(KEY, mode);
		} catch (e) {
			/* private mode: the theme still works, it just will not persist */
		}
	}

	/* Colours the browser chrome (Android status bar, iOS Safari bar) to match
	   the page, read from the live token so it can never drift. */
	function paintBrowserUI() {
		var meta = document.querySelector('meta[name="theme-color"]');
		if (!meta) return;
		var paper = getComputedStyle(root).getPropertyValue("--paper").trim();
		if (paper) meta.setAttribute("content", paper);
	}

	Aura.register("theme", function () {
		var input = document.getElementById("themeToggle");
		var mode = read() || root.getAttribute("data-theme") || "dark";
		if (mode !== "light") mode = "dark";

		function apply(next, persist) {
			mode = next;
			root.setAttribute("data-theme", mode);
			if (input) {
				input.checked = mode === "dark";
				input.setAttribute("aria-checked", String(input.checked));
				/* The label names the *action*, not the current state: a switch
				   already announces "on"/"off" from aria-checked, so a static
				   "Dark theme" would be read twice and answer neither question.
				   The tooltip carries the same sentence for pointer users. */
				var next_label =
					mode === "dark"
						? "Включить светлую тему"
						: "Включить тёмную тему";
				input.setAttribute("aria-label", next_label);
				if (input.parentNode && input.parentNode.setAttribute) {
					input.parentNode.setAttribute("title", next_label);
				}
			}
			paintBrowserUI();
			if (persist) write(mode);
			window.dispatchEvent(
				new CustomEvent("aura:theme", { detail: { theme: mode } })
			);
		}

		apply(mode, false);

		/* Two frames: one for the browser to paint the correct palette, one for
		   the class removal to land after that paint rather than inside it. */
		requestAnimationFrame(function () {
			requestAnimationFrame(function () {
				root.classList.remove("theme-boot");
			});
		});

		if (input) {
			input.addEventListener("change", function () {
				apply(input.checked ? "dark" : "light", true);
			});
		}

		/* Deliberately *not* following prefers-color-scheme. Dark is this site's
		   own default and the switch sits in the header; letting the OS decide
		   would mean most visitors never see the intended palette. */
	});
})(window.Aura);
