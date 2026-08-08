/* Shared runtime helpers, device profile and the module registry.
   Every feature module registers an init function here; main.js boots them
   in a fixed order so behaviour matches the original single-file build. */
(function (global) {
	"use strict";

	var mq = global.matchMedia ? function (q) { return global.matchMedia(q); } : null;
	var match = function (q) { return !!(mq && mq(q).matches); };

	/* ---- device profile -------------------------------------------------
	   Resolved once at load. Touch pointers, small viewports and low-core
	   devices get a cheaper render path: the same scene, fewer pixels and
	   no per-frame filter work. */
	var coarse = match("(pointer:coarse)") || !match("(hover:hover)");
	var cores = global.navigator && navigator.hardwareConcurrency || 8;
	var mem = global.navigator && navigator.deviceMemory || 8;
	var small = (global.innerWidth || 1200) < 900;
	/* Save-Data is the one signal in this block that is not a guess: it is the
	   visitor saying outright that they want less. It is set by phone data
	   savers and by every browser lite mode, which between them correlate
	   almost exactly with the hardware this tier exists for. */
	var thrift = !!(
		global.navigator &&
		navigator.connection &&
		navigator.connection.saveData
	);
	var weak = cores <= 4 || mem <= 4 || thrift;

	var Aura = {
		/* Motion and input capability flags. */
		RM: match("(prefers-reduced-motion: reduce)"),
		FINE: match("(hover:hover) and (pointer:fine)"),
		/* MOBILE drives every "cheap path" decision in the codebase. */
		MOBILE: coarse || small,
		/* LOW is the extra step down for weak hardware of any size. */
		LOW: weak || ((coarse || small) && cores <= 6),

		/* ---- the frame budget -------------------------------------------
		   Every animated module used to carry its own copy of the same guess:
		   `Aura.MOBILE ? 33 : 16`. Five copies, five hardcoded numbers, one
		   assumption - that a touch pointer means a slow device. It does not.
		   MOBILE is `pointer:coarse || width < 900`, so a current 120Hz phone
		   that renders this page without breaking a sweat was being held to
		   30fps, while a genuinely weak laptop with a mouse ran uncapped. The
		   flag answers "is this a touch screen", and it was being asked "how
		   fast is this machine".

		   So stop guessing and measure. `beat` is fed the rAF timestamp by
		   every animated module; the first module to arrive in a frame takes
		   the sample and the rest are ignored, so the cost is one subtraction
		   per frame no matter how many effects are live. The interval between
		   frames is the ground truth of smoothness - it already contains the
		   layout, the paint, the compositing and whatever else the device is
		   doing - and it needs no instrumentation inside any effect.

		   Falling back is not a defeat. A device that cannot hold 60 delivers
		   an uneven 40-50, and uneven is what actually reads as broken; pinned
		   at 30 the same device looks deliberate. The thresholds are wide
		   apart (24ms down, 19ms up) and both need a long run of agreement, so
		   a single slow frame from a garbage collection or an image decode
		   cannot flip it, and it cannot oscillate. */
		frameMs: 16,
		_bTs: 0, _bAvg: 16.7, _bSlow: 0, _bFast: 0,
		beat: function (ts) {
			if (ts === Aura._bTs) return;
			var d = ts - Aura._bTs;
			Aura._bTs = ts;
			/* The first frame, a backgrounded tab and a resumed one are not
			   evidence about the hardware. Throw them away. */
			if (!(d > 0) || d > 120) return;
			Aura._bAvg += (d - Aura._bAvg) * 0.08;
			if (Aura._bAvg > 24) { Aura._bSlow++; Aura._bFast = 0; }
			else if (Aura._bAvg < 19) { Aura._bFast++; Aura._bSlow = 0; }
			if (Aura._bSlow > 45 && Aura.frameMs < 33) { Aura.frameMs = 33; Aura._bSlow = 0; }
			else if (Aura._bFast > 150 && Aura.frameMs > 16) { Aura.frameMs = 16; Aura._bFast = 0; }
		},

		$: function (sel, root) {
			return (root || document).querySelector(sel);
		},
		$$: function (sel, root) {
			return Array.prototype.slice.call((root || document).querySelectorAll(sel));
		},

		/* ---- scroll orchestration ---------------------------------------
		   A page-wide single passive listener that flushes every subscriber
		   inside one animation frame. Separate listeners each doing their own
		   getBoundingClientRect() force several layout passes per scroll tick;
		   batching them keeps it to one. */
		_subs: [],
		_queued: false,
		/* Signed scroll velocity in px per frame, smoothed. Published once here so
		   effects can react to "how hard the page was thrown" without any of them
		   keeping its own listener. */
		vel: 0,
		_lastY: 0,
		_flush: function () {
			Aura._queued = false;
			var y = global.pageYOffset || document.documentElement.scrollTop || 0;
			var dy = y - Aura._lastY;
			Aura._lastY = y;
			Aura.vel += (Math.max(-140, Math.min(140, dy)) - Aura.vel) * 0.35;
			for (var i = 0; i < Aura._subs.length; i++) {
				try { Aura._subs[i](y); }
				catch (err) { if (global.console && console.error) console.error("[aura] scroll", err); }
			}
		},
		_schedule: function () {
			if (Aura._queued) return;
			Aura._queued = true;
			requestAnimationFrame(Aura._flush);
		},
		/* Subscribe to batched scroll updates. Runs once immediately so the
		   caller never has to duplicate its own initial sync. */
		onScroll: function (fn) {
			Aura._subs.push(fn);
			fn(global.pageYOffset || 0);
			return fn;
		},

		/* Debounced resize, shared for the same reason. */
		_rsubs: [],
		onResize: function (fn) {
			Aura._rsubs.push(fn);
			return fn;
		},

		_mods: {},
		register: function (name, fn) {
			this._mods[name] = fn;
		},
		run: function (name) {
			var fn = this._mods[name];
			if (typeof fn !== "function") return;
			try {
				fn();
			} catch (err) {
				/* One broken module must never take the whole page down. */
				if (global.console && console.error) console.error("[aura] " + name, err);
			}
		}
	};

	/* Weak hardware starts conservative and is allowed to earn its way up;
	   everything else starts at 60 and is allowed to fall back. */
	Aura.frameMs = Aura.LOW ? 33 : 16;

	global.addEventListener("scroll", Aura._schedule, { passive: true });

	var rt = 0;
	global.addEventListener("resize", function () {
		clearTimeout(rt);
		rt = setTimeout(function () {
			var w = global.innerWidth || 1200;
			Aura.MOBILE = coarse || w < 900;
			for (var i = 0; i < Aura._rsubs.length; i++) {
				try { Aura._rsubs[i](); }
				catch (err) { if (global.console && console.error) console.error("[aura] resize", err); }
			}
			Aura._flush();
		}, 140);
	}, { passive: true });

	/* Expose the profile to CSS so styling decisions stay in the stylesheet. */
	var de = document.documentElement;
	de.classList.add(Aura.MOBILE ? "is-lite" : "is-rich");
	if (Aura.LOW) de.classList.add("is-low");

	global.Aura = Aura;
})(window);
